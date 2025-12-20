
import { DataTypes } from '../../../lib/blinx.store.js';

export const productModel = {
  entity: 'Product',
  fields: {
    id:    { type: DataTypes.string, readonly: true, css: 'text-gray-600' },
    name:  { type: DataTypes.string, required: true, length: { max: 100 }, css: 'font-medium' },
    price: { type: DataTypes.number, required: true, min: 0, step: 0.01 },
    active:{ type: DataTypes.boolean, required: false },
    category: { type: DataTypes.enum, values: ['Standard', 'Premium', 'Deluxe'] },
    releaseDate: { type: DataTypes.date, required: false },
    tags:  { type: DataTypes.array, itemType: DataTypes.string },
    discount: {type: DataTypes.number, required: false, min: 0, max: 100}
  },
};

export const productFormView = {
  sections: [{ title: 'General', columns: 2, fields: ['id', 'name', 'price', 'active', 'category', 'releaseDate', 'tags'] }],
};

export const productTableView = {
  columns: [
    { field: 'id', label: 'ID' },
    { field: 'name', label: 'Name' },
    { field: 'price', label: 'Price' },
    { field: 'active', label: 'Active' },
    { field: 'category', label: 'Category' },
    { field: 'releaseDate', label: 'Release Date' },
  ],
};

export const initialDataset = [
  {
    id: 'P-001', name: 'Alpha Chair', price: 129.99, active: true,
    category: 'Standard', releaseDate: '2024-10-03', tags: ['furniture', 'chair'], discount: 10
  },
  {
    id: 'P-002', name: 'Beta Table', price: 349.00, active: true,
    category: 'Premium', releaseDate: '2025-03-21', tags: ['furniture', 'table'], discount: 20
  },
  {
    id: 'P-003', name: 'Gamma Lamp', price: 59.50, active: false,
    category: 'Standard', releaseDate: '2022-07-14', tags: ['lighting'], discount: 5
  },
];
