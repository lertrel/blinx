
import { coerceFieldValue, validateField } from './blinx.validate.js';

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

    const runValidation = (rawValue, shouldUpdateInput = true) => {
      const coerced = coerceFieldValue(rawValue, def);
      const errs = validateField(coerced, def);
      setError(errs);
      if (shouldUpdateInput && typeof coerced === 'string' && input && input.value !== coerced) {
        input.value = coerced;
      }
      return { value: coerced, errs };
    };

    const common = (el) => {
      el.className = 'input';
      if (def.readonly) el.setAttribute('readonly', 'true');
      if (def.required) el.setAttribute('required', 'true');
      el.addEventListener('change', () => {
        const { value: nextValue, errs } = runValidation(this.readValue(el, def));
        onChange(nextValue, errs);
      });
      el.addEventListener('blur', () => {
        runValidation(this.readValue(el, def));
      });
    };

    switch (def.type) {
      case 'string':
        input = document.createElement(def.length?.max > 200 ? 'textarea' : 'input');
        if (input.tagName === 'INPUT') input.type = 'text';
        common(input); input.value = value ?? ''; break;
      case 'number':
        input = document.createElement('input'); input.type = 'number';
        if (def.step !== undefined) input.step = String(def.step);
        if (def.min !== undefined) input.min = String(def.min);
        if (def.max !== undefined) input.max = String(def.max);
        common(input); input.value = value ?? ''; break;
      case 'boolean':
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(value);
        if (def.readonly) input.disabled = true;
        input.addEventListener('change', () => {
          const { value: nextValue, errs } = runValidation(input.checked, false);
          onChange(nextValue, errs);
        });
        break;
      case 'date':
        input = document.createElement('input'); input.type = 'date';
        common(input); input.value = value ?? ''; break;
      case 'enum':
        input = document.createElement('select'); input.className = 'input';
        if (def.readonly) input.disabled = true;
        (def.values || []).forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; input.appendChild(opt); });
        input.value = value ?? (def.values?.[0] || '');
        input.addEventListener('change', () => {
          const { value: nextValue, errs } = runValidation(input.value, false);
          onChange(nextValue, errs);
        });
        break;
      case 'array':
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = Array.isArray(value) ? value.join(', ') : ''; break;
      default:
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = value ?? '';
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(errorEl);

    return {
      el: wrapper,
      getValue: () => coerceFieldValue(this.readValue(input, def), def),
      setError,
    };
  }

  readValue(el, def) {
    switch (def.type) {
      case 'number': return el.value === '' ? '' : Number(el.value);
      case 'boolean': return el.checked;
      case 'array': return el.value.split(',').map(s => s.trim()).filter(Boolean);
      default: return el.value;
    }
  }

  formatCell(value, def = {}) {
    switch (def.type) {
      case 'boolean': return value ? 'Yes' : 'No';
      case 'number':  return value === '' || value === null || value === undefined ? '' : String(value);
      case 'date':    return value || '';
      case 'array':   return Array.isArray(value) ? value.join(', ') : '';
      default:        return value ?? '';
    }
  }
}
