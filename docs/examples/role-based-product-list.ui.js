import { createBlinxStore } from '../../lib/blinx.store.js';
import { renderBlinxTable } from '../../lib/blinx.table.js';
import { BlinxDefaultAdapter } from '../../lib/blinx.adapters.default.js';
import {
  productModel,
  productTableView,
  initialDataset,
} from '../../model/product.model.js';

const rolePolicies = {
  admin: {
    hiddenColumns: [],
    allowActions: ['create', 'delete'],
  },
  manager: {
    hiddenColumns: ['discount'],
    allowActions: ['create'],
  },
  guest: {
    hiddenColumns: ['price', 'discount', 'active'],
    allowActions: [],
  },
};

const tableRoot = document.getElementById('productTable');
const roleSelect = document.getElementById('roleSelect');
const roleBadge = document.getElementById('activeRole');
const createBtn = document.getElementById('createProduct');
const deleteBtn = document.getElementById('deleteSelected');

const controls = {
  createButtonId: 'createProduct',
  deleteSelectedButtonId: 'deleteSelected',
  statusId: 'tableStatus',
  prevButtonId: 'prevPage',
  nextButtonId: 'nextPage',
  pageLabelId: 'pageLabel',
};

const store = createBlinxStore(initialDataset, productModel);
const adapter = new BlinxDefaultAdapter();

const extendedTableView = {
  ...productTableView,
  columns: [
    ...productTableView.columns,
    { field: 'discount', label: 'Discount (%)' },
  ],
};

function buildPolicyAwareView(role) {
  const policy = rolePolicies[role] || rolePolicies.manager;
  const hidden = new Set(policy.hiddenColumns || []);
  return {
    ...extendedTableView,
    columns: extendedTableView.columns.filter(col => !hidden.has(col.field)),
  };
}

function syncActions(policy) {
  const canCreate = policy.allowActions.includes('create');
  const canDelete = policy.allowActions.includes('delete');
  createBtn.disabled = !canCreate;
  deleteBtn.disabled = !canDelete;
}

function render(role) {
  const policy = rolePolicies[role] || rolePolicies.manager;
  const policyAwareView = buildPolicyAwareView(role);
  renderBlinxTable({
    root: tableRoot,
    view: policyAwareView,
    store,
    ui: adapter,
    controls,
    pageSize: 5,
  });
  syncActions(policy);
  roleBadge.textContent = role;
}

roleSelect.addEventListener('change', event => render(event.target.value));

render(roleSelect.value);
