
import { validateField } from './blinx.validate.js';
import { DataTypes } from './blinx.store.js';

const TEXT_INPUT_TYPES = {
  [DataTypes.email]: 'email',
  [DataTypes.phone]: 'tel',
  [DataTypes.url]: 'url',
  [DataTypes.secret]: 'password',
};

const NUMBER_META = {
  [DataTypes.currency]: { step: 0.01 },
  [DataTypes.percent]: { min: 0, max: 100, step: 1 },
  [DataTypes.rating]: { min: 0, max: 5, step: 0.5 },
};

export class BlinxDefaultAdapter {
  createField({ fieldKey, def, value, onChange }) {
    const wrapper = document.createElement('div');
    wrapper.className = (def.css || '') + '';
    const label = document.createElement('label');
    label.className = 'label';
    label.textContent = fieldKey;
    const errorEl = document.createElement('div');
    errorEl.className = 'error hidden';
    let input;

    const setError = (errs) => {
      if (errs.length) { errorEl.textContent = errs.join(' '); errorEl.classList.remove('hidden'); }
      else { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
    };

    const common = (el) => {
      el.className = 'input';
      if (def.readonly) el.setAttribute('readonly', 'true');
      if (def.required) el.setAttribute('required', 'true');
      el.addEventListener('change', () => {
        const v = this.readValue(el, def);
        const errs = validateField(v, def);
        setError(errs);
        onChange(v, errs);
      });
      el.addEventListener('blur', () => {
        const v = this.readValue(el, def);
        const errs = validateField(v, def);
        setError(errs);
      });
    };

    const type = def.type || DataTypes.string;

    switch (type) {
      case DataTypes.longText:
      case DataTypes.richText:
      case DataTypes.markdown:
      case DataTypes.address:
      case DataTypes.json:
      case DataTypes.blob:
        input = document.createElement('textarea');
        if (type === DataTypes.json) input.spellcheck = false;
        common(input);
        if (type === DataTypes.json && value && typeof value === 'object') {
          try { input.value = JSON.stringify(value, null, 2); }
          catch { input.value = ''; }
        } else input.value = value ?? '';
        break;
      case DataTypes.string:
        if (def.length?.max > 200) {
          input = document.createElement('textarea');
          common(input); input.value = value ?? '';
        } else {
          input = document.createElement('input');
          input.type = 'text';
          common(input); input.value = value ?? '';
        }
        break;
      case DataTypes.slug:
      case DataTypes.uuid:
      case DataTypes.id:
      case DataTypes.email:
      case DataTypes.phone:
      case DataTypes.url:
      case DataTypes.secret:
        input = document.createElement('input');
        input.type = TEXT_INPUT_TYPES[type] || 'text';
        common(input); input.value = value ?? '';
        break;
      case DataTypes.number:
      case DataTypes.currency:
      case DataTypes.percent:
      case DataTypes.rating: {
        input = document.createElement('input');
        input.type = 'number';
        const meta = NUMBER_META[type] || {};
        const min = def.min !== undefined ? def.min : meta.min;
        const max = def.max !== undefined ? def.max : meta.max;
        const step = def.step !== undefined ? def.step : meta.step;
        if (min !== undefined) input.min = String(min);
        if (max !== undefined) input.max = String(max);
        if (step !== undefined) input.step = String(step);
        common(input); input.value = value ?? '';
        break;
      }
      case DataTypes.boolean:
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(value);
        if (def.readonly) input.disabled = true;
        input.addEventListener('change', () => onChange(input.checked, [])); break;
      case DataTypes.date:
        input = document.createElement('input'); input.type = 'date';
        common(input); input.value = value ?? ''; break;
      case DataTypes.enum:
        input = document.createElement('select'); input.className = 'input';
        if (def.readonly) input.disabled = true;
        (def.values || []).forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; input.appendChild(opt); });
        input.value = value ?? (def.values?.[0] || '');
        input.addEventListener('change', () => onChange(input.value, [])); break;
      case DataTypes.array:
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = Array.isArray(value) ? value.join(', ') : ''; break;
      case DataTypes.geoPoint: {
        const latInput = document.createElement('input');
        latInput.type = 'number';
        latInput.step = 'any';
        latInput.placeholder = 'Latitude';
        latInput.className = 'input';
        const lngInput = document.createElement('input');
        lngInput.type = 'number';
        lngInput.step = 'any';
        lngInput.placeholder = 'Longitude';
        lngInput.className = 'input';
        if (def.readonly) {
          latInput.setAttribute('readonly', 'true');
          lngInput.setAttribute('readonly', 'true');
        }
        if (def.required) {
          latInput.setAttribute('required', 'true');
          lngInput.setAttribute('required', 'true');
        }
        const preset = (value && typeof value === 'object') ? value : {};
        if (preset.lat !== undefined && preset.lat !== null) latInput.value = String(preset.lat);
        if (preset.lng !== undefined && preset.lng !== null) lngInput.value = String(preset.lng);
        const geoWrapper = document.createElement('div');
        geoWrapper.className = 'geo-point';
        geoWrapper.appendChild(latInput);
        geoWrapper.appendChild(lngInput);
        const readGeoValue = () => {
          const latVal = latInput.value;
          const lngVal = lngInput.value;
          if (latVal === '' && lngVal === '') return null;
          return {
            lat: latVal === '' ? null : Number(latVal),
            lng: lngVal === '' ? null : Number(lngVal),
          };
        };
        const emitChange = () => {
          const geoValue = readGeoValue();
          const errs = validateField(geoValue, def);
          setError(errs);
          onChange(geoValue, errs);
        };
        const emitBlur = () => {
          const geoValue = readGeoValue();
          const errs = validateField(geoValue, def);
          setError(errs);
        };
        ['change'].forEach(evt => {
          latInput.addEventListener(evt, emitChange);
          lngInput.addEventListener(evt, emitChange);
        });
        ['blur'].forEach(evt => {
          latInput.addEventListener(evt, emitBlur);
          lngInput.addEventListener(evt, emitBlur);
        });
        geoWrapper.__blinxGeoPointValue = readGeoValue;
        input = geoWrapper;
        break;
      }
      default:
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = value ?? '';
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(errorEl);

    return {
      el: wrapper,
      getValue: () => this.readValue(input, def),
      setError,
    };
  }

