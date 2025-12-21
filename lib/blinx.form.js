
import { validateField } from './blinx.validate.js';
import { EventTypes } from './blinx.store.js';
import { RegisteredUI } from './blinx.registered-ui.js';
import { resolveComponentUIView, resolveModelUIView } from './blinx.ui-views.js';
import {
  normalizeControlSpecEntry,
  resolveElementByIdWithinRoot,
  applyControlPresentation,
} from './blinx.controls.js';

// Prevent handler accumulation when blinxForm is called multiple times
// with the same DOM controls (common in tests and re-renders).
const CONTROL_CLICK_BINDINGS = new WeakMap();
const ROOT_CLEANUP = Symbol('blinxFormCleanup');

const BUILTIN_CONTROL_KEYS = [
  'saveButton',
  'resetButton',
  'nextButton',
  'prevButton',
  'createButton',
  'deleteButton',
  'recordIndicator',
  'saveStatus',
];

function defaultBuiltinControlMeta(key) {
  switch (key) {
    case 'prevButton': return { label: 'Previous', css: 'btn' };
    case 'nextButton': return { label: 'Next', css: 'btn' };
    case 'saveButton': return { label: 'Save', css: 'btn btn-primary' };
    case 'resetButton': return { label: 'Reset', css: 'btn' };
    case 'createButton': return { label: 'Create', css: 'btn' };
    case 'deleteButton': return { label: 'Delete', css: 'btn' };
    case 'recordIndicator': return { label: '', css: '' };
    case 'saveStatus': return { label: '', css: '' };
    default: return { label: '', css: '' };
  }
}

