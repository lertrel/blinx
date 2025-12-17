import { EventTypes } from './blinx.store.js';

const ROOT_CLEANUP = Symbol('blinxCollectionCleanup');

function getDomControls(controls = {}) {
  return {
    createBtn: controls.createButtonId ? document.getElementById(controls.createButtonId) : null,
    deleteSelectedBtn: controls.deleteSelectedButtonId ? document.getElementById(controls.deleteSelectedButtonId) : null,
    status: controls.statusId ? document.getElementById(controls.statusId) : null,
    prevBtn: controls.prevButtonId ? document.getElementById(controls.prevButtonId) : null,
    nextBtn: controls.nextButtonId ? document.getElementById(controls.nextButtonId) : null,
    pageLabel: controls.pageLabelId ? document.getElementById(controls.pageLabelId) : null,
  };
}

function setStatus(dom, msg, color = '#4a5568') {
  if (!dom.status) return;
  dom.status.textContent = msg;
  dom.status.style.color = color;
}

function createInternalPager(root) {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex';
  const prevBtn = document.createElement('button'); prevBtn.className = 'btn'; prevBtn.textContent = 'Prev';
  const nextBtn = document.createElement('button'); nextBtn.className = 'btn'; nextBtn.textContent = 'Next';
  const pageLabel = document.createElement('span'); pageLabel.textContent = 'Page: 1';
  toolbar.append(prevBtn, nextBtn, pageLabel);
  root.appendChild(toolbar);
  return { prevBtn, nextBtn, pageLabel, toolbar };
}

function defaultExternalStatusMessages(layout) {
  // Preserve historic table phrasing for backwards compatibility and tests.
  if (layout === 'table') {
    return {
      [EventTypes.add]: 'Rows added elsewhere; refreshed table.',
      [EventTypes.remove]: 'Rows removed elsewhere; refreshed table.',
      [EventTypes.update]: 'Rows updated elsewhere; refreshed table.',
      [EventTypes.commit]: 'Changes committed elsewhere; refreshed table.',
      [EventTypes.reset]: 'Store reset elsewhere; refreshed table.',
    };
  }
  return {
    [EventTypes.add]: 'Items added elsewhere; refreshed view.',
    [EventTypes.remove]: 'Items removed elsewhere; refreshed view.',
    [EventTypes.update]: 'Items updated elsewhere; refreshed view.',
    [EventTypes.commit]: 'Changes committed elsewhere; refreshed view.',
    [EventTypes.reset]: 'Store reset elsewhere; refreshed view.',
  };
}

function resolveLayout(layout, builtins, customLayouts) {
  if (typeof layout === 'function') return { mount: layout };
  if (layout && typeof layout === 'object' && typeof layout.mount === 'function') return layout;
  const key = layout || 'table';
  return customLayouts[key] || builtins[key];
}

function createTableLayout() {
  return {
    mount({ root, model, view, ui, controller, onItemClick }) {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const thr = document.createElement('tr');
      const thSel = document.createElement('th'); thSel.textContent = 'Sel'; thr.appendChild(thSel);
      (view.columns || []).forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        thr.appendChild(th);
      });
      thead.appendChild(thr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      root.appendChild(table);

      function update() {
        tbody.innerHTML = '';
        const { items } = controller.getState();
        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const tr = document.createElement('tr');
          const tdSel = document.createElement('td');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = controller.isSelected(index);
          cb.addEventListener('change', () => controller.toggleSelected(index, cb.checked));
          tdSel.appendChild(cb);
          tr.appendChild(tdSel);

          if (onItemClick) {
            tr.addEventListener('click', e => {
              if (e.target !== cb) onItemClick({ index, record });
            });
          }

          (view.columns || []).forEach(col => {
            const td = document.createElement('td');
            td.textContent = ui.formatCell(record?.[col.field], model.fields[col.field]);
            tr.appendChild(td);
          });
          frag.appendChild(tr);
        }
        tbody.appendChild(frag);
      }

      return {
        update,
        destroy: () => { /* no-op */ },
      };
    }
  };
}

