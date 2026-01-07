import { blinxStore } from './blinx.store.js';
import { blinxCart } from './blinx.cart.js';
import { blinxCollection } from './blinx.collection.js';
import { resolveComponentUIView } from './blinx.ui-views.js';
import { executeActionSpec } from './blinx.actions.js';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toIdRecord(value, keyField) {
  if (value === null || value === undefined) return null;
  if (isPlainObject(value)) return value;
  return { [keyField]: value };
}

function buildUniqueInitial({ initial, keyField, selectionMode }) {
  const raw = Array.isArray(initial) ? initial : [];
  const seen = new Set();
  const out = [];

  for (const item of raw) {
    const rec = toIdRecord(item, keyField);
    if (!rec) continue;
    const id = rec?.[keyField];
    if (id === undefined || id === null || id === '') {
      // If the key is missing, treat it as unique (best-effort).
      out.push(rec);
    } else if (!seen.has(id)) {
      seen.add(id);
      out.push(rec);
    }
    if (selectionMode === 'single' && out.length >= 1) break;
  }

  if (selectionMode === 'none') return [];
  return out;
}

export function blinxPicker({
  root,
  childStore,
  selectionMode,
  keyField = 'id',
  labelField,
  initial,
  views,
  createEnabled,
  context,
  actionRegistry,
  actionRunner,
  onConfirm,
  onCancel,
} = {}) {
  if (!root) throw new Error('blinxPicker requires a root element.');
  if (!childStore || typeof childStore.getModel !== 'function') {
    throw new Error('blinxPicker requires childStore to implement getModel().');
  }
  if (selectionMode !== 'none' && selectionMode !== 'single' && selectionMode !== 'multiple') {
    throw new Error('blinxPicker requires selectionMode to be one of "none" | "single" | "multiple".');
  }

  const childModel = childStore.getModel();
  if (!childModel || !childModel.fields) {
    throw new Error('blinxPicker requires childStore model to define fields.');
  }

  const modeForCollection =
    selectionMode === 'multiple' ? 'multi' :
    selectionMode === 'single' ? 'single' :
    'none';

  // Cart store: ephemeral array store with baseline reset.
  const initialRecords = buildUniqueInitial({ initial, keyField, selectionMode });
  const cartStore = blinxStore(initialRecords, childModel);
  try { cartStore.commit(); } catch { /* ignore */ }

  function getCartSnapshot() {
    const snap = cartStore.toJSON();
    return Array.isArray(snap) ? snap : [];
  }

  function getCartIds() {
    const ids = new Set();
    for (const rec of getCartSnapshot()) {
      const id = rec?.[keyField];
      if (id !== undefined && id !== null && id !== '') ids.add(id);
    }
    return ids;
  }

  // Ensure we can force-refresh table recordControls disabled state when the cart changes.
  let tableApi = null;
  function refreshTable() {
    try {
      const p = tableApi?.getState?.()?.page ?? 0;
      tableApi?.setPage?.(p);
    } catch { /* ignore */ }
  }

  function canAdd(record) {
    if (selectionMode === 'none') return false;
    const id = record?.[keyField];
    const ids = getCartIds();
    if (id !== undefined && id !== null && id !== '' && ids.has(id)) return false;
    if (selectionMode === 'single' && getCartSnapshot().length > 0) return false;
    return true;
  }

  function addToCart(record) {
    if (!canAdd(record)) return;
    cartStore.addRecord(record);
    refreshTable();
  }

  function removeFromCart(index) {
    try { cartStore.removeRecords([index]); } catch { /* ignore */ }
    refreshTable();
  }

  // Root layout
  root.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'blinx-picker';
  wrapper.setAttribute('data-blinx-theme', '');

  const cartRoot = document.createElement('div');
  cartRoot.className = 'blinx-picker__cart';
  const controlsRoot = document.createElement('div');
  controlsRoot.className = 'blinx-picker__controls blx-toolbar';
  const tableRoot = document.createElement('div');
  tableRoot.className = 'blinx-picker__table';

  const tableToolbarRoot = document.createElement('div');
  tableToolbarRoot.className = 'blinx-picker__table-toolbar blx-toolbar';
  const tableContentRoot = document.createElement('div');
  tableContentRoot.className = 'blinx-picker__table-content';
  tableRoot.append(tableToolbarRoot, tableContentRoot);

  wrapper.append(cartRoot, controlsRoot, tableRoot);
  root.appendChild(wrapper);

  // Cart: not selectable; use record control 🗑️ to remove.
  const { cartApi } = blinxCart({
    root: cartRoot,
    store: cartStore,
    model: childModel,
    labelField,
    selectable: false,
    editable: false,
    recordControls: {
      __picker_remove: {
        label: '🗑️',
        action: (ctx) => {
          // ctx.recordIndex is the cart item index (from blinxCollection record action ctx)
          const idx = Number.isFinite(ctx?.recordIndex) ? ctx.recordIndex : null;
          if (idx === null) return;
          removeFromCart(idx);
        },
      },
    },
    context,
    actionRegistry,
    actionRunner,
  });

  function refreshCart() {
    try {
      const p = cartApi?.getState?.()?.page ?? 0;
      cartApi?.setPage?.(p);
    } catch { /* ignore */ }
  }

  // Controls under cart
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'blx-btn';
  confirmBtn.setAttribute('data-variant', 'primary');
  confirmBtn.textContent = 'Confirm';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'blx-btn';
  resetBtn.setAttribute('data-variant', 'surface');
  resetBtn.textContent = 'Reset';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'blx-btn';
  cancelBtn.setAttribute('data-variant', 'surface');
  cancelBtn.textContent = 'Cancel';

  const statusEl = document.createElement('span');
  statusEl.className = 'blinx-picker__status';

  function setStatus(msg, color = '#4a5568') {
    statusEl.textContent = String(msg ?? '');
    statusEl.style.color = color;
  }

  controlsRoot.append(confirmBtn, resetBtn, cancelBtn, statusEl);

  const onConfirmClick = async () => {
    const selected = getCartSnapshot();
    try {
      if (typeof onConfirm === 'function') await onConfirm(selected);
      setStatus('', '#4a5568');
    } catch (e) {
      setStatus('Confirm failed.', '#e53e3e');
    }
  };
  const onResetClick = () => {
    try { cartStore.reset(); } catch { /* ignore */ }
    refreshCart();
    refreshTable();
    setStatus('Reset done.', '#4a5568');
  };
  const onCancelClick = async () => {
    try { cartStore.reset(); } catch { /* ignore */ }
    refreshCart();
    refreshTable();
    try {
      if (typeof onCancel === 'function') await onCancel();
      setStatus('', '#4a5568');
    } catch {
      setStatus('Cancel failed.', '#e53e3e');
    }
  };

  confirmBtn.addEventListener('click', onConfirmClick);
  resetBtn.addEventListener('click', onResetClick);
  cancelBtn.addEventListener('click', onCancelClick);

  // Table: force table layout, disable selection, add record control ➕.
  const tableViewRaw = (views && typeof views === 'object' && Object.prototype.hasOwnProperty.call(views, 'table'))
    ? views.table
    : undefined;
  const resolveArgs = { store: childStore, model: childModel, kind: 'collection' };
  if (tableViewRaw !== undefined) resolveArgs.view = tableViewRaw;
  const resolved = resolveComponentUIView(resolveArgs);
  const baseTableView = resolved ? { ...resolved, layout: 'table' } : resolved;
  if (baseTableView && typeof baseTableView === 'object') {
    const existingRC = isPlainObject(baseTableView.recordControls) ? baseTableView.recordControls : {};
    baseTableView.recordControls = {
      ...existingRC,
      __picker_add: {
        label: '➕',
        disabled: ({ record }) => !canAdd(record),
        action: ({ record }) => addToCart(record),
      },
    };
  }

  const resolvedCreateEnabled = (createEnabled === undefined)
    ? ((typeof childStore.isMutable === 'function') ? !!childStore.isMutable() : true)
    : !!createEnabled;

  if (resolvedCreateEnabled) {
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'blx-btn';
    createBtn.setAttribute('data-variant', 'surface');
    createBtn.textContent = 'Create';
    tableToolbarRoot.appendChild(createBtn);

    const onCreate = async () => {
      if (!resolvedCreateEnabled) return;
      // Journey hook (implementation lives outside this iteration).
      // We execute it through the shared action runner/registry mechanism.
      try {
        await executeActionSpec({
          action: 'blinx.global.journeys.create-single-model',
          ctx: {
            pickerApi: null, // reserved for future expansion
            store: childStore,
            model: childModel,
            context,
            setStatus,
          },
          registry: actionRegistry,
          runner: actionRunner,
          meta: { kind: 'picker', controlName: 'create' },
        });
        setStatus('', '#4a5568');
      } catch {
        setStatus('Create failed.', '#e53e3e');
      }
    };

    createBtn.addEventListener('click', onCreate);
  }

  // Allow search/pager toolbar auto-rendering, but disable built-in create/deleteSelected mutations.
  const { api } = blinxCollection({
    root: tableContentRoot,
    store: childStore,
    view: baseTableView,
    selection: { mode: 'none' },
    actions: { create: false, deleteSelected: false },
    context,
    actionRegistry,
    actionRunner,
  });
  tableApi = api;

  function destroy() {
    try { cartApi?.destroy?.(); } catch { /* ignore */ }
    try { tableApi?.destroy?.(); } catch { /* ignore */ }
    try { confirmBtn.removeEventListener('click', onConfirmClick); } catch { /* ignore */ }
    try { resetBtn.removeEventListener('click', onResetClick); } catch { /* ignore */ }
    try { cancelBtn.removeEventListener('click', onCancelClick); } catch { /* ignore */ }
    try { root.innerHTML = ''; } catch { /* ignore */ }
  }

  const pickerApi = {
    getSelected: () => getCartSnapshot(),
    reset: () => onResetClick(),
    destroy,
  };

  return { pickerApi };
}

// Backwards-compatible alias (deprecated)
export { blinxPicker as renderBlinxPicker };

