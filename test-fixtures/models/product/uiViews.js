export const ProductUIViews = {
  list: {
    layout: 'table',
    columns: [
      { field: 'name', label: 'Name' },
      { field: 'price', label: 'Price' },
    ],
  },
  edit: {
    sections: [
      { title: 'Basics', columns: 2, fields: ['name', 'price'] },
    ],
  },
};

