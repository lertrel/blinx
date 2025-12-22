
import { blinxCollection } from './blinx.collection.js';
import { resolveComponentUIView } from './blinx.ui-views.js';

export function blinxTable({
  root, view, store,
  pageSize = 20,
  onRowClick,
  controls,
}) {
  if (!store || typeof store.getModel !== 'function') {
    throw new Error('blinxTable requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxTable requires the store model to define fields.');
  }

  const args = arguments?.[0] || {};
  const viewProvided = Object.prototype.hasOwnProperty.call(args, 'view');

  // Resolve the view here so we can ALWAYS enforce table layout,
  // even when `view` is a string (named view reference).
  const resolveArgs = { store, model, kind: 'collection' };
  if (viewProvided) resolveArgs.view = view;
  const resolved = resolveComponentUIView(resolveArgs);
  const viewForCollection = resolved ? { ...resolved, layout: 'table' } : resolved;

  const opts = {
    root,
    store,
    view: viewForCollection,
    paging: { pageSize, page: 0 },
    selection: { mode: 'multi' },
    actions: { create: true, deleteSelected: true },
    onItemClick: onRowClick ? ({ index }) => onRowClick(index) : null,
  };
  if (Object.prototype.hasOwnProperty.call(args, 'controls')) opts.controls = controls;

  const { api } = blinxCollection(opts);

  return {
    tableApi: {
      onCreate: fn => api.onCreate(fn),
      onDeleteSelected: fn => api.onDeleteSelected(fn),
      destroy: () => api.destroy(),
    }
  };
}

// Backwards-compatible alias (deprecated)
export { blinxTable as renderBlinxTable };
