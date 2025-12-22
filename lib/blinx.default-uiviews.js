import { DataTypes } from './blinx.store.js';

const GENERATED = new WeakMap(); // model -> Map(kind -> view)
const GENERATED_BY_ID = new Map(); // modelKey -> Map(kind -> view) (fallback)

function modelKey(model) {
  if (!model || typeof model !== 'object') return null;
  const id = (typeof model.id === 'string' && model.id) ? model.id : null;
  const name = (typeof model.name === 'string' && model.name) ? model.name : null;
  const entity = (typeof model.entity === 'string' && model.entity) ? model.entity : null;
  return id || name || entity || null;
}

function toTitle(s) {
  const str = String(s || '');
  if (!str) return '';
  // snake_case, kebab-case, camelCase => "Title Case"
  const spaced = str
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : str;
}

function isHiddenByDefault(fieldKey, def) {
  const t = def?.type;
  if (t === DataTypes.blob || t === DataTypes.longText || t === DataTypes.json || t === DataTypes.secret) return true;
  // Relationships / deep structures: hidden by default
  if (t === DataTypes.array || t === 'model' || t === 'collection') return true;
  // Conservative name-based hiding (optional safety even without metadata)
  const k = String(fieldKey || '').toLowerCase();
  if (!k) return false;
  if (k.includes('password') || k.includes('token') || k.includes('apikey') || k.includes('api_key') || k.includes('ssn')) return true;
  return false;
}

function isDateLikeField(fieldKey, def) {
  if (def?.type === DataTypes.date) return true;
  const k = String(fieldKey || '').toLowerCase();
  return k === 'createdat' || k === 'updatedat' || k.endsWith('_at');
}

function isIdentifierField(fieldKey, def) {
  const k = String(fieldKey || '').toLowerCase();
  if (k === 'id' || k.endsWith('id') || k.endsWith('_id')) return true;
  // Fallback: short string/number often used as identifier
  return def?.type === DataTypes.string || def?.type === DataTypes.number;
}

function isHumanReadableString(fieldKey, def) {
  if (def?.type !== DataTypes.string) return false;
  const k = String(fieldKey || '').toLowerCase();
  if (k === 'name' || k === 'title' || k === 'label') return true;
  // Prefer short strings
  const max = def?.length?.max;
  if (typeof max === 'number' && max > 0 && max <= 200) return true;
  if (max === undefined) return true;
  return false;
}

function pickPrimaryDisplayField(model, visibleKeys) {
  const preferred = ['name', 'title', 'label', 'id'];
  const lower = new Map(visibleKeys.map(k => [String(k).toLowerCase(), k]));
  for (const p of preferred) {
    if (lower.has(p)) return lower.get(p);
  }

  // First visible short string
  for (const k of visibleKeys) {
    const def = model?.fields?.[k];
    if (def?.type === DataTypes.string && !isHiddenByDefault(k, def) && isHumanReadableString(k, def)) return k;
  }

  // Fallback: any visible field
  return visibleKeys[0] || null;
}

function scoreFieldForColumns(fieldKey, def) {
  // Higher score = more likely to appear in columns
  const k = String(fieldKey || '').toLowerCase();
  let score = 0;

  // Explicit primary candidates
  if (k === 'name' || k === 'title' || k === 'label') score += 1000;

  // Human-readable strings
  if (def?.type === DataTypes.string) score += 400;

  // Enum / boolean
  if (def?.type === DataTypes.enum) score += 300;
  if (def?.type === DataTypes.boolean) score += 250;

  // Dates (timestamps)
  if (isDateLikeField(fieldKey, def)) score += 200;
  if (k === 'updatedat' || k === 'updated_at') score += 120;
  if (k === 'createdat' || k === 'created_at') score += 100;

  // Identifiers
  if (k === 'id') score += 150;
  else if (k.endsWith('id') || k.endsWith('_id')) score += 40;

  // De-prioritize very long strings
  const max = def?.length?.max;
  if (def?.type === DataTypes.string && typeof max === 'number' && max > 200) score -= 200;

  return score;
}

function chooseDefaultSort(model, visibleKeys) {
  const lower = new Map(visibleKeys.map(k => [String(k).toLowerCase(), k]));
  const updated = lower.get('updatedat') || lower.get('updated_at') || null;
  const created = lower.get('createdat') || lower.get('created_at') || null;

  if (updated) return [{ field: updated, dir: 'desc' }];
  if (created) return [{ field: created, dir: 'desc' }];

  const id = lower.get('id') || null;
  const name = lower.get('name') || null;
  const title = lower.get('title') || null;

  if (id) return [{ field: id, dir: 'asc' }];
  if (name) return [{ field: name, dir: 'asc' }];
  if (title) return [{ field: title, dir: 'asc' }];

  return null;
}

