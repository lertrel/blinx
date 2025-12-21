import { EventTypes } from './blinx.store.js';
import { RegisteredUI } from './blinx.registered-ui.js';
import {
  normalizeControlSpecEntry,
  resolveElementByIdWithinRoot,
  applyControlPresentation,
} from './blinx.controls.js';

const ROOT_CLEANUP = Symbol('blinxCollectionCleanup');

const BUILTIN_CONTROL_KEYS = [
  'createButton',
  'deleteSelectedButton',
  'status',
  'prevButton',
  'nextButton',
  'pageLabel',
];

function defaultBuiltinControlMeta(key) {
  switch (key) {
    case 'createButton': return { label: 'Create', css: 'btn' };
    case 'deleteSelectedButton': return { label: 'Delete Selected', css: 'btn' };
    case 'prevButton': return { label: 'Prev', css: 'btn' };
    case 'nextButton': return { label: 'Next', css: 'btn' };
    case 'pageLabel': return { label: '', css: '' };
    case 'status': return { label: '', css: '' };
    default: return { label: '', css: '' };
  }
}

function setStatus(dom, msg, color = '#4a5568') {
  if (!dom.status) return;
  dom.status.textContent = msg;
  dom.status.style.color = color;
}

function createDefaultToolbar(root, { includeActions = true, includePager = true } = {}) {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex blinx-controls';
  const createBtn = document.createElement('button'); createBtn.type = 'button';
  const deleteSelectedBtn = document.createElement('button'); deleteSelectedBtn.type = 'button';
  const prevBtn = document.createElement('button'); prevBtn.type = 'button';
  const nextBtn = document.createElement('button'); nextBtn.type = 'button';
  const pageLabel = document.createElement('span'); pageLabel.textContent = 'Page: 1';
  const status = document.createElement('span');

  const meta = {
    createButton: defaultBuiltinControlMeta('createButton'),
    deleteSelectedButton: defaultBuiltinControlMeta('deleteSelectedButton'),
    prevButton: defaultBuiltinControlMeta('prevButton'),
    nextButton: defaultBuiltinControlMeta('nextButton'),
  };
  createBtn.textContent = meta.createButton.label; createBtn.className = meta.createButton.css;
  deleteSelectedBtn.textContent = meta.deleteSelectedButton.label; deleteSelectedBtn.className = meta.deleteSelectedButton.css;
  prevBtn.textContent = meta.prevButton.label; prevBtn.className = meta.prevButton.css;
  nextBtn.textContent = meta.nextButton.label; nextBtn.className = meta.nextButton.css;

  const nodes = [];
  if (includeActions) nodes.push(createBtn, deleteSelectedBtn);
  if (includePager) nodes.push(prevBtn, nextBtn, pageLabel);
  nodes.push(status);
  toolbar.append(...nodes);
  root.appendChild(toolbar);
  return { toolbar, createBtn, deleteSelectedBtn, prevBtn, nextBtn, pageLabel, status };
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
    mount({ root, model, view, getUI, controller, onItemClick }) {
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
            const rendererName = col?.renderer || view?.renderer || 'default';
            const ui = getUI(rendererName);
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
  // Optional: declarative data-view selection when a multi-view store manager is provided.
  // - "active": bind to the manager's active view (proxy behavior).
  // - any other string: resolves to store.view(name) / store.collection(name).
  dataView,
  paging = {},
  selection = { mode: 'multi' },
  actions = { create: true, deleteSelected: true },
  controls,
  layouts = {},
  onItemClick,
} = {}) {
  // Resolve declarative data view (if requested).
  if (dataView && typeof dataView === 'string') {
    if (dataView !== 'active') {
      if (store && typeof store.view === 'function') store = store.view(dataView);
      else if (store && typeof store.collection === 'function') store = store.collection(dataView);
      else throw new Error('blinxCollection: dataView requires a multi-view store (with view()/collection()).');
    }
  }

  // Resolve declarative UI view by key (if provided as string).
  if (typeof view === 'string') {
    const uiViews = (store && typeof store.getUIViews === 'function') ? store.getUIViews() : null;
    const resolved = uiViews && typeof uiViews === 'object' ? uiViews[view] : null;
    if (!resolved) throw new Error(`blinxCollection: unknown ui view "${String(view)}".`);
    view = resolved;
  }

  if (!store || typeof store.getModel !== 'function') {
    throw new Error('blinxCollection requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxCollection requires the store model to define fields.');
  }
  if (!root) throw new Error('blinxCollection requires a root element.');
  if (!view) throw new Error('blinxCollection requires a view.');
  // Note: legacy API used to accept `ui`. It is intentionally not supported anymore.
  // If callers still pass it, fail fast with a helpful message.
  if (Object.prototype.hasOwnProperty.call(arguments?.[0] || {}, 'ui')) {
    throw new Error('blinxCollection does not accept a ui parameter. Use RegisteredUI.register() and view/field renderer names instead.');
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
  (view.columns || []).forEach(col => {
    if (col && typeof col === 'object' && col.renderer) getUI(col.renderer);
  });

  // If the same root is re-rendered, clean up prior subscriptions/handlers first.
  if (root && typeof root[ROOT_CLEANUP] === 'function') {
    try { root[ROOT_CLEANUP](); } catch { /* ignore */ }
  }

  root.innerHTML = '';
  const contentRoot = document.createElement('div');
  contentRoot.className = 'blinx-collection__content';
  root.appendChild(contentRoot);

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

  // Resolve controls:
  // - Declarative view controls: view.controls (or explicit `controls` param)
  // - Omitted controls => auto-render a default toolbar (actions + pager + status)
  const explicitControlsProvided = Object.prototype.hasOwnProperty.call(arguments?.[0] || {}, 'controls');
  const viewControlsSpec = view && typeof view === 'object' ? view.controls : undefined;
  const resolvedControlsSpec = explicitControlsProvided ? controls : viewControlsSpec;

  const dom = {
    createBtn: null,
    deleteSelectedBtn: null,
    status: null,
    prevBtn: null,
    nextBtn: null,
    pageLabel: null,
    custom: {},
  };
  let internalToolbar = null;

  function ensureToolbar() {
    if (internalToolbar) return internalToolbar;
    internalToolbar = document.createElement('div');
    internalToolbar.className = 'flex blinx-controls';
    // Keep placement consistent with auto-rendered toolbar: after content.
    root.appendChild(internalToolbar);
    cleanupFns.push(() => {
      try { internalToolbar?.remove(); } catch { /* ignore */ }
      internalToolbar = null;
    });
    return internalToolbar;
  }

  function ensureBuiltin(key) {
    if (!resolvedControlsSpec || typeof resolvedControlsSpec !== 'object') return null;
    const entry = normalizeControlSpecEntry(resolvedControlsSpec[key]);
    if (!entry) return null; // not declared
    const meta = { ...defaultBuiltinControlMeta(key), ...entry };
    meta.visible = (typeof meta.visible === 'boolean') ? meta.visible : true;
    meta.disabled = (typeof meta.disabled === 'boolean') ? meta.disabled : false;

    if (typeof meta.domId === 'string' && meta.domId) {
      const existing = resolveElementByIdWithinRoot(root, meta.domId);
      applyControlPresentation(existing, meta);
      return existing;
    }

    let el;
    if (key === 'status' || key === 'pageLabel') el = document.createElement('span');
    else { el = document.createElement('button'); el.type = 'button'; }
    if (meta.label && el.tagName === 'BUTTON') el.textContent = meta.label;
    applyControlPresentation(el, meta);
    ensureToolbar().appendChild(el);
    return el;
  }

  if (resolvedControlsSpec === false || resolvedControlsSpec === null) {
    // Explicitly disable controls.
  } else if (!explicitControlsProvided && resolvedControlsSpec === undefined) {
    // Auto-render defaults when controls are omitted everywhere.
    const includeActions = !!actions?.create || !!actions?.deleteSelected;
    const includePager = true;
    const t = createDefaultToolbar(root, { includeActions, includePager });
    cleanupFns.push(() => { try { t?.toolbar?.remove(); } catch { /* ignore */ } });
    dom.createBtn = t.createBtn;
    dom.deleteSelectedBtn = t.deleteSelectedBtn;
    dom.prevBtn = t.prevBtn;
    dom.nextBtn = t.nextBtn;
    dom.pageLabel = t.pageLabel;
    dom.status = t.status;
  } else if (resolvedControlsSpec && typeof resolvedControlsSpec === 'object') {
    // Render/bind only explicitly declared controls.
    dom.createBtn = ensureBuiltin('createButton');
    dom.deleteSelectedBtn = ensureBuiltin('deleteSelectedButton');
    dom.prevBtn = ensureBuiltin('prevButton');
    dom.nextBtn = ensureBuiltin('nextButton');
    dom.pageLabel = ensureBuiltin('pageLabel');
    dom.status = ensureBuiltin('status');

    for (const [key, raw] of Object.entries(resolvedControlsSpec)) {
      if (BUILTIN_CONTROL_KEYS.includes(key)) continue;
      const entry = normalizeControlSpecEntry(raw);
      if (!entry) continue;
      const meta = { label: key, ...entry };
      meta.visible = (typeof meta.visible === 'boolean') ? meta.visible : true;
      meta.disabled = (typeof meta.disabled === 'boolean') ? meta.disabled : false;

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
    const remotePaging = typeof store.pageNext === 'function' || typeof store.pagePrev === 'function';
    if (remotePaging) {
      page = 0;
      pruneSelection(data.length);
      const items = [];
      for (let i = 0; i < data.length; i++) items.push({ index: i, record: data[i] });
      return { items, start: 0, end: data.length, total: data.length, maxPage: 0 };
    }
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
    const labelEl = dom.pageLabel;
    if (!labelEl) return;
    if (typeof store.getPagingState === 'function') {
      const s = store.getPagingState();
      const ps = s?.pageState;
      if (ps?.mode === 'page') { labelEl.textContent = `Page: ${(ps.page || 0) + 1}`; return; }
      if (ps?.mode === 'offset') { labelEl.textContent = `Page: ${Math.floor((ps.offset || 0) / Math.max(1, ps.limit || 1)) + 1}`; return; }
      if (ps?.mode === 'cursor') { labelEl.textContent = `Page: ${(ps.pageIndex || 0) + 1}`; return; }
    }
    labelEl.textContent = `Page: ${page + 1}`;
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
    const prevEl = dom.prevBtn;
    const nextEl = dom.nextBtn;
    if (prevEl) {
      const onPrev = async () => {
        if (typeof store.pagePrev === 'function') {
          await runInternalChange(() => store.pagePrev());
          refresh();
          return;
        }
        page = Math.max(0, page - 1);
        refresh();
      };
      prevEl.addEventListener('click', onPrev);
      cleanupFns.push(() => prevEl.removeEventListener('click', onPrev));
    }
    if (nextEl) {
      const onNext = async () => {
        if (typeof store.pageNext === 'function') {
          await runInternalChange(() => store.pageNext());
          refresh();
          return;
        }
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

  // Note: pager is rendered/bound only when declared or when controls are omitted (auto default).

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
    root: contentRoot,
    model,
    view,
    ui: getUI(defaultRendererName),
    getUI,
    controller,
    onItemClick,
  });

  if (!layoutApi || typeof layoutApi.update !== 'function') {
    throw new Error('Layout mount() must return an object with update().');
  }
  cleanupFns.push(() => { try { layoutApi.destroy && layoutApi.destroy(); } catch { /* ignore */ } });

  const api = {
    onCreate: fn => listeners.create.push(fn),
    onDeleteSelected: fn => listeners.deleteSelected.push(fn),
    setPage: controller.setPage,
    getState: controller.getState,
    destroy: () => destroy(),
  };

  bindPagerButtons();
  bindActionButtons();

  // Bind custom control actions (if any)
  for (const [name, { el, spec }] of Object.entries(dom.custom || {})) {
    const action = spec?.action;
    if (!el || typeof action !== 'function') continue;
    const onClick = async () => {
      const ctx = {
        api,
        store,
        getState: () => controller.getState(),
        setStatus: (msg, color) => setStatus(dom, msg, color),
      };
      await action(ctx);
    };
    el.addEventListener('click', onClick);
    cleanupFns.push(() => el.removeEventListener('click', onClick));
  }

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

  return { api };
}

// Backwards-compatible alias (deprecated)
export { blinxCollection as renderBlinxCollection };

