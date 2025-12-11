
export function renderBlinxTable({
  root, view, store, ui,
  pageSize = 20,
  onRowClick,
  controls = {
    createButtonId: null,
    deleteSelectedButtonId: null,
    statusId: null,
  }
}) {
  if (!store || typeof store.getModel !== 'function') {
    throw new Error('renderBlinxTable requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('renderBlinxTable requires the store model to define fields.');
  }

  root.innerHTML = '';
  let page = 0;
  let selected = new Set();

  const dom = {
    createBtn: controls.createButtonId ? document.getElementById(controls.createButtonId) : null,
    deleteSelectedBtn: controls.deleteSelectedButtonId ? document.getElementById(controls.deleteSelectedButtonId) : null,
    status: controls.statusId ? document.getElementById(controls.statusId) : null,
  };

  function setStatus(msg, color = '#4a5568') {
    if (!dom.status) return;
    dom.status.textContent = msg;
    dom.status.style.color = color;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'flex';
  const prevBtn = document.createElement('button'); prevBtn.className = 'btn'; prevBtn.textContent = 'Prev';
  const nextBtn = document.createElement('button'); nextBtn.className = 'btn'; nextBtn.textContent = 'Next';
  const pageLabel = document.createElement('span'); pageLabel.textContent = `Page: ${page + 1}`;
  toolbar.append(prevBtn, nextBtn, pageLabel);
  root.appendChild(toolbar);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const thr = document.createElement('tr');
  const thSel = document.createElement('th'); thSel.textContent = 'Sel'; thr.appendChild(thSel);
  view.columns.forEach(col => { const th = document.createElement('th'); th.textContent = col.label; thr.appendChild(th); });
  thead.appendChild(thr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  root.appendChild(table);

  function renderPage() {
    tbody.innerHTML = '';
    const data = store.toJSON();
    const start = page * pageSize;
    const end = Math.min(data.length, start + pageSize);
    const frag = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
      const tr = document.createElement('tr');
      const tdSel = document.createElement('td');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(i);
      cb.addEventListener('change', () => { cb.checked ? selected.add(i) : selected.delete(i); });
      tdSel.appendChild(cb);
      tr.appendChild(tdSel);

      if (onRowClick) tr.addEventListener('click', e => { if (e.target !== cb) onRowClick(i); });

      view.columns.forEach(col => {
        const td = document.createElement('td');
        td.textContent = ui.formatCell(data[i][col.field], model.fields[col.field]);
        tr.appendChild(td);
      });

      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    pageLabel.textContent = `Page: ${page + 1}`;
  }

  prevBtn.addEventListener('click', () => { page = Math.max(0, page - 1); renderPage(); });
  nextBtn.addEventListener('click', () => { const maxPage = Math.floor((store.getLength() - 1) / pageSize); page = Math.min(maxPage, page + 1); renderPage(); });

  const listeners = { create: [], deleteSelected: [] };

  async function runInterceptors(type, executor) {
    const procs = listeners[type];
    let executed = false;
    const processor = {
      state: { page, selected: new Set(selected), store },
      controls: dom,
      proceed: async () => { if (executed) return; executed = true; return executor(); }
    };
    if (procs.length === 0) return processor.proceed();
    for (const fn of procs) await fn(processor);
  }

  async function doCreate() {
    store.addRecord(Object.fromEntries(Object.keys(model.fields).map(k => [k, ''])));
    renderPage();
    setStatus('New row created.', '#2f855a');
  }

  async function doDeleteSelected() {
    if (selected.size === 0) return setStatus('No rows selected.', '#e53e3e');
    store.removeRecords(Array.from(selected));
    selected.clear();
    renderPage();
    setStatus('Selected rows deleted.', '#2f855a');
  }

  if (dom.createBtn) dom.createBtn.addEventListener('click', () => runInterceptors('create', doCreate));
  if (dom.deleteSelectedBtn) dom.deleteSelectedBtn.addEventListener('click', () => runInterceptors('deleteSelected', doDeleteSelected));

  store.subscribe(renderPage);
  renderPage();

  return {
    tableApi: {
      onCreate: fn => listeners.create.push(fn),
      onDeleteSelected: fn => listeners.deleteSelected.push(fn),
    }
  };
}
