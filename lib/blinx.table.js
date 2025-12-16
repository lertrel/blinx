
import { renderBlinxCollection } from './blinx.collection.js';

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
  // Preserve existing error messages for compatibility.
  if (!store || typeof store.getModel !== 'function') {
    throw new Error('renderBlinxTable requires a store that exposes getModel().');
  }
  const model = store.getModel();
  if (!model || !model.fields) {
    throw new Error('renderBlinxTable requires the store model to define fields.');
  }

  const { api } = renderBlinxCollection({
    root,
    store,
    ui,
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