  readValue(el, def = {}) {
    switch (def.type) {
      case DataTypes.number:
      case DataTypes.currency:
      case DataTypes.percent:
      case DataTypes.rating:
        return el.value === '' ? '' : Number(el.value);
      case DataTypes.boolean:
        return el.checked;
      case DataTypes.array:
        return el.value.split(',').map(s => s.trim()).filter(Boolean);
      case DataTypes.geoPoint:
        return typeof el?.__blinxGeoPointValue === 'function' ? el.__blinxGeoPointValue() : null;
      default:
        return el.value;
    }
  }

  formatCell(value, def = {}) {
    const type = def.type || DataTypes.string;
    switch (type) {
      case DataTypes.boolean:
        return value ? 'Yes' : 'No';
      case DataTypes.currency: {
        if (value === '' || value === null || value === undefined) return '';
        const numeric = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(numeric)) return '';
        const currency = def.currency || 'USD';
        const locale = def.currencyLocale || 'en-US';
        try {
          return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(numeric);
        } catch {
          return numeric.toFixed(2);
        }
      }
      case DataTypes.percent: {
        if (value === '' || value === null || value === undefined) return '';
        const numeric = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(numeric)) return '';
        return `${numeric}%`;
      }
      case DataTypes.rating: {
        if (value === '' || value === null || value === undefined) return '';
        const numeric = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(numeric)) return '';
        const max = def.max ?? 5;
        return `${numeric} / ${max}`;
      }
      case DataTypes.number:
        return value === '' || value === null || value === undefined ? '' : String(value);
      case DataTypes.date:
        return value || '';
      case DataTypes.array:
        return Array.isArray(value) ? value.join(', ') : '';
      case DataTypes.geoPoint:
        if (!value || typeof value !== 'object') return '';
        const lat = value.lat ?? value.latitude;
        const lng = value.lng ?? value.longitude;
        if (lat === undefined || lng === undefined) return '';
        return `${lat}, ${lng}`;
      case DataTypes.secret:
        return value ? '***' : '';
      default:
        return value ?? '';
    }
  }
}