function buildDefaultFormView(model) {
  const fields = model?.fields || {};
  const keys = Object.keys(fields);
  const visible = keys.filter(k => !isHiddenByDefault(k, fields[k]));

  // Minimal view for ambiguous schemas
  if (visible.length === 0) {
    const safe = keys.filter(k => {
      const def = fields[k];
      if (!def) return false;
      if (def.type === DataTypes.blob || def.type === DataTypes.longText || def.type === DataTypes.json || def.type === DataTypes.secret) return false;
      if (def.type === DataTypes.array || def.type === 'model' || def.type === 'collection') return false;
      return String(k).toLowerCase() === 'id' || String(k).toLowerCase().includes('created') || String(k).toLowerCase().includes('updated');
    });
    return { origin: 'generated', sections: [{ title: 'Main', columns: 2, fields: safe }] };
  }

  return { origin: 'generated', sections: [{ title: 'Main', columns: 2, fields: visible }] };
}

function buildDefaultCollectionView(model) {
  const fields = model?.fields || {};
  const keys = Object.keys(fields);
  const visible = keys.filter(k => !isHiddenByDefault(k, fields[k]));

  // Minimal view for ambiguous schemas
  if (visible.length === 0) {
    const safe = keys.filter(k => {
      const def = fields[k];
      if (!def) return false;
      if (def.type === DataTypes.blob || def.type === DataTypes.longText || def.type === DataTypes.json || def.type === DataTypes.secret) return false;
      if (def.type === DataTypes.array || def.type === 'model' || def.type === 'collection') return false;
      return String(k).toLowerCase() === 'id' || String(k).toLowerCase().includes('created') || String(k).toLowerCase().includes('updated');
    });
    const cols = safe.slice(0, 6).map(k => ({ field: k, label: toTitle(k) }));
    return { origin: 'generated', layout: 'table', columns: cols };
  }

  const primary = pickPrimaryDisplayField(model, visible);
  const scored = visible
    .map(k => ({ k, score: scoreFieldForColumns(k, fields[k]) }))
    .sort((a, b) => (b.score - a.score) || 0);

  const cap = 8; // within the requested 6–10 window
  const chosen = [];
  if (primary) chosen.push(primary);
  for (const { k } of scored) {
    if (chosen.includes(k)) continue;
    chosen.push(k);
    if (chosen.length >= cap) break;
  }

  const columns = chosen.map(k => ({ field: k, label: toTitle(k) }));
  const sort = chooseDefaultSort(model, visible);
  const searchFields = primary ? [primary] : [];

  return {
    origin: 'generated',
    layout: 'table',
    columns,
    ...(sort ? { defaultSort: sort } : {}),
    ...(searchFields.length ? { searchFields } : {}),
  };
}

export function generateSchemaDefaultUIView({ model, kind } = {}) {
  if (!model || typeof model !== 'object') return null;
  const k = String(kind || '');
  if (!k) return null;
  if (!model.fields || typeof model.fields !== 'object') return null;

  if (k === 'form') return buildDefaultFormView(model);
  if (k === 'collection' || k === 'table') return buildDefaultCollectionView(model);

  return null;
}

export function __internal_cacheGeneratedUIView({ model, kind, view } = {}) {
  if (!model || typeof model !== 'object') return;
  if (!kind) return;
  if (!view || typeof view !== 'object') return;

  let byKind = GENERATED.get(model);
  if (!byKind) {
    byKind = new Map();
    GENERATED.set(model, byKind);
  }
  byKind.set(String(kind), view);

  const mk = modelKey(model);
  if (mk) {
    let byId = GENERATED_BY_ID.get(mk);
    if (!byId) {
      byId = new Map();
      GENERATED_BY_ID.set(mk, byId);
    }
    byId.set(String(kind), view);
  }
}

export function __internal_getGeneratedUIViewSnapshots() {
  const out = [];
  for (const [mk, byKind] of GENERATED_BY_ID.entries()) {
    const entry = { model: mk, kinds: {} };
    for (const [kind, view] of byKind.entries()) {
      entry.kinds[kind] = view;
    }
    out.push(entry);
  }
  return out;
}

