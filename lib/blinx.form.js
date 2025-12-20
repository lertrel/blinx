
import { validateField } from './blinx.validate.js';
import { EventTypes } from './blinx.store.js';
import { RegisteredUI } from './blinx.registered-ui.js';

// Prevent handler accumulation when blinxForm is called multiple times
// with the same DOM controls (common in tests and re-renders).
const CONTROL_CLICK_BINDINGS = new WeakMap();
const ROOT_CLEANUP = Symbol('blinxFormCleanup');

function bindClick(controlEl, role, handler) {
  if (!controlEl) return () => {};
  let bindings = CONTROL_CLICK_BINDINGS.get(controlEl);
  if (!bindings) {
    bindings = new Map();
    CONTROL_CLICK_BINDINGS.set(controlEl, bindings);
  }
  const prev = bindings.get(role);
  if (prev) controlEl.removeEventListener('click', prev);
  bindings.set(role, handler);
  controlEl.addEventListener('click', handler);
  return () => {
    const current = bindings.get(role);
    if (current === handler) {
      controlEl.removeEventListener('click', handler);
      bindings.delete(role);
    }
  };
}

export function blinxForm({
  root, view, store,
  // Optional: declarative data-view selection when a multi-view store manager is provided.
  // - "active": bind to the manager's active view (proxy behavior).
  // - any other string: resolves to store.view(name) / store.collection(name).
  dataView,
  recordIndex = 0,
  controls = {
    saveButtonId: null,
    resetButtonId: null,
    nextButtonId: null,
    prevButtonId: null,
    createButtonId: null,
    deleteButtonId: null,
    recordIndicatorId: null,
    saveStatusId: null,
  }
}) {
  // Resolve declarative data view (if requested).
  if (dataView && typeof dataView === 'string') {
    if (dataView !== 'active') {
      if (store && typeof store.view === 'function') store = store.view(dataView);
      else if (store && typeof store.collection === 'function') store = store.collection(dataView);
      else throw new Error('blinxForm: dataView requires a multi-view store (with view()/collection()).');
    }
  }

  // Resolve declarative UI view by key (if provided as string).
  if (typeof view === 'string') {
    const uiViews = (store && typeof store.getUIViews === 'function')
      ? store.getUIViews()
      : (store && typeof store.getModel === 'function' ? store.getModel()?.uiViews : null);
    const resolved = uiViews && typeof uiViews === 'object' ? uiViews[view] : null;
    if (!resolved) throw new Error(`blinxForm: unknown ui view "${String(view)}".`);
    view = resolved;
  }

  if (!store || typeof store.getModel !== 'function') {
    throw new Error('blinxForm requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxForm requires the store model to define fields.');
  }

  RegisteredUI.__internal_onRenderStart();

  const uiCache = new Map();
  const defaultRendererName = view?.renderer || 'default';

  function getUI(name = defaultRendererName) {
    const key = name ?? defaultRendererName;
    if (uiCache.has(key)) return uiCache.get(key);
    const resolved = RegisteredUI.get(key);
    uiCache.set(key, resolved);
    return resolved;
  }

  // Pre-resolve any renderer names referenced by this view for early failure and per-instance caching.
  getUI(defaultRendererName);
  (view?.sections || []).forEach(section => {
    (section?.fields || []).forEach(f => {
      if (f && typeof f === 'object' && f.renderer) getUI(f.renderer);
    });
  });

  // If the same root is re-rendered, clean up prior subscriptions/handlers first.
  if (root && typeof root[ROOT_CLEANUP] === 'function') {
    try { root[ROOT_CLEANUP](); } catch { /* ignore */ }
  }

  root.innerHTML = '';

  let currentIndex = recordIndex;
  let sectionEls = [];
  let internalChangeDepth = 0;
  let pendingResetSync = null;
  const cleanupFns = [];

  const trackedStoreEvents = new Set([
    EventTypes.add,
    EventTypes.remove,
    EventTypes.update,
    EventTypes.commit,
    EventTypes.reset,
    EventTypes.viewChanged,
  ]);

  const externalStatusMessages = {
    [EventTypes.add]: 'Record added elsewhere; refreshed view.',
    [EventTypes.remove]: 'Record removed elsewhere; refreshed view.',
    [EventTypes.update]: 'Record updated elsewhere; refreshed view.',
    [EventTypes.commit]: 'Changes committed elsewhere; refreshed view.',
    [EventTypes.reset]: 'Store reset elsewhere; refreshed view.',
    [EventTypes.viewChanged]: 'View changed; refreshed view.',
  };

  const dom = {
    saveBtn: controls.saveButtonId ? document.getElementById(controls.saveButtonId) : null,
    resetBtn: controls.resetButtonId ? document.getElementById(controls.resetButtonId) : null,
    nextBtn: controls.nextButtonId ? document.getElementById(controls.nextButtonId) : null,
    prevBtn: controls.prevButtonId ? document.getElementById(controls.prevButtonId) : null,
    createBtn: controls.createButtonId ? document.getElementById(controls.createButtonId) : null,
    deleteBtn: controls.deleteButtonId ? document.getElementById(controls.deleteButtonId) : null,
    indicator: controls.recordIndicatorId ? document.getElementById(controls.recordIndicatorId) : null,
    status: controls.saveStatusId ? document.getElementById(controls.saveStatusId) : null,
  };

  const listeners = {
    save: [], reset: [], next: [], prev: [], create: [], delete: [], indexChanged: [],
  };

  function updateIndicator() {
    if (!dom.indicator) return;
    const total = store.getLength();
    dom.indicator.textContent = total === 0 ? 'No records' : `Record ${currentIndex + 1} of ${total}`;
  }

  function setStatus(msg, color = '#4a5568') {
    if (!dom.status) return;
    dom.status.textContent = msg;
    dom.status.style.color = color;
  }

  function clearStatus() {
    if (dom.status) dom.status.textContent = '';
  }

  function runInternalChange(fn) {
    internalChangeDepth += 1;
    let res;
    try {
      res = fn();
    } catch (e) {
      internalChangeDepth = Math.max(0, internalChangeDepth - 1);
      throw e;
    }
    if (res && typeof res.then === 'function') {
      return res.finally(() => {
        internalChangeDepth = Math.max(0, internalChangeDepth - 1);
      });
    }
    internalChangeDepth = Math.max(0, internalChangeDepth - 1);
    return res;
  }

  function buildSections() {
    sectionEls = [];
    const record = store.getRecord(currentIndex);
    const frag = document.createDocumentFragment();

    view.sections.forEach(section => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'card';
      const title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = section.title;
      sectionEl.appendChild(title);

      const grid = document.createElement('div');
      grid.className = `grid ${section.columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`;

      section.fields.forEach(f => {
        const key = typeof f === 'string' ? f : f.field;
        const def = model.fields[key];
        if (!def) return;

        const value = record ? record[key] : '';
        const rendererName = (f && typeof f === 'object' && f.renderer) ? f.renderer : defaultRendererName;
        const widget = getUI(rendererName).createField({
          fieldKey: key,
          def,
          value,
          onChange: val => {
            if (!store.getRecord(currentIndex)) return;
            runInternalChange(() => store.setField(currentIndex, key, val));
          }
        });

        const cell = document.createElement('div');
        if (typeof f === 'object' && f.span === 2) cell.style.gridColumn = 'span 2';
        cell.appendChild(widget.el);
        grid.appendChild(cell);
      });

      sectionEl.appendChild(grid);
      sectionEls.push(sectionEl);
      frag.appendChild(sectionEl);
    });

    root.innerHTML = '';
    root.appendChild(frag);
  }

  async function validateAll() {
    const rec = store.getRecord(currentIndex);
    if (!rec) return true;
    return view.sections.every(section =>
      section.fields.every(f => validateField(rec[typeof f === 'string' ? f : f.field], model.fields[typeof f === 'string' ? f : f.field]).length === 0)
    );
  }

  function rebind(newIndex, options = {}) {
    const { skipStatusClear = false } = options;
    const total = store.getLength();
    if (total === 0) {
      currentIndex = 0;
      buildSections();
      updateIndicator();
      if (!skipStatusClear) clearStatus();
      return true;
    }
    if (newIndex < 0 || newIndex >= total) return false;
    currentIndex = newIndex;
    buildSections();
    updateIndicator();
    if (!skipStatusClear) clearStatus();
    return true;
  }

  buildSections();
  updateIndicator();

  function handleExternalStoreEvent(action) {
    const total = store.getLength();
    const nextIndex = total === 0 ? 0 : Math.min(currentIndex, total - 1);
    rebind(nextIndex, { skipStatusClear: true });
    const message = externalStatusMessages[action] || 'Store changed externally; refreshed view.';
    setStatus(message, '#3182ce');
  }

  const unsubscribe = store.subscribe(ev => {
    if (!ev || internalChangeDepth > 0 || !Array.isArray(ev.path)) return;
    const [action] = ev.path;
    if (!trackedStoreEvents.has(action)) return;
    if (action === EventTypes.reset) {
      if (pendingResetSync) return;
      pendingResetSync = setTimeout(() => {
        pendingResetSync = null;
        handleExternalStoreEvent(action);
      }, 0);
      return;
    }
    handleExternalStoreEvent(action);
  });
  if (typeof unsubscribe === 'function') cleanupFns.push(unsubscribe);

  async function runInterceptors(type, executor) {
    const procs = listeners[type];
    let executed = false;
    const processor = {
      state: { currentIndex, record: store.getRecord(currentIndex), store },
      controls: dom,
      proceed: async () => { if (executed) return; executed = true; return executor(); }
    };
    if (procs.length === 0) return processor.proceed();
    for (const fn of procs) await fn(processor);
  }

  async function doSave() {
    const ok = await validateAll();
    if (!ok) return setStatus('Fix validation errors.', '#e53e3e');
    const diff = store.diff();
    if (diff.length > 0) {
      if (typeof store.save === 'function') {
        await runInternalChange(() => store.save());
      } else {
        runInternalChange(() => store.commit());
      }
      setStatus(`Saved changes: ${JSON.stringify(diff)}`, '#2f855a');
    } else setStatus('No changes to save.', '#4a5568');
  }

  async function doReset() { await runInternalChange(() => store.reset()); buildSections(); updateIndicator(); setStatus('Reset done.', '#4a5568'); }
  async function doCreate() {
    const idx = runInternalChange(() => store.addRecord(Object.fromEntries(Object.keys(model.fields).map(k => [k, '']))));
    rebind(idx);
    setStatus('New record created.', '#2f855a');
  }
  async function doDelete() {
    if (store.getLength() === 0) return setStatus('No records to delete.', '#e53e3e');
    runInternalChange(() => store.removeRecords([currentIndex]));
    const len = store.getLength();
    const nextIndex = len === 0 ? 0 : Math.min(currentIndex, len - 1);
    rebind(nextIndex);
    setStatus('Record deleted.', '#2f855a');
  }
  async function doNext() { if (!rebind(currentIndex + 1)) setStatus('Already at last record.', '#e53e3e'); }
  async function doPrev() { if (!rebind(currentIndex - 1)) setStatus('Already at first record.', '#e53e3e'); }

  cleanupFns.push(bindClick(dom.saveBtn, 'save', () => runInterceptors('save', doSave)));
  cleanupFns.push(bindClick(dom.resetBtn, 'reset', () => runInterceptors('reset', doReset)));
  cleanupFns.push(bindClick(dom.createBtn, 'create', () => runInterceptors('create', doCreate)));
  cleanupFns.push(bindClick(dom.deleteBtn, 'delete', () => runInterceptors('delete', doDelete)));
  cleanupFns.push(bindClick(dom.nextBtn, 'next', () => runInterceptors('next', doNext)));
  cleanupFns.push(bindClick(dom.prevBtn, 'prev', () => runInterceptors('prev', doPrev)));

  function destroy() {
    if (pendingResetSync) {
      clearTimeout(pendingResetSync);
      pendingResetSync = null;
    }
    // Unbind in reverse order in case any dependencies exist.
    while (cleanupFns.length) {
      const fn = cleanupFns.pop();
      try { fn && fn(); } catch { /* ignore */ }
    }
    if (root && root[ROOT_CLEANUP] === destroy) delete root[ROOT_CLEANUP];
  }

  if (root) root[ROOT_CLEANUP] = destroy;

  return {
    formApi: {
      setRecordIndex: idx => rebind(idx),
      onSave: fn => listeners.save.push(fn),
      onReset: fn => listeners.reset.push(fn),
      onCreate: fn => listeners.create.push(fn),
      onDelete: fn => listeners.delete.push(fn),
      onNext: fn => listeners.next.push(fn),
      onPrev: fn => listeners.prev.push(fn),
      destroy,
    }
  };
}

// Backwards-compatible alias (deprecated)
export { blinxForm as renderBlinxForm };