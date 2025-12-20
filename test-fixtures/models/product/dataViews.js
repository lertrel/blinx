export const ProductDataViews = {
  catalog: {
    resource: 'products',
    entityType: 'Product',
    keyField: 'id',
    versionField: 'version',
    defaultPage: { mode: 'page', page: 0, limit: 10 },
  },
  featured: {
    resource: 'products-featured',
    entityType: 'Product',
    keyField: 'id',
    versionField: 'version',
    defaultPage: { mode: 'page', page: 0, limit: 10 },
  },
};

