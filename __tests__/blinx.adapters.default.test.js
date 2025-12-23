/** @jest-environment jsdom */

import { BlinxDefaultUI } from '../lib/blinx.adapters.default.js';

function createOnChangeSpy() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  return fn;
}

describe('BlinxDefaultUI', () => {
  test('readValue: handles number/boolean/array/default', () => {
    const a = new BlinxDefaultUI();

    const numberEl = document.createElement('input');
    numberEl.value = '';
    expect(a.readValue(numberEl, { type: 'number' })).toBe('');
    numberEl.value = '12.5';
    expect(a.readValue(numberEl, { type: 'number' })).toBe(12.5);

    const boolEl = document.createElement('input');
    boolEl.type = 'checkbox';
    boolEl.checked = true;
    expect(a.readValue(boolEl, { type: 'boolean' })).toBe(true);

    const arrayEl = document.createElement('input');
    arrayEl.value = ' a,  b ,, c ';
    expect(a.readValue(arrayEl, { type: 'array' })).toEqual(['a', 'b', 'c']);

    const strEl = document.createElement('input');
    strEl.value = 'x';
    expect(a.readValue(strEl, { type: 'string' })).toBe('x');
  });

  test('formatCell: formats booleans, numbers, arrays, and defaults', () => {
    const a = new BlinxDefaultUI();

    expect(a.formatCell(true, { type: 'boolean' })).toBe('Yes');
    expect(a.formatCell(false, { type: 'boolean' })).toBe('No');

    expect(a.formatCell('', { type: 'number' })).toBe('');
    expect(a.formatCell(null, { type: 'number' })).toBe('');
    expect(a.formatCell(3.2, { type: 'number' })).toBe('3.2');

    expect(a.formatCell(['a', 'b'], { type: 'array' })).toBe('a, b');
    expect(a.formatCell('x', { type: 'array' })).toBe('');

    expect(a.formatCell(undefined, { type: 'string' })).toBe('');
    expect(a.formatCell('hi', { type: 'string' })).toBe('hi');
  });

  test('createField: number input validates and shows errors on change/blur', () => {
    const a = new BlinxDefaultUI();
    const onChange = createOnChangeSpy();

    const { el } = a.createField({
      fieldKey: 'price',
      def: { type: 'number', required: true, min: 0, max: 10, step: 0.5 },
      value: '',
      onChange,
    });

    const input = el.querySelector('input');
    const error = el.querySelector('.error');

    expect(input).toBeTruthy();
    expect(input.type).toBe('number');
    expect(input.getAttribute('required')).toBe('true');
    expect(input.min).toBe('0');
    expect(input.max).toBe('10');
    expect(input.step).toBe('0.5');

    // jsdom normalizes invalid number input values to '' for <input type="number">,
    // so we validate required/min/max using numeric values instead of expecting NaN.
    input.value = '';
    input.dispatchEvent(new Event('change'));
    expect(onChange.calls.length).toBe(1);
    expect(onChange.calls[0][0]).toBe('');
    expect(onChange.calls[0][1]).toEqual(['This field is required.']);
    expect(error.textContent).toContain('This field is required.');
    expect(error.classList.contains('hidden')).toBe(false);

    input.value = '-1';
    input.dispatchEvent(new Event('change'));
    expect(onChange.calls.length).toBe(2);
    expect(onChange.calls[1][0]).toBe(-1);
    expect(onChange.calls[1][1]).toEqual(['Must be ≥ 0.']);
    expect(error.textContent).toContain('Must be ≥ 0.');
    expect(error.classList.contains('hidden')).toBe(false);

    input.value = '5';
    input.dispatchEvent(new Event('blur'));
    expect(error.classList.contains('hidden')).toBe(true);
  });

  test('createField: boolean uses checkbox and calls onChange with checked', () => {
    const a = new BlinxDefaultUI();
    const onChange = createOnChangeSpy();

    const { el } = a.createField({
      fieldKey: 'active',
      def: { type: 'boolean', readonly: false },
      value: false,
      onChange,
    });

    const input = el.querySelector('input');
    expect(input.type).toBe('checkbox');

    input.checked = true;
    input.dispatchEvent(new Event('change'));

    expect(onChange.calls).toEqual([[true, []]]);
  });

  test('createField: enum builds select options and calls onChange with selected value', () => {
    const a = new BlinxDefaultUI();
    const onChange = createOnChangeSpy();

    const { el } = a.createField({
      fieldKey: 'category',
      def: { type: 'enum', values: ['A', 'B'] },
      value: 'B',
      onChange,
    });

    const select = el.querySelector('select');
    expect(select).toBeTruthy();
    expect(Array.from(select.querySelectorAll('option')).map(o => o.value)).toEqual(['A', 'B']);
    expect(select.value).toBe('B');

    select.value = 'A';
    select.dispatchEvent(new Event('change'));
    expect(onChange.calls).toEqual([['A', []]]);
  });

  test('createField: computed fields are rendered read-only/disabled', () => {
    const a = new BlinxDefaultUI();
    const onChange = createOnChangeSpy();

    const { el } = a.createField({
      fieldKey: 'total',
      def: { type: 'number', computed: true },
      value: 123,
      onChange,
    });

    const input = el.querySelector('input');
    expect(input).toBeTruthy();
    expect(input.getAttribute('readonly')).toBe('true');
  });
});