function createDefaultToolbar(root) {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex blinx-controls';
  // Order mirrors demo/basic-model.html
  const prevBtn = document.createElement('button'); prevBtn.type = 'button';
  const nextBtn = document.createElement('button'); nextBtn.type = 'button';
  const indicator = document.createElement('span');
  const saveBtn = document.createElement('button'); saveBtn.type = 'button';
  const resetBtn = document.createElement('button'); resetBtn.type = 'button';
  const createBtn = document.createElement('button'); createBtn.type = 'button';
  const deleteBtn = document.createElement('button'); deleteBtn.type = 'button';
  const status = document.createElement('span');

  const meta = {
    prevButton: defaultBuiltinControlMeta('prevButton'),
    nextButton: defaultBuiltinControlMeta('nextButton'),
    saveButton: defaultBuiltinControlMeta('saveButton'),
    resetButton: defaultBuiltinControlMeta('resetButton'),
    createButton: defaultBuiltinControlMeta('createButton'),
    deleteButton: defaultBuiltinControlMeta('deleteButton'),
  };
  prevBtn.textContent = meta.prevButton.label; prevBtn.className = meta.prevButton.css;
  nextBtn.textContent = meta.nextButton.label; nextBtn.className = meta.nextButton.css;
  saveBtn.textContent = meta.saveButton.label; saveBtn.className = meta.saveButton.css;
  resetBtn.textContent = meta.resetButton.label; resetBtn.className = meta.resetButton.css;
  createBtn.textContent = meta.createButton.label; createBtn.className = meta.createButton.css;
  deleteBtn.textContent = meta.deleteButton.label; deleteBtn.className = meta.deleteButton.css;

  toolbar.append(prevBtn, nextBtn, indicator, saveBtn, resetBtn, createBtn, deleteBtn, status);
  root.appendChild(toolbar);
  return { toolbar, prevBtn, nextBtn, indicator, saveBtn, resetBtn, createBtn, deleteBtn, status };
}

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
  controls,
}) {
  // Resolve declarative data view (if requested).
  if (dataView && typeof dataView === 'string') {
    if (dataView !== 'active') {
      if (store && typeof store.view === 'function') store = store.view(dataView);
      else if (store && typeof store.collection === 'function') store = store.collection(dataView);
      else throw new Error('blinxForm: dataView requires a multi-view store (with view()/collection()).');
    }
  }

  if (!store || typeof store.getModel !== 'function') {
    throw new Error('blinxForm requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxForm requires the store model to define fields.');
  }

  // Resolve declarative UI view:
  // - object => already resolved
  // - string => store-scoped uiViews[key] first, then registry (model+kind+name)
  // - omitted => registry default for model+kind
  const kind = 'form';
  const resolvedView = resolveComponentUIView({ store, model, kind, view });
  if (!resolvedView) {
    const key = (typeof view === 'string') ? `"${String(view)}"` : '(default)';
    throw new Error(`blinxForm: unable to resolve ui view ${key} for model "${String(model?.id || model?.name || 'unknown')}".`);
  }
  view = resolvedView;
  if (!view || typeof view !== 'object' || !Array.isArray(view.sections)) {
    throw new Error('blinxForm: view must be an object with sections[].');
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

  const contentRoot = document.createElement('div');
  contentRoot.className = 'blinx-form__content';
  root.appendChild(contentRoot);

  let currentIndex = recordIndex;
  let sectionEls = [];
  let internalChangeDepth = 0;
  let pendingResetSync = null;
  const cleanupFns = [];
  let fieldCleanupFns = [];

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

  // Resolve controls:
  // - Declarative view controls: view.controls (or explicit `controls` param)
  // - Omitted controls => auto-render a default toolbar
  const explicitControlsProvided = Object.prototype.hasOwnProperty.call(arguments?.[0] || {}, 'controls');
  const viewControlsSpec = view && typeof view === 'object' ? view.controls : undefined;
  const resolvedControlsSpec = explicitControlsProvided ? controls : viewControlsSpec;

  const dom = {
    saveBtn: null,
    resetBtn: null,
    nextBtn: null,
    prevBtn: null,
    createBtn: null,
    deleteBtn: null,
    indicator: null,
    status: null,
    custom: {},
  };

  let internalToolbar = null;

  if (resolvedControlsSpec === false || resolvedControlsSpec === null) {
    // Explicitly disable controls rendering/binding.
  } else if (!explicitControlsProvided && (resolvedControlsSpec === undefined)) {
    // No controls were declared anywhere => auto-render opinionated defaults.
    internalToolbar = createDefaultToolbar(root);
    cleanupFns.push(() => {
      try { internalToolbar?.toolbar?.remove(); } catch { /* ignore */ }
      internalToolbar = null;
    });
    dom.prevBtn = internalToolbar.prevBtn;
    dom.nextBtn = internalToolbar.nextBtn;
    dom.saveBtn = internalToolbar.saveBtn;
    dom.resetBtn = internalToolbar.resetBtn;
    dom.createBtn = internalToolbar.createBtn;
    dom.deleteBtn = internalToolbar.deleteBtn;
    dom.indicator = internalToolbar.indicator;
    dom.status = internalToolbar.status;
  } else if (resolvedControlsSpec && typeof resolvedControlsSpec === 'object') {
    // Declarative controls: only render/bind what is explicitly mentioned.
    const specObj = resolvedControlsSpec;
    let toolbar = null;
    function ensureToolbar() {
      if (toolbar) return toolbar;
      toolbar = document.createElement('div');
      toolbar.className = 'flex blinx-controls';
      root.appendChild(toolbar);
      cleanupFns.push(() => { try { toolbar && toolbar.remove(); } catch { /* ignore */ } });
      return toolbar;
    }

    function ensureBuiltin(key) {
      const entry = normalizeControlSpecEntry(specObj[key]);
      if (!entry) return null; // not declared
      const meta = { ...defaultBuiltinControlMeta(key), ...entry };
      const visible = (typeof meta.visible === 'boolean') ? meta.visible : true;
      const disabled = (typeof meta.disabled === 'boolean') ? meta.disabled : false;
      meta.visible = visible;
      meta.disabled = disabled;

      if (typeof meta.domId === 'string' && meta.domId) {
        const existing = resolveElementByIdWithinRoot(root, meta.domId);
        applyControlPresentation(existing, meta);
        return existing;
      }

      // Auto-render for declared controls (true/object without domId).
      let el;
      if (key === 'recordIndicator' || key === 'saveStatus') {
        el = document.createElement('span');
      } else {
        el = document.createElement('button');
        el.type = 'button';
      }
      if (meta.label && el.tagName === 'BUTTON') el.textContent = meta.label;
      applyControlPresentation(el, meta);
      ensureToolbar().appendChild(el);
      return el;
    }

    dom.prevBtn = ensureBuiltin('prevButton');
    dom.nextBtn = ensureBuiltin('nextButton');
    dom.indicator = ensureBuiltin('recordIndicator');
    dom.saveBtn = ensureBuiltin('saveButton');
    dom.resetBtn = ensureBuiltin('resetButton');
    dom.createBtn = ensureBuiltin('createButton');
    dom.deleteBtn = ensureBuiltin('deleteButton');
    dom.status = ensureBuiltin('saveStatus');

    // Custom controls: any keys not in the builtin set.
    for (const [key, raw] of Object.entries(specObj)) {
      if (BUILTIN_CONTROL_KEYS.includes(key)) continue;
      const entry = normalizeControlSpecEntry(raw);
      if (!entry) continue;
      const meta = { label: key, ...entry };
      const visible = (typeof meta.visible === 'boolean') ? meta.visible : true;
      const disabled = (typeof meta.disabled === 'boolean') ? meta.disabled : false;
      meta.visible = visible;
      meta.disabled = disabled;

      let el = null;
      if (typeof meta.domId === 'string' && meta.domId) {
        el = resolveElementByIdWithinRoot(root, meta.domId);
        applyControlPresentation(el, meta);
      } else {
        el = document.createElement('button');
        el.type = 'button';
        el.textContent = meta.label || key;
        applyControlPresentation(el, meta);
        ensureToolbar().appendChild(el);
      }
      if (el) dom.custom[key] = { el, spec: meta };
    }
  }

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
    // Destroy any nested renderers from the previous build.
    while (fieldCleanupFns.length) {
      const fn = fieldCleanupFns.pop();
      try { fn && fn(); } catch { /* ignore */ }
    }

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

        const value = record ? record[key] : undefined;
        const rendererName = (f && typeof f === 'object' && f.renderer) ? f.renderer : defaultRendererName;

        // Nested model rendering (Option A registry + nested overrides)
        // - def.type === 'model': render nested blinxForm using the nested model's default view (or override via { view })
        // - def.type === 'collection': render repeated nested blinxForm for items using item model default view (or override via { itemView })
        if (def?.type === 'model' && def?.model && typeof def.model === 'object') {
          const nestedModel = def.model;
          const overrideViewName = (f && typeof f === 'object') ? (f.view || null) : null;
          const nestedView = resolveModelUIView({ model: nestedModel, kind: 'form', viewName: overrideViewName });

          if (nestedView) {
            const nestedRoot = document.createElement('div');
            nestedRoot.className = 'blinx-nested blinx-nested--model';
            nestedRoot.setAttribute('data-blinx-field', key);

            // Minimal nested store wrapper: edits propagate by replacing the whole nested object.
            const subs = new Set();
            let nestedRecord = (value && typeof value === 'object' && !Array.isArray(value)) ? { ...value } : {};
            const nestedStore = {
              getModel: () => nestedModel,
              getRecord: () => nestedRecord,
              getLength: () => 1,
              setField: (_idx, field, nextVal) => {
                nestedRecord = { ...nestedRecord, [field]: nextVal };
                if (!store.getRecord(currentIndex)) return;
                runInternalChange(() => store.setField(currentIndex, key, nestedRecord));
                subs.forEach(fn => fn({ path: [0, field], value: nextVal, data: [nestedRecord], store: nestedStore }));
              },
              subscribe: fn => { subs.add(fn); return () => subs.delete(fn); },
              toJSON: () => [nestedRecord],
              diff: () => [],
              commit: () => {},
              reset: () => {},
            };

            const { formApi } = blinxForm({
              root: nestedRoot,
              store: nestedStore,
              view: nestedView,
              recordIndex: 0,
              controls: false,
            });
            fieldCleanupFns.push(() => { try { formApi?.destroy?.(); } catch { /* ignore */ } });

            const cell = document.createElement('div');
            if (typeof f === 'object' && f.span === 2) cell.style.gridColumn = 'span 2';
            cell.appendChild(nestedRoot);
            grid.appendChild(cell);
            return;
          }
        }

        if (def?.type === 'collection' && def?.model && typeof def.model === 'object') {
          const itemModel = def.model;
          const overrideItemViewName = (f && typeof f === 'object') ? (f.itemView || null) : null;
          const items = Array.isArray(value) ? value : [];

          const list = document.createElement('div');
          list.className = 'blinx-nested blinx-nested--collection';
          list.setAttribute('data-blinx-field', key);

          items.forEach((item, itemIndex) => {
            const itemView = resolveModelUIView({ model: itemModel, kind: 'form', viewName: overrideItemViewName });
            if (!itemView) return;

            const itemRoot = document.createElement('div');
            itemRoot.className = 'blinx-nested__item';
            itemRoot.setAttribute('data-blinx-item-index', String(itemIndex));

            const subs = new Set();
            let nestedRecord = (item && typeof item === 'object' && !Array.isArray(item)) ? { ...item } : {};
            const itemStore = {
              getModel: () => itemModel,
              getRecord: () => nestedRecord,
              getLength: () => 1,
              setField: (_idx, field, nextVal) => {
                nestedRecord = { ...nestedRecord, [field]: nextVal };
                if (!store.getRecord(currentIndex)) return;
                // IMPORTANT: do not use the captured `items` array (stale closure).
                // Always derive from the latest parent store state to avoid overwriting
                // previous edits when multiple items are edited sequentially.
                const latest = store.getRecord(currentIndex)?.[key];
                const base = Array.isArray(latest) ? latest : [];
                const nextItems = base.slice();
                nextItems[itemIndex] = nestedRecord;
                runInternalChange(() => store.setField(currentIndex, key, nextItems));
                subs.forEach(fn => fn({ path: [0, field], value: nextVal, data: [nestedRecord], store: itemStore }));
              },
              subscribe: fn => { subs.add(fn); return () => subs.delete(fn); },
              toJSON: () => [nestedRecord],
              diff: () => [],
              commit: () => {},
              reset: () => {},
            };

            const { formApi } = blinxForm({
              root: itemRoot,
              store: itemStore,
              view: itemView,
              recordIndex: 0,
              controls: false,
            });
            fieldCleanupFns.push(() => { try { formApi?.destroy?.(); } catch { /* ignore */ } });
            list.appendChild(itemRoot);
          });

          const cell = document.createElement('div');
          if (typeof f === 'object' && f.span === 2) cell.style.gridColumn = 'span 2';
          cell.appendChild(list);
          grid.appendChild(cell);
          return;
        }

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

    contentRoot.innerHTML = '';
    contentRoot.appendChild(frag);
  }

  async function validateAll() {
    const rec = store.getRecord(currentIndex);
    if (!rec) return true;
    return view.sections.every(section =>
      section.fields.every(f => {
        const key = typeof f === 'string' ? f : f.field;
        const def = model.fields[key];
        if (!def) return true;
        // Nested types are validated by their own sub-forms (if any).
        if (def.type === 'model' || def.type === 'collection') return true;
        return validateField(rec[key], def).length === 0;
      })
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

  // Bind custom control actions (if any)
  for (const [name, { el, spec }] of Object.entries(dom.custom || {})) {
    const action = spec?.action;
    if (!el || typeof action !== 'function') continue;
    cleanupFns.push(bindClick(el, `custom:${name}`, async () => {
      const ctx = {
        formApi: api,
        store,
        get recordIndex() { return currentIndex; },
        get record() { return store.getRecord(currentIndex); },
        setStatus,
        clearStatus,
      };
      try {
        await action(ctx);
      } catch (e) {
        setStatus(`Action "${name}" failed.`, '#e53e3e');
        throw e;
      }
    }));
  }

  function destroy() {
    if (pendingResetSync) {
      clearTimeout(pendingResetSync);
      pendingResetSync = null;
    }
    while (fieldCleanupFns.length) {
      const fn = fieldCleanupFns.pop();
      try { fn && fn(); } catch { /* ignore */ }
    }
    // Unbind in reverse order in case any dependencies exist.
    while (cleanupFns.length) {
      const fn = cleanupFns.pop();
      try { fn && fn(); } catch { /* ignore */ }
    }
    if (root && root[ROOT_CLEANUP] === destroy) delete root[ROOT_CLEANUP];
  }

  if (root) root[ROOT_CLEANUP] = destroy;

  const api = {
    setRecordIndex: idx => rebind(idx),
    onSave: fn => listeners.save.push(fn),
    onReset: fn => listeners.reset.push(fn),
    onCreate: fn => listeners.create.push(fn),
    onDelete: fn => listeners.delete.push(fn),
    onNext: fn => listeners.next.push(fn),
    onPrev: fn => listeners.prev.push(fn),
    destroy,
  };

  return { formApi: api };
}

// Backwards-compatible alias (deprecated)
export { blinxForm as renderBlinxForm };