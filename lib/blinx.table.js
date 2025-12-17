
import { blinxCollection } from './blinx.collection.js';
import { RegisteredUI } from './blinx.registered-ui.js';

export function blinxTable({
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
    throw new Error('blinxTable requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('blinxTable requires the store model to define fields.');
  }

  // Compatibility: blinxCollection no longer accepts `ui`. If provided, register it
  // as the default renderer *before* the collection renders.
  if (ui !== undefined) {
    try {
      if (!RegisteredUI.isLocked()) RegisteredUI.register('default', ui);
    } catch {
      // If registration fails (locked/invalid renderer), fall back to whatever is already registered.
    }
  }

  const { api } = blinxCollection({
    root,
    store,
    view: { ...view, layout: 'table' },
    paging: { pageSize, page: 0 },
    selection: { mode: 'multi' },
    actions: { create: true, deleteSelected: true },
    controls,
    onItemClick: onRowClick ? ({ index }) => onRowClick(index) : null,
  });

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
