import { EventTypes } from './blinx.store.js';
import { RegisteredUI } from './blinx.registered-ui.js';
import { resolveComponentUIView } from './blinx.ui-views.js';
import { applyAttrs, resolvePresent } from './blinx.present.js';
import { BlinxConfig } from './blinx.config.js';
import {
  normalizeControlSpecEntry,
  resolveElementByIdWithinRoot,
  applyControlPresentation,
} from './blinx.controls.js';
import { executeActionSpec } from './blinx.actions.js';

const ROOT_CLEANUP = Symbol('blinxCollectionCleanup');

const BUILTIN_CONTROL_KEYS = [
  'createButton',
  'deleteSelectedButton',
  'status',
  'prevButton',
  'nextButton',
  'pageLabel',
  'searchInput',
  'searchButton',
];

function defaultBuiltinControlMeta(key) {
  switch (key) {
    case 'createButton': return { label: 'Create', css: 'blx-btn', variant: 'surface' };
    case 'deleteSelectedButton': return { label: 'Delete Selected', css: 'blx-btn', variant: 'surface' };
    case 'prevButton': return { label: 'Prev', css: 'blx-btn', variant: 'surface' };
    case 'nextButton': return { label: 'Next', css: 'blx-btn', variant: 'surface' };
    case 'pageLabel': return { label: '', css: '' };
    case 'searchButton': return { label: 'Search', css: 'blx-btn', variant: 'surface' };
    case 'status': return { label: '', css: '' };
    default: return { label: '', css: '' };
  }
}

function setStatus(dom, msg, color = '#4a5568') {
  if (!dom.status) return;
  dom.status.textContent = msg;
  dom.status.style.color = color;
}

