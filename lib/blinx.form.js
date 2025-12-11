
import { validateField } from './blinx.validate.js';

export function renderBlinxForm({
  root, model, view, store, ui,
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
  root.innerHTML = '';

  let currentIndex = recordIndex;
  let sectionEls = [];

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
        const widget = ui.createField({
          fieldKey: key,
          def,
          value,
          onChange: val => { if (store.getRecord(currentIndex)) store.setField(currentIndex, key, val); }
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

  function rebind(newIndex) {
    const total = store.getLength();
    if (total === 0) {
      currentIndex = 0;
      buildSections();
      updateIndicator();
      clearStatus();
      return true;
    }
    if (newIndex < 0 || newIndex >= total) return false;
    currentIndex = newIndex;
    buildSections();
    updateIndicator();
    clearStatus();
    return true;
  }

  buildSections();
  updateIndicator();

  store.subscribe(ev => {
    if (Array.isArray(ev.path)) {
      const [action, idx] = ev.path;
      if (action === 'reset' || action === 'remove') {
        const len = store.getLength();
        currentIndex = len === 0 ? 0 : Math.min(currentIndex, len - 1);
        buildSections();
        updateIndicator();
        clearStatus();
      }
    }
  });

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
      store.commit();
      setStatus(`Saved changes: ${JSON.stringify(diff)}`, '#2f855a');
    } else setStatus('No changes to save.', '#4a5568');
  }

  async function doReset() { store.reset(); buildSections(); updateIndicator(); setStatus('Reset done.', '#4a5568'); }
  async function doCreate() { const idx = store.addRecord(Object.fromEntries(Object.keys(model.fields).map(k => [k, '']))); rebind(idx); setStatus('New record created.', '#2f855a'); }
  async function doDelete() { if (store.getLength() === 0) return setStatus('No records to delete.', '#e53e3e'); store.removeRecords([currentIndex]); setStatus('Record deleted.', '#2f855a'); }
  async function doNext() { if (!rebind(currentIndex + 1)) setStatus('Already at last record.', '#e53e3e'); }
  async function doPrev() { if (!rebind(currentIndex - 1)) setStatus('Already at first record.', '#e53e3e'); }

  if (dom.saveBtn) dom.saveBtn.addEventListener('click', () => runInterceptors('save', doSave));
  if (dom.resetBtn) dom.resetBtn.addEventListener('click', () => runInterceptors('reset', doReset));
  if (dom.createBtn) dom.createBtn.addEventListener('click', () => runInterceptors('create', doCreate));
  if (dom.deleteBtn) dom.deleteBtn.addEventListener('click', () => runInterceptors('delete', doDelete));
  if (dom.nextBtn) dom.nextBtn.addEventListener('click', () => runInterceptors('next', doNext));
  if (dom.prevBtn) dom.prevBtn.addEventListener('click', () => runInterceptors('prev', doPrev));

  return {
    formApi: {
      setRecordIndex: idx => rebind(idx),
      onSave: fn => listeners.save.push(fn),
      onReset: fn => listeners.reset.push(fn),
      onCreate: fn => listeners.create.push(fn),
      onDelete: fn => listeners.delete.push(fn),
      onNext: fn => listeners.next.push(fn),
      onPrev: fn => listeners.prev.push(fn),
    }
  };
}