function createCardsLayout() {
  return {
    mount({ root, view, controller, onItemClick }) {
      const grid = document.createElement('div');
      grid.className = 'blinx-grid';
      root.appendChild(grid);

      function update() {
        grid.innerHTML = '';
        const { items } = controller.getState();
        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const card = document.createElement('article');
          card.className = 'blinx-card';

          const titleField = view.item?.titleField;
          if (titleField) {
            const h = document.createElement('header');
            h.className = 'blinx-card__title';
            h.textContent = record?.[titleField] ?? '';
            card.appendChild(h);
          }

          if (onItemClick) card.addEventListener('click', () => onItemClick({ index, record }));
          frag.appendChild(card);
        }
        grid.appendChild(frag);
      }

      return { update, destroy: () => {} };
    }
  };
}

function createFeedLayout() {
  return {
    mount({ root, view, controller, onItemClick }) {
      const list = document.createElement('div');
      list.className = 'blinx-feed';
      root.appendChild(list);

      function update() {
        list.innerHTML = '';
        const { items } = controller.getState();
        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const item = document.createElement('article');
          item.className = 'blinx-feedItem';
          const titleField = view.item?.titleField;
          const bodyField = view.item?.bodyField;
          if (titleField) {
            const h = document.createElement('h3');
            h.textContent = record?.[titleField] ?? '';
            item.appendChild(h);
          }
          if (bodyField) {
            const p = document.createElement('p');
            p.textContent = record?.[bodyField] ?? '';
            item.appendChild(p);
          }
          if (onItemClick) item.addEventListener('click', () => onItemClick({ index, record }));
          frag.appendChild(item);
        }
        list.appendChild(frag);
      }

      return { update, destroy: () => {} };
    }
  };
}

/**
 * Generic, extensible multi-record renderer.
 *
 * Layouts can be:
 * - built-in string: 'table' | 'cards' | 'feed'
 * - custom string key resolved via `layouts`
 * - a layout object: { mount({ root, controller, ... }) => { update(), destroy? } }
 */