function createDefaultToolbar(root, { includeActions = true, includePager = true, includeSearch = false } = {}) {
  const toolbar = document.createElement('div');
  toolbar.className = 'blx-toolbar blinx-controls';
  const createBtn = document.createElement('button'); createBtn.type = 'button';
  const deleteSelectedBtn = document.createElement('button'); deleteSelectedBtn.type = 'button';
  const prevBtn = document.createElement('button'); prevBtn.type = 'button';
  const nextBtn = document.createElement('button'); nextBtn.type = 'button';
  const pageLabel = document.createElement('span'); pageLabel.textContent = 'Page: 1';
  const searchInput = document.createElement('input'); searchInput.type = 'text'; searchInput.className = 'blx-input'; searchInput.setAttribute('data-blinx-part', 'input');
  const searchBtn = document.createElement('button'); searchBtn.type = 'button';
  const status = document.createElement('span');

  const meta = {
    createButton: defaultBuiltinControlMeta('createButton'),
    deleteSelectedButton: defaultBuiltinControlMeta('deleteSelectedButton'),
    prevButton: defaultBuiltinControlMeta('prevButton'),
    nextButton: defaultBuiltinControlMeta('nextButton'),
    searchButton: defaultBuiltinControlMeta('searchButton'),
  };
  createBtn.textContent = meta.createButton.label; createBtn.className = meta.createButton.css;
  deleteSelectedBtn.textContent = meta.deleteSelectedButton.label; deleteSelectedBtn.className = meta.deleteSelectedButton.css;
  prevBtn.textContent = meta.prevButton.label; prevBtn.className = meta.prevButton.css;
  nextBtn.textContent = meta.nextButton.label; nextBtn.className = meta.nextButton.css;
  searchBtn.textContent = meta.searchButton.label; searchBtn.className = meta.searchButton.css;
  if (meta.createButton.variant) createBtn.setAttribute('data-variant', meta.createButton.variant);
  if (meta.deleteSelectedButton.variant) deleteSelectedBtn.setAttribute('data-variant', meta.deleteSelectedButton.variant);
  if (meta.prevButton.variant) prevBtn.setAttribute('data-variant', meta.prevButton.variant);
  if (meta.nextButton.variant) nextBtn.setAttribute('data-variant', meta.nextButton.variant);
  if (meta.searchButton.variant) searchBtn.setAttribute('data-variant', meta.searchButton.variant);

  const nodes = [];
  if (includeActions) nodes.push(createBtn, deleteSelectedBtn);
  if (includePager) nodes.push(prevBtn, nextBtn, pageLabel);
  if (includeSearch) nodes.push(searchInput, searchBtn);
  nodes.push(status);
  toolbar.append(...nodes);
  root.appendChild(toolbar);
  return { toolbar, createBtn, deleteSelectedBtn, prevBtn, nextBtn, pageLabel, searchInput, searchBtn, status };
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
    mount({ root, model, view, getUI, supportsRendererForCell, controller, onItemClick, ctx }) {
      const table = document.createElement('table');
      table.className = 'blx-table';
      const thead = document.createElement('thead');
      const thr = document.createElement('tr');
      thead.appendChild(thr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      root.appendChild(table);

      function update() {
        // Rebuild header so present(ctx, null, null) can be re-evaluated safely.
        thr.innerHTML = '';
        const thSel = document.createElement('th');
        thSel.textContent = 'Sel';
        thr.appendChild(thSel);
        (view.columns || []).forEach(col => {
          const th = document.createElement('th');
          th.textContent = col.label;
          const p = resolvePresent(col?.present, ctx, null, null);
          if (p?.attrs) {
            applyAttrs(th, p.attrs.header);
            // Fallback alias (useful for simple cases).
            applyAttrs(th, p.attrs.root);
          }
          thr.appendChild(th);
        });

        tbody.innerHTML = '';
        const { items } = controller.getState();
        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const tr = document.createElement('tr');

          // Row-level present hook (attrs only).
          const rowP = resolvePresent(view?.rowPresent, ctx, record, index);
          if (rowP?.attrs) {
            applyAttrs(tr, rowP.attrs.row);
            // Fallback alias (useful for simple cases).
            applyAttrs(tr, rowP.attrs.root);
          }

          const tdSel = document.createElement('td');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'blx-checkbox';
          cb.checked = controller.isSelected(index);
          if (typeof controller.isRowSelectable === 'function') {
            const selectable = !!controller.isRowSelectable(index, record);
            cb.disabled = !selectable;
            cb.setAttribute('aria-disabled', selectable ? 'false' : 'true');
          }
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
            const def = model.fields[col.field];
            const requestedUI = getUI(rendererName);
            let uiToUse = requestedUI;
            let rendererToUse = rendererName;

            if (!supportsRendererForCell({ ui: requestedUI, rendererName, fieldKey: col.field, fieldDef: def })) {
              const fallback = BlinxConfig.getUIFallbackRenderer();
              if (fallback && fallback !== rendererName) {
                const fallbackUI = getUI(fallback);
                if (supportsRendererForCell({ ui: fallbackUI, rendererName: fallback, fieldKey: col.field, fieldDef: def })) {
                  uiToUse = fallbackUI;
                  rendererToUse = fallback;
                }
              }

              if (uiToUse === requestedUI && rendererToUse === rendererName) {
                if (BlinxConfig.isUIRendererStrict()) {
                  const m = String(model?.id || model?.name || 'unknown');
                  const t = String(def?.type || 'unknown');
                  throw new Error(`blinxCollection: renderer "${String(rendererName)}" does not support field "${String(col.field)}" (type "${t}") for model "${m}".`);
                }
                uiToUse = null;
              }
            }

            if (uiToUse) {
              td.textContent = uiToUse.formatCell(record?.[col.field], def);
            } else {
              // Use nullish coalescing: allow legitimate empty strings to stay empty.
              const rendered = getUI('default').formatCell(record?.[col.field], def);
              td.textContent = rendered ?? BlinxConfig.getUIUnsupportedPlaceholder();
              td.setAttribute('data-blinx-unsupported', 'true');
            }

            // Column-level present hook (attrs only).
            const cellP = resolvePresent(col?.present, ctx, record, index);
            if (cellP?.attrs) {
              applyAttrs(td, cellP.attrs.cell);
              // Allow column-level augmentation of the row too (optional).
              applyAttrs(tr, cellP.attrs.row);
              // Fallback aliases.
              applyAttrs(td, cellP.attrs.root);
            }

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
    mount({ root, view, controller, onItemClick, ctx }) {
      const grid = document.createElement('div');
      grid.className = 'blx-grid blx-grid-auto-fit';
      root.appendChild(grid);

      function update() {
        grid.innerHTML = '';
        const { items } = controller.getState();
        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const card = document.createElement('article');
          card.className = 'blx-card';

          const rowP = resolvePresent(view?.rowPresent, ctx, record, index);
          if (rowP?.attrs) {
            applyAttrs(card, rowP.attrs.row);
            applyAttrs(card, rowP.attrs.root);
          }

          const titleField = view.item?.titleField;
          if (titleField) {
            const h = document.createElement('header');
            h.className = 'blx-card__title';
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
    mount({ root, view, controller, onItemClick, ctx }) {
      const list = document.createElement('div');
      list.className = 'blx-stack';
      root.appendChild(list);

      function update() {
        list.innerHTML = '';
        const { items } = controller.getState();
        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const item = document.createElement('article');
          item.className = 'blx-card';

          const rowP = resolvePresent(view?.rowPresent, ctx, record, index);
          if (rowP?.attrs) {
            applyAttrs(item, rowP.attrs.row);
            applyAttrs(item, rowP.attrs.root);
          }

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
  // Optional: per-consumer local view (derived store with its own criteria + event bus).
  // When provided, Blinx will bind this collection to `store.localView(localView)`.
  localView,
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
  context,
  actionRegistry,
  actionRunner,
} = {}) {
  const args = arguments?.[0] || {};
  const localViewProvided = Object.prototype.hasOwnProperty.call(args, 'localView');

  // Resolve declarative data view (if requested).
  if (dataView && typeof dataView === 'string') {
    if (dataView !== 'active') {
      if (store && typeof store.view === 'function') store = store.view(dataView);
      else if (store && typeof store.collection === 'function') store = store.collection(dataView);
      else throw new Error('blinxCollection: dataView requires a multi-view store (with view()/collection()).');
    }
  }

  // Resolve per-consumer local view (if requested).
  if (localViewProvided) {
    const lv =
      (typeof localView === 'string' && localView) ? localView :
      (localView && typeof localView === 'object') ? localView :
      null;
    if (lv) {
      if (store && typeof store.localView === 'function') {
        store = store.localView(lv);
      } else {
        throw new Error('blinxCollection: localView requires a store that implements localView(localViewKey).');
      }
    }
  }

  if (!store || typeof store.getModel !== 'function') {
    throw new Error('blinxCollection requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxCollection requires the store model to define fields.');
  }
  if (!root) throw new Error('blinxCollection requires a root element.');

  // Resolve declarative UI view:
  // - object => already resolved
  // - string => registry (model+kind+name)
  // - omitted => registry default for model+kind
  const kind = 'collection';
  const resolvedView = resolveComponentUIView({ store, model, kind, view });
  if (!resolvedView) {
    const key = (typeof view === 'string') ? `"${String(view)}"` : '(default)';
    throw new Error(`blinxCollection: unable to resolve ui view ${key} for model "${String(model?.id || model?.name || 'unknown')}".`);
  }
  view = resolvedView;
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

  function supportsRendererForCell({ ui, rendererName, fieldKey, fieldDef }) {
    if (!ui || typeof ui !== 'object') return true;
    if (typeof ui.supportsField !== 'function') return true; // back-compat
    try {
      return !!ui.supportsField({
        model,
        fieldKey,
        fieldDef,
        kind: 'collection',
        mode: 'cell',
        rendererName,
      });
    } catch {
      return false;
    }
  }

  // If the same root is re-rendered, clean up prior subscriptions/handlers first.
  if (root && typeof root[ROOT_CLEANUP] === 'function') {
    try { root[ROOT_CLEANUP](); } catch { /* ignore */ }
  }

  root.innerHTML = '';
  const contentRoot = document.createElement('div');
  contentRoot.className = 'blinx-collection__content';
  contentRoot.setAttribute('data-blinx-theme', '');
  root.appendChild(contentRoot);

  const baseCtx = { store, model, view, kind: 'collection' };
  const ctx = (context && typeof context === 'object') ? { ...baseCtx, ...context } : baseCtx;

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
  const isStoreMutable = () => (store && typeof store.isMutable === 'function') ? !!store.isMutable() : true;
  const selectionMode = selection?.mode || 'multi';
  const rowSelectablePredicate = (typeof selection?.isRowSelectable === 'function') ? selection.isRowSelectable : null;

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
    searchInput: null,
    searchBtn: null,
    custom: {},
  };
  const builtinSpecs = {}; // key -> meta/spec (including disabled/visible functions)
  let internalToolbar = null;

  function ensureToolbar() {
    if (internalToolbar) return internalToolbar;
    internalToolbar = document.createElement('div');
    internalToolbar.className = 'blx-toolbar blinx-controls';
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
    // Allow disabled to be a function(ctx) => boolean (evaluated by this adapter).
    meta.__disabledFn = (typeof meta.disabled === 'function') ? meta.disabled : null;
    meta.disabled = (typeof meta.disabled === 'boolean') ? meta.disabled : false;
    meta.__visibleFn = (typeof meta.visible === 'function') ? meta.visible : null;
    meta.visible = (typeof meta.visible === 'boolean') ? meta.visible : true;
    builtinSpecs[key] = meta;

    if (typeof meta.domId === 'string' && meta.domId) {
      const existing = resolveElementByIdWithinRoot(root, meta.domId);
      applyControlPresentation(existing, meta);
      return existing;
    }

    let el;
    if (key === 'status' || key === 'pageLabel') el = document.createElement('span');
    else if (key === 'searchInput') { el = document.createElement('input'); el.type = 'text'; el.className = 'blx-input'; el.setAttribute('data-blinx-part', 'input'); }
    else { el = document.createElement('button'); el.type = 'button'; }
    if (meta.label && el.tagName === 'BUTTON') el.textContent = meta.label;
    applyControlPresentation(el, meta);
    ensureToolbar().appendChild(el);
    return el;
  }

  const searchFields = Array.isArray(view?.searchFields)
    ? view.searchFields.filter(f => typeof f === 'string' && f.length > 0)
    : [];
  let searchTerm = '';

  if (resolvedControlsSpec === false || resolvedControlsSpec === null) {
    // Explicitly disable controls.
  } else if (!explicitControlsProvided && resolvedControlsSpec === undefined) {
    // Auto-render defaults when controls are omitted everywhere.
    const includeActions = !!actions?.create || !!actions?.deleteSelected;
    const includePager = true;
    const includeSearch = searchFields.length > 0;
    const t = createDefaultToolbar(root, { includeActions, includePager, includeSearch });
    cleanupFns.push(() => { try { t?.toolbar?.remove(); } catch { /* ignore */ } });
    dom.createBtn = t.createBtn;
    dom.deleteSelectedBtn = t.deleteSelectedBtn;
    dom.prevBtn = t.prevBtn;
    dom.nextBtn = t.nextBtn;
    dom.pageLabel = t.pageLabel;
    dom.searchInput = t.searchInput || null;
    dom.searchBtn = t.searchBtn || null;
    dom.status = t.status;
  } else if (resolvedControlsSpec && typeof resolvedControlsSpec === 'object') {
    // Render/bind only explicitly declared controls.
    dom.createBtn = ensureBuiltin('createButton');
    dom.deleteSelectedBtn = ensureBuiltin('deleteSelectedButton');
    dom.prevBtn = ensureBuiltin('prevButton');
    dom.nextBtn = ensureBuiltin('nextButton');
    dom.pageLabel = ensureBuiltin('pageLabel');
    dom.searchInput = ensureBuiltin('searchInput');
    dom.searchBtn = ensureBuiltin('searchButton');
    dom.status = ensureBuiltin('status');

    for (const [key, raw] of Object.entries(resolvedControlsSpec)) {
      if (BUILTIN_CONTROL_KEYS.includes(key)) continue;
      const entry = normalizeControlSpecEntry(raw);
      if (!entry) continue;
      const meta = { label: key, ...entry };
      meta.__disabledFn = (typeof meta.disabled === 'function') ? meta.disabled : null;
      meta.disabled = (typeof meta.disabled === 'boolean') ? meta.disabled : false;
      meta.__visibleFn = (typeof meta.visible === 'function') ? meta.visible : null;
      meta.visible = (typeof meta.visible === 'boolean') ? meta.visible : true;

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
    const itemsAll = [];
    for (let i = 0; i < data.length; i++) itemsAll.push({ index: i, record: data[i] });

    const effective = (() => {
      let rows = itemsAll;

      // UI-level keyword search over view.searchFields (no store mutation).
      const term = String(searchTerm || '').trim().toLowerCase();
      if (term && searchFields.length) {
        rows = rows.filter(({ record }) => {
          for (const f of searchFields) {
            const v = record?.[f];
            if (v === undefined || v === null) continue;
            const s = Array.isArray(v) ? v.join(', ') : String(v);
            if (s.toLowerCase().includes(term)) return true;
          }
          return false;
        });
      }

      // UI-level default sort for consistency across local + remote stores.
      const sort = Array.isArray(view?.defaultSort) ? view.defaultSort : null;
      if (sort && sort.length) {
        const specs = sort
          .filter(Boolean)
          .map(s => ({ field: s.field, dir: (s.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' }))
          .filter(s => typeof s.field === 'string' && s.field.length > 0);

        if (specs.length) {
          // Stable sort: decorate with original position.
          const decorated = rows.map((r, pos) => ({ ...r, __pos: pos }));
          decorated.sort((a, b) => {
            for (const s of specs) {
              const av = a.record?.[s.field];
              const bv = b.record?.[s.field];
              if (av === bv) continue;
              if (av === undefined || av === null) return s.dir === 'asc' ? 1 : -1;
              if (bv === undefined || bv === null) return s.dir === 'asc' ? -1 : 1;
              if (av < bv) return s.dir === 'asc' ? -1 : 1;
              if (av > bv) return s.dir === 'asc' ? 1 : -1;
            }
            return a.__pos - b.__pos;
          });
          rows = decorated.map(({ __pos, ...rest }) => rest);
        }
      }

      return rows;
    })();

    if (remotePaging) {
      page = 0;
      pruneSelection(data.length);
      return { items: effective, start: 0, end: effective.length, total: effective.length, maxPage: 0 };
    }
    const maxPage = getMaxPage(effective.length);
    page = Math.min(Math.max(page, 0), maxPage);
    pruneSelection(data.length);
    const start = page * pageSize;
    const end = Math.min(effective.length, start + pageSize);
    const items = [];
    for (let i = start; i < end; i++) items.push(effective[i]);
    return { items, start, end, total: effective.length, maxPage: getMaxPage(effective.length) };
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

  function setDisabled(el, disabled) {
    if (!el) return;
    const on = !!disabled;
    if ('disabled' in el) el.disabled = on;
    try { el.setAttribute('aria-disabled', on ? 'true' : 'false'); } catch { /* ignore */ }
  }

  function syncEmptyStateControls() {
    const total = store.getLength();
    const empty = total === 0;
    const mutable = isStoreMutable();
    // When there are no records, keep Create enabled but disable navigation + delete-selected.
    setDisabled(dom.prevBtn, empty);
    setDisabled(dom.nextBtn, empty);
    setDisabled(dom.createBtn, !mutable);
    setDisabled(dom.deleteSelectedBtn, empty || !mutable);
  }

  function refresh() {
    const data = getDataSnapshot();
    const { items } = getItemsForCurrentPage(data);
    layoutApi.update();
    syncDynamicControls();
    updatePagerLabel();
    syncEmptyStateControls();
    return items;
  }

  function syncDynamicControls() {
    const state = controller.getState();
    const controlCtx = {
      api,
      store,
      model,
      view,
      kind: 'collection',
      getState: () => state,
      controls: dom,
      context: ctx,
    };

    // Builtins declared via view.controls / controls param.
    for (const [key, spec] of Object.entries(builtinSpecs)) {
      const el =
        key === 'createButton' ? dom.createBtn :
        key === 'deleteSelectedButton' ? dom.deleteSelectedBtn :
        key === 'prevButton' ? dom.prevBtn :
        key === 'nextButton' ? dom.nextBtn :
        key === 'pageLabel' ? dom.pageLabel :
        key === 'searchInput' ? dom.searchInput :
        key === 'searchButton' ? dom.searchBtn :
        key === 'status' ? dom.status :
        null;
      if (!el || !spec) continue;
      const next = { ...spec };
      if (spec.__visibleFn) {
        try { next.visible = !!spec.__visibleFn(controlCtx); } catch { next.visible = false; }
      }
      if (spec.__disabledFn) {
        try { next.disabled = !!spec.__disabledFn(controlCtx); } catch { next.disabled = true; }
      }
      applyControlPresentation(el, next);
    }

    // Custom controls declared in view.controls / controls param.
    for (const { el, spec } of Object.values(dom.custom || {})) {
      if (!el || !spec) continue;
      const next = { ...spec };
      if (spec.__visibleFn) {
        try { next.visible = !!spec.__visibleFn(controlCtx); } catch { next.visible = false; }
      }
      if (spec.__disabledFn) {
        try { next.disabled = !!spec.__disabledFn(controlCtx); } catch { next.disabled = true; }
      }
      applyControlPresentation(el, next);
    }
  }

  function isSelected(index) {
    return selected.has(index);
  }

  function toggleSelected(index, checked) {
    if (selectionMode === 'none') return;
    const data = getDataSnapshot();
    const record = data[index];
    if (rowSelectablePredicate) {
      try {
        const ok = !!rowSelectablePredicate(ctx, record, index);
        if (!ok) return;
      } catch {
        return;
      }
    }
    const needsRefresh = selectionMode === 'single';
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
    if (!isStoreMutable()) return setStatus(dom, 'Create is disabled for this view.', '#e53e3e');
    const keys = Object.keys(model.fields || {}).filter(k => !model?.fields?.[k]?.computed);
    runInternalChange(() => store.addRecord(Object.fromEntries(keys.map(k => [k, '']))));
    refresh();
    setStatus(dom, 'New row created.', '#2f855a');
  }

  async function doDeleteSelected() {
    if (!isStoreMutable()) return setStatus(dom, 'Delete is disabled for this view.', '#e53e3e');
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

  function bindSearchControls() {
    if (!dom.searchInput || !searchFields.length) return;
    const input = dom.searchInput;
    const apply = () => {
      searchTerm = input.value || '';
      refresh();
    };
    const onInput = () => apply();
    input.addEventListener('input', onInput);
    cleanupFns.push(() => input.removeEventListener('input', onInput));
    if (dom.searchBtn) {
      const onClick = () => apply();
      dom.searchBtn.addEventListener('click', onClick);
      cleanupFns.push(() => dom.searchBtn.removeEventListener('click', onClick));
    }
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
    isRowSelectable: (index, record) => {
      if (selectionMode === 'none') return false;
      if (!rowSelectablePredicate) return true;
      try { return !!rowSelectablePredicate(ctx, record, index); } catch { return false; }
    },
    clearSelection: () => { selected.clear(); refresh(); },
    runInternalChange,
  };

  const layoutApi = layout.mount({
    root: contentRoot,
    model,
    view,
    ui: getUI(defaultRendererName),
    getUI,
    supportsRendererForCell,
    ctx,
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
  bindSearchControls();

  // Bind custom control actions (if any)
  for (const [name, { el, spec }] of Object.entries(dom.custom || {})) {
    const action = spec?.action;
    if (!el || !action) continue;
    const onClick = async () => {
      const ctx = {
        api,
        store,
        getState: () => controller.getState(),
        setStatus: (msg, color) => setStatus(dom, msg, color),
      };
      try {
        const res = await executeActionSpec({
          action,
          ctx,
          registry: actionRegistry,
          runner: actionRunner,
          meta: { kind: 'collection', controlName: name, viewId: view?.id },
        });
        if (res?.status === 'invalid') {
          ctx.setStatus(`Action "${name}" blocked.`, '#e53e3e');
        }
      } catch (e) {
        // Best-effort feedback; avoid unhandled rejections from async click handlers.
        ctx.setStatus(`Action "${name}" failed.`, '#e53e3e');
      }
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

  // Best-effort: for remote stores, apply default sort via criteria if not already set.
  // This avoids the "page-only" limitations of client-side sorting across remote pages.
  try {
    const sort = Array.isArray(view?.defaultSort) ? view.defaultSort : null;
    if (sort && typeof store.search === 'function' && typeof store.getStatus === 'function') {
      const cur = store.getStatus()?.criteria?.sort || null;
      if (!cur) {
        // Fire-and-forget; store events will refresh the UI.
        store.search({ sort }).catch(() => {});
      }
    }
  } catch { /* ignore */ }

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

