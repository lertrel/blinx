
import { validateField } from './blinx.validate.js';

export class BlinxDefaultUI {
  createField({ fieldKey, def, value, onChange }) {
    const wrapper = document.createElement('div');
    // IMPORTANT:
    // - Keep classes scoped/prefixed to avoid collisions when multiple renderers co-exist.
    // - Expose stable, renderer-agnostic hooks via data-blinx-part for present()/controls integrations.
    wrapper.className = `blx-field${def?.css ? ` ${def.css}` : ''}`;
    wrapper.setAttribute('data-blinx-renderer', 'default');
    wrapper.setAttribute('data-blinx-part', 'field');
    const label = document.createElement('label');
    label.className = 'blx-label';
    label.setAttribute('data-blinx-part', 'label');
    label.textContent = fieldKey;
    const errorEl = document.createElement('div');
    errorEl.className = 'blx-error';
    errorEl.setAttribute('data-blinx-part', 'error');
    errorEl.hidden = true;
    let input;

    const setError = (errs) => {
      if (errs.length) {
        errorEl.textContent = errs.join(' ');
        errorEl.hidden = false;
      } else {
        errorEl.textContent = '';
        errorEl.hidden = true;
      }
    };

    const common = (el) => {
      el.className = 'blx-input';
      el.setAttribute('data-blinx-part', 'input');
      if (def.readonly || def.computed) el.setAttribute('readonly', 'true');
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

    switch (def.type) {
      case 'string':
        input = document.createElement(def.length?.max > 200 ? 'textarea' : 'input');
        if (input.tagName === 'INPUT') input.type = 'text';
        common(input); input.value = value ?? ''; break;
      case 'longText':
        input = document.createElement('textarea');
        common(input); input.value = value ?? ''; break;
      case 'number':
        input = document.createElement('input'); input.type = 'number';
        if (def.step !== undefined) input.step = String(def.step);
        if (def.min !== undefined) input.min = String(def.min);
        if (def.max !== undefined) input.max = String(def.max);
        common(input); input.value = value ?? ''; break;
      case 'boolean':
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(value);
        input.className = 'blx-checkbox';
        input.setAttribute('data-blinx-part', 'input');
        if (def.readonly || def.computed) input.disabled = true;
        input.addEventListener('change', () => onChange(input.checked, [])); break;
      case 'date':
        input = document.createElement('input'); input.type = 'date';
        common(input); input.value = value ?? ''; break;
      case 'enum':
        input = document.createElement('select'); input.className = 'blx-input';
        input.setAttribute('data-blinx-part', 'input');
        if (def.readonly || def.computed) input.disabled = true;
        (def.values || []).forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; input.appendChild(opt); });
        input.value = value ?? (def.values?.[0] || '');
        input.addEventListener('change', () => onChange(input.value, [])); break;
      case 'array':
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = Array.isArray(value) ? value.join(', ') : ''; break;
      case 'json':
        input = document.createElement('textarea');
        common(input);
        try { input.value = value === undefined ? '' : (typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
        catch { input.value = String(value ?? ''); }
        break;
      case 'secret':
        input = document.createElement('input'); input.type = 'password';
        common(input); input.value = value ?? ''; break;
      case 'blob':
        // Keep simple and headless-friendly (host apps can override via custom renderer)
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = value ?? ''; break;
      default:
        input = document.createElement('input'); input.type = 'text';
        common(input); input.value = value ?? '';
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(errorEl);

    return {
      el: wrapper,
      parts: {
        wrapper,
        label,
        input,
        error: errorEl,
      },
      getValue: () => this.readValue(input, def),
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
      case 'json':
        try { return value === undefined || value === null ? '' : (typeof value === 'string' ? value : JSON.stringify(value)); }
        catch { return String(value ?? ''); }
      case 'secret':
        return value ? '••••••' : '';
      default:        return value ?? '';
    }
  }
}

// Backwards-compatible alias (deprecated)
export { BlinxDefaultUI as BlinxDefaultAdapter };
