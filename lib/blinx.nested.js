function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function modelKey(model) {
  if (!model || typeof model !== 'object') return null;
  const id = (typeof model.id === 'string' && model.id) ? model.id : null;
  const name = (typeof model.name === 'string' && model.name) ? model.name : null;
  const entity = (typeof model.entity === 'string' && model.entity) ? model.entity : null;
  return id || name || entity || null;
}

export function isNestedFieldDef(fieldDef) {
  const t = fieldDef?.type;
  return t === 'model' || t === 'collection';
}

export function isSNMFieldDef(fieldDef) {
  return isNestedFieldDef(fieldDef) && fieldDef?.embedded === false;
}

export function getSNMRef(fieldDef) {
  const ref = (fieldDef && typeof fieldDef === 'object' && fieldDef.ref && typeof fieldDef.ref === 'object')
    ? fieldDef.ref
    : {};
  const keyField = (typeof ref.keyField === 'string' && ref.keyField) ? ref.keyField : 'id';
  const labelField = (typeof ref.labelField === 'string' && ref.labelField) ? ref.labelField : null;
  const previewFields = Array.isArray(ref.previewFields)
    ? ref.previewFields.filter(f => typeof f === 'string' && f)
    : null;
  return { keyField, labelField, previewFields };
}

export function extractSNMId(fieldDef, value) {
  const { keyField } = getSNMRef(fieldDef);
  if (value === undefined || value === null || value === '') return null;
  if (isPlainObject(value)) {
    const id = value?.[keyField];
    if (id === undefined || id === null || id === '') {
      throw new Error(`SNM value object is missing "${keyField}".`);
    }
    return id;
  }
  return value;
}

export function extractSNMIds(fieldDef, value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error('SNM collection value must be an array.');
  }
  return value.map(v => extractSNMId(fieldDef, v)).filter(v => v !== null);
}

export function normalizeValueForPersist(fieldDef, value) {
  if (!isSNMFieldDef(fieldDef)) return value;
  if (fieldDef.type === 'model') return extractSNMId(fieldDef, value);
  if (fieldDef.type === 'collection') return extractSNMIds(fieldDef, value);
  return value;
}

export function normalizePatchForPersist(model, patch) {
  const out = { ...(patch && typeof patch === 'object' ? patch : {}) };
  const fields = model?.fields || {};
  for (const [k, v] of Object.entries(out)) {
    const def = fields?.[k];
    if (!def) continue;
    if (isSNMFieldDef(def)) {
      out[k] = normalizeValueForPersist(def, v);
    }
  }
  return out;
}

export function normalizeRecordForPersist(model, record) {
  const out = { ...(record && typeof record === 'object' ? record : {}) };
  const fields = model?.fields || {};
  for (const [k, def] of Object.entries(fields)) {
    if (!def) continue;
    if (isSNMFieldDef(def)) {
      out[k] = normalizeValueForPersist(def, out[k]);
    }
  }
  return out;
}

export function normalizeValueForDiff(model, fieldKey, value) {
  const def = model?.fields?.[fieldKey];
  if (!def) return value;
  if (!isSNMFieldDef(def)) return value;
  return normalizeValueForPersist(def, value);
}

