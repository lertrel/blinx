
import { DataTypes } from '../lib/blinx.store.js';

export const productModel = {
  entity: 'Product',
  fields: {
    id: { type: DataTypes.id, readonly: true, css: 'text-gray-600' },
    name: { type: DataTypes.string, required: true, length: { max: 100 }, css: 'font-medium' },
    slug: { type: DataTypes.slug, required: true, length: { max: 60 } },
    description: { type: DataTypes.richText, length: { max: 1000 } },
    price: { type: DataTypes.currency, required: true, min: 0, step: 0.01, currency: 'USD' },
    discount: { type: DataTypes.percent, min: 0, max: 100 },
    rating: { type: DataTypes.rating, min: 0, max: 5, step: 0.5 },
    active: { type: DataTypes.boolean, required: false },
    category: { type: DataTypes.enum, values: ['Standard', 'Premium', 'Deluxe'] },
    releaseDate: { type: DataTypes.date, required: false },
    contactEmail: { type: DataTypes.email, required: true },
    supportUrl: { type: DataTypes.url, required: false },
    hotline: { type: DataTypes.phone, required: false },
    tags: { type: DataTypes.array, itemType: DataTypes.string },
    warehouseLocation: { type: DataTypes.geoPoint, required: false },
  },
};

export const productFormView = {
  sections: [
    {
      title: 'General',
      columns: 2,
      fields: ['id', 'name', 'slug', 'category', 'active', 'releaseDate'],
    },
    {
      title: 'Content',
      columns: 2,
      fields: [
        { field: 'description', span: 2 },
      ],
    },
    {
      title: 'Commerce',
      columns: 2,
      fields: ['price', 'discount', 'rating', 'tags'],
    },
    {
      title: 'Communication',
      columns: 2,
      fields: ['contactEmail', 'supportUrl', 'hotline', { field: 'warehouseLocation', span: 2 }],
    },
  ],
};

export const productTableView = {
  columns: [
    { field: 'id', label: 'ID' },
    { field: 'name', label: 'Name' },
    { field: 'slug', label: 'Slug' },
    { field: 'price', label: 'Price' },
    { field: 'discount', label: 'Discount %' },
    { field: 'rating', label: 'Rating' },
    { field: 'active', label: 'Active' },
    { field: 'category', label: 'Category' },
  ],
};

export const initialDataset = [
  {
    id: 'P-001',
    name: 'Alpha Chair',
    slug: 'alpha-chair',
    description: 'Compact accent chair with stain-resistant fabric.',
    price: 129.99,
    discount: 10,
    rating: 4.5,
    active: true,
    category: 'Standard',
    releaseDate: '2024-10-03',
    contactEmail: 'alpha@blinx.dev',
    supportUrl: 'https://example.com/alpha-chair',
    hotline: '+14155550101',
    tags: ['furniture', 'chair'],
    warehouseLocation: { lat: 37.7749, lng: -122.4194 },
  },
  {
    id: 'P-002',
    name: 'Beta Table',
    slug: 'beta-table',
    description: 'Solid oak dining table for modern lofts.',
    price: 349.0,
    discount: 15,
    rating: 4.8,
    active: true,
    category: 'Premium',
    releaseDate: '2025-03-21',
    contactEmail: 'beta@blinx.dev',
    supportUrl: 'https://example.com/beta-table',
    hotline: '+14155550102',
    tags: ['furniture', 'table'],
    warehouseLocation: { lat: 34.0522, lng: -118.2437 },
  },
  {
    id: 'P-003',
    name: 'Gamma Lamp',
    slug: 'gamma-lamp',
    description: 'Adjustable desk lamp with wireless charging pad.',
    price: 59.5,
    discount: 5,
    rating: 4.2,
    active: false,
    category: 'Standard',
    releaseDate: '2022-07-14',
    contactEmail: 'gamma@blinx.dev',
    supportUrl: 'https://example.com/gamma-lamp',
    hotline: '+14155550103',
    tags: ['lighting'],
    warehouseLocation: { lat: 40.7128, lng: -74.006 },
  },
];