export function blinxCollection({
  root,
  view,
  store,
  ui,
  paging = {},
  selection = { mode: 'multi' },
  actions = { create: true, deleteSelected: true },
  controls = {},
  layouts = {},
  onItemClick,
}) {
  if (!store || typeof store.getModel !== 'function') {
    throw new Error('blinxCollection requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxCollection requires the store model to define fields.');
  }
  if (!root) throw new Error('blinxCollection requires a root element.');
  if (!view) throw new Error('blinxCollection requires a view.');
  if (!ui) throw new Error('blinxCollection requires a ui adapter.');

  // If the same root is re-rendered, clean up prior subscriptions/handlers first.
  if (root && typeof root[ROOT_CLEANUP] === 'function') {
    try { root[ROOT_CLEANUP](); } catch { /* ignore */ }
  }

  root.innerHTML = '';

  const layoutKey = typeof view.layout === 'string' ? view.layout : (view.layout ? 'custom' : 'table');
  const builtins = {
    table: createTableLayout(),
    cards: createCardsLayout(),
    feed: createFeedLayout(),
  };
  const layout = resolveLayout(view.layout, builtins, layouts);
  if (!layout || typeof layout.mount !== 'function') {
    throw new Error(`Unknown layout "${String(view.layout)}".`);
  }

  let pageSize = Number.isFinite(paging.pageSize) ? paging.pageSize : 20;
  let page = Number.isFinite(paging.page) ? paging.page : 0;
  let selected = new Set();
  let internalChangeDepth = 0;
  let pendingResetSync = null;
  const cleanupFns = [];

  const dom = getDomControls(controls);
  let internalPager = null;
  const trackedStoreEvents = new Set([
    EventTypes.add,
    EventTypes.remove,
    EventTypes.update,
    EventTypes.commit,
    EventTypes.reset,
  ]);
  const externalStatusMessages = defaultExternalStatusMessages(layoutKey);

  function runInternalChange(fn) {
    internalChangeDepth += 1;
    try {
      return fn();
    } finally {
      internalChangeDepth = Math.max(0, internalChangeDepth - 1);
    }
  }

  function getDataSnapshot() {
    return store.toJSON();
  }

  function getMaxPage(len) {
    if (len <= 0) return 0;
    return Math.max(0, Math.ceil(len / pageSize) - 1);
  }

  function pruneSelection(len) {
    const next = new Set();
    selected.forEach(idx => {
      if (idx >= 0 && idx < len) next.add(idx);
    });
    selected = next;
  }

  function getItemsForCurrentPage(data) {
    const maxPage = getMaxPage(data.length);
    page = Math.min(Math.max(page, 0), maxPage);
    pruneSelection(data.length);
    const start = page * pageSize;
    const end = Math.min(data.length, start + pageSize);
    const items = [];
    for (let i = start; i < end; i++) items.push({ index: i, record: data[i] });
    return { items, start, end, total: data.length, maxPage };
  }

  function updatePagerLabel() {
    const labelEl = dom.pageLabel || internalPager?.pageLabel;
    if (labelEl) labelEl.textContent = `Page: ${page + 1}`;
  }

  function refresh() {
    const data = getDataSnapshot();
    const { items } = getItemsForCurrentPage(data);
    layoutApi.update();
    updatePagerLabel();
    return items;
  }

  function isSelected(index) {
    return selected.has(index);
  }

  function toggleSelected(index, checked) {
    if (selection?.mode === 'none') return;
    const needsRefresh = selection?.mode === 'single';
    if (needsRefresh) selected.clear();
    if (checked) selected.add(index);
    else selected.delete(index);
    // In single-selection mode, selecting a new row invalidates other rows' checked state,
    // so we must refresh to keep the UI in sync.
    if (needsRefresh) refresh();
  }

  const listeners = { create: [], deleteSelected: [] };

  async function runInterceptors(type, executor) {
    const procs = listeners[type];
    let executed = false;
    const data = getDataSnapshot();
    const { items, start, end, total } = getItemsForCurrentPage(data);
    const processor = {
      state: {
        page,
        pageSize,
        selected: new Set(selected),
        selectionMode: selection?.mode || 'multi',
        visibleRange: { start, end },
        total,
        items,
        store,
      },
      controls: dom,
      proceed: async () => { if (executed) return; executed = true; return executor(); }
    };
    if (procs.length === 0) return processor.proceed();
    for (const fn of procs) await fn(processor);
  }

  async function doCreate() {
    runInternalChange(() => store.addRecord(Object.fromEntries(Object.keys(model.fields).map(k => [k, '']))));
    refresh();
    setStatus(dom, 'New row created.', '#2f855a');
  }

  async function doDeleteSelected() {
    if (selected.size === 0) return setStatus(dom, 'No rows selected.', '#e53e3e');
    runInternalChange(() => store.removeRecords(Array.from(selected)));
    selected.clear();
    refresh();
    setStatus(dom, 'Selected rows deleted.', '#2f855a');
  }

  function handleExternalStoreEvent(action) {
    const message = externalStatusMessages[action] || 'Data changed externally; refreshed view.';
    setStatus(dom, message, '#3182ce');
  }

  function scheduleResetRefresh(action) {
    if (pendingResetSync) return;
    pendingResetSync = setTimeout(() => {
      pendingResetSync = null;
      refresh();
      handleExternalStoreEvent(action);
    }, 0);
  }

  function bindPagerButtons() {
    const prevEl = dom.prevBtn || internalPager?.prevBtn;
    const nextEl = dom.nextBtn || internalPager?.nextBtn;
    if (prevEl) {
      const onPrev = () => { page = Math.max(0, page - 1); refresh(); };
      prevEl.addEventListener('click', onPrev);
      cleanupFns.push(() => prevEl.removeEventListener('click', onPrev));
    }
    if (nextEl) {
      const onNext = () => {
        const maxPage = Math.floor((store.getLength() - 1) / pageSize);
        page = Math.min(maxPage, page + 1);
        refresh();
      };
      nextEl.addEventListener('click', onNext);
      cleanupFns.push(() => nextEl.removeEventListener('click', onNext));
    }
  }

  function bindActionButtons() {
    if (dom.createBtn && actions?.create) {
      const onCreate = () => runInterceptors('create', doCreate);
      dom.createBtn.addEventListener('click', onCreate);
      cleanupFns.push(() => dom.createBtn.removeEventListener('click', onCreate));
    }
    if (dom.deleteSelectedBtn && actions?.deleteSelected) {
      const onDeleteSelected = () => runInterceptors('deleteSelected', doDeleteSelected);
      dom.deleteSelectedBtn.addEventListener('click', onDeleteSelected);
      cleanupFns.push(() => dom.deleteSelectedBtn.removeEventListener('click', onDeleteSelected));
    }
  }

  // If external pager controls are not provided, mount internal pager by default.
  if (!dom.prevBtn && !dom.nextBtn && !dom.pageLabel) {
    internalPager = createInternalPager(root);
    cleanupFns.push(() => {
      try { internalPager?.toolbar?.remove(); } catch { /* ignore */ }
      internalPager = null;
    });
  }

  const controller = {
    getState: () => {
      const data = getDataSnapshot();
      const { items, start, end, total, maxPage } = getItemsForCurrentPage(data);
      return {
        page,
        pageSize,
        selected: new Set(selected),
        selectionMode: selection?.mode || 'multi',
        visibleRange: { start, end },
        total,
        maxPage,
        items,
      };
    },
    setPage: (next) => {
      page = Math.max(0, Number(next) || 0);
      refresh();
    },
    isSelected,
    toggleSelected,
    clearSelection: () => { selected.clear(); refresh(); },
    runInternalChange,
  };

  const layoutApi = layout.mount({
    root,
    model,
    view,
    ui,
    controller,
    onItemClick,
  });

  if (!layoutApi || typeof layoutApi.update !== 'function') {
    throw new Error('Layout mount() must return an object with update().');
  }
  cleanupFns.push(() => { try { layoutApi.destroy && layoutApi.destroy(); } catch { /* ignore */ } });

  bindPagerButtons();
  bindActionButtons();

  const unsubscribe = store.subscribe(ev => {
    if (internalChangeDepth > 0) return;
    if (!ev || !Array.isArray(ev.path)) {
      refresh();
      return;
    }
    const [action] = ev.path;
    if (action === EventTypes.reset) {
      scheduleResetRefresh(action);
      return;
    }
    refresh();
    if (trackedStoreEvents.has(action)) handleExternalStoreEvent(action);
  });
  if (typeof unsubscribe === 'function') cleanupFns.push(unsubscribe);

  refresh();

  function destroy() {
    if (pendingResetSync) {
      clearTimeout(pendingResetSync);
      pendingResetSync = null;
    }
    while (cleanupFns.length) {
      const fn = cleanupFns.pop();
      try { fn && fn(); } catch { /* ignore */ }
    }
    if (root && root[ROOT_CLEANUP] === destroy) delete root[ROOT_CLEANUP];
  }
  root[ROOT_CLEANUP] = destroy;

  return {
    api: {
      onCreate: fn => listeners.create.push(fn),
      onDeleteSelected: fn => listeners.deleteSelected.push(fn),
      setPage: controller.setPage,
      getState: controller.getState,
      destroy,
    }
  };
}

// Backwards-compatible alias (deprecated)
export { blinxCollection as renderBlinxCollection };

