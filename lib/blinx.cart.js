import { blinxStore } from './blinx.store.js';
import { blinxCollection } from './blinx.collection.js';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function cartLabelFieldFromView(view, fallback) {
  if (view?.item?.labelField) return String(view.item.labelField);
  if (view?.labelField) return String(view.labelField);
  const firstCol = Array.isArray(view?.columns) ? view.columns[0] : null;
  if (firstCol?.field) return String(firstCol.field);
  return fallback ? String(fallback) : null;
}

function createCartLayout() {
  return {
    mount({ root: mountRoot, view, controller, onItemClick, ctx, runRecordAction }) {
      const list = document.createElement('div');
      list.className = 'blx-cart';
      mountRoot.appendChild(list);

      function update() {
        list.innerHTML = '';
        const state = controller.getState();
        const items = state?.items || [];
        const selectionMode = state?.selectionMode || 'multi';
        const selectable = selectionMode !== 'none';

        const labelField = cartLabelFieldFromView(view, null);

        const recordControls = isPlainObject(view?.recordControls) ? view.recordControls : null;
        const recordControlEntries = recordControls ? Object.entries(recordControls) : [];

        const prefix = isPlainObject(view?.prefix) ? view.prefix : null;

        const frag = document.createDocumentFragment();
        for (const { index, record } of items) {
          const row = document.createElement('div');
          row.className = 'blx-cart__row';

          const selected = selectable ? controller.isSelected(index) : true;
          if (selectable && !selected) row.classList.add('blx-cart__row--deselected');

          // Prefix (either selection checkbox or an icon)
          const prefixEl = document.createElement('span');
          prefixEl.className = 'blx-cart__prefix';

          if (selectable) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'blx-checkbox';
            cb.checked = selected;
            if (typeof controller.isRowSelectable === 'function') {
              const rowSelectable = !!controller.isRowSelectable(index, record);
              cb.disabled = !rowSelectable;
              cb.setAttribute('aria-disabled', rowSelectable ? 'false' : 'true');
            }
            cb.addEventListener('change', () => {
              controller.toggleSelected(index, cb.checked);
              // Multi-select mode does not always force a refresh; keep crossed-out styling in sync.
              if (cb.checked) row.classList.remove('blx-cart__row--deselected');
              else row.classList.add('blx-cart__row--deselected');
            });
            prefixEl.appendChild(cb);
          } else {
            const icon = document.createElement('span');
            icon.className = 'blx-cart__prefix-icon';
            icon.textContent = (typeof prefix?.label === 'string' && prefix.label) ? prefix.label : '➖';
            prefixEl.appendChild(icon);
          }

          const label = document.createElement('span');
          label.className = 'blx-cart__label';
          if (labelField) label.textContent = record?.[labelField] ?? '';
          else label.textContent = record ? String(record) : '';

          const controls = document.createElement('span');
          controls.className = 'blx-cart__controls';

          for (const [name, spec] of recordControlEntries) {
            const raw = isPlainObject(spec) ? spec : {};
            const controlCtx = {
              store: ctx?.store,
              model: ctx?.model,
              view: ctx?.view,
              kind: ctx?.kind,
              record,
              index,
              getState: () => controller.getState(),
              context: ctx,
            };
            const visible = (typeof raw.visible === 'function')
              ? (() => { try { return !!raw.visible(controlCtx); } catch { return false; } })()
              : (typeof raw.visible === 'boolean' ? raw.visible : true);
            if (!visible) continue;
            const disabled = (typeof raw.disabled === 'function')
              ? (() => { try { return !!raw.disabled(controlCtx); } catch { return true; } })()
              : (typeof raw.disabled === 'boolean' ? raw.disabled : false);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'blx-cart__control';
            btn.textContent = (typeof raw.label === 'string' && raw.label) ? raw.label : String(name);
            btn.disabled = !!disabled;
            btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            btn.addEventListener('click', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (btn.disabled) return;
              if (typeof runRecordAction === 'function') {
                await runRecordAction({ name, action: raw.action, record, index, meta: { kind: 'cart', controlName: name, viewId: view?.id } });
              }
            });
            controls.appendChild(btn);
          }

          row.append(prefixEl, label, controls);

          if (onItemClick) {
            row.addEventListener('click', (e) => {
              // Prevent row click when interacting with checkbox/buttons.
              const t = e.target;
              if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON')) return;
              onItemClick({ index, record });
            });
          }

          frag.appendChild(row);
        }
        list.appendChild(frag);
      }

      return { update, destroy: () => { try { list.remove(); } catch { /* ignore */ } } };
    }
  };
}

export function blinxCart({
  root,
  view,
  labelField,
  data = [],
  model,
  selectable = true,
  editable = false,
  onRowClick,
  controls,
  recordControls,
  context,
  actionRegistry,
  actionRunner,
} = {}) {
  if (!root) throw new Error('blinxCart requires a root element.');
  if (!model || !isPlainObject(model) || !isPlainObject(model.fields)) {
    throw new Error('blinxCart requires a model with fields.');
  }
  if (!labelField && !(view && typeof view === 'object')) {
    throw new Error('blinxCart requires labelField when view is not provided.');
  }

  const store = blinxStore(Array.isArray(data) ? data : [], model);

  const defaultControls = {
    resetButton: {
      label: 'Reset',
      action: (ctx2) => ctx2?.api?.resetSelection?.(),
    }
  };
  const givenControls = isPlainObject(controls) ? controls : {};

  const defaultRecordControls = editable
    ? {
      editIcon: {
        label: '⚙️',
        action: 'blinx.global.journeys.edit-single-model',
      }
    }
    : {};
  const givenRecordControls = isPlainObject(recordControls) ? recordControls : {};

  const cartView = (view && typeof view === 'object') ? view : {
    layout: 'cart',
    columns: [{ field: String(labelField), label: String(labelField) }],
    item: { labelField: String(labelField) },
    controls: { ...defaultControls, ...givenControls },
    recordControls: { ...defaultRecordControls, ...givenRecordControls },
    prefix: { label: '➖' },
  };

  const pageSize = Math.max(1, store.getLength());

  const { api } = blinxCollection({
    root,
    store,
    view: cartView,
    layouts: { cart: createCartLayout() },
    paging: { pageSize, page: 0 },
    selection: { mode: selectable ? 'multi' : 'none' },
    actions: { create: false, deleteSelected: false },
    controls: cartView.controls,
    onItemClick: onRowClick ? ({ index }) => onRowClick(index) : null,
    context,
    actionRegistry,
    actionRunner,
  });

  // Cart default: initial selection includes all items when selectable.
  if (selectable) {
    const all = Array.from({ length: store.getLength() }, (_, i) => i);
    api.setSelection(all, { asBaseline: true });
  }

  function getSelected() {
    // Commit the store snapshot, then return selected records.
    try { store.commit(); } catch { /* ignore */ }
    const state = api.getState();
    const sel = state?.selected instanceof Set ? state.selected : new Set();
    const dataSnap = store.toJSON();
    const out = [];
    sel.forEach((idx) => {
      if (idx >= 0 && idx < dataSnap.length) out.push(dataSnap[idx]);
    });
    return out;
  }

  return {
    cartApi: {
      ...api,
      getSelected,
    }
  };
}

// Backwards-compatible alias (deprecated)
export { blinxCart as renderBlinxCart };

