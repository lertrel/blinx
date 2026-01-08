/** @jest-environment jsdom */

import { createToastNotifier } from '../lib/blinx.toast-notifier.js';

function q(selector) {
  return document.querySelector(selector);
}

describe('createToastNotifier', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('creates a region on first notify and appends a toast', () => {
    const n = createToastNotifier({ durationMs: 10_000 });
    n.notify({ message: 'Hello', issues: null, raw: 'Hello' });

    expect(q('.blx-toast-region')).toBeTruthy();
    expect(q('.blx-toast')?.textContent).toContain('Hello');
  });

  test('dedupes repeated messages within window (increments count)', () => {
    const n = createToastNotifier({ dedupeWindowMs: 5_000, durationMs: 10_000 });

    n.notify({ message: 'Saved', issues: null, raw: 'Saved' });
    n.notify({ message: 'Saved', issues: null, raw: 'Saved' });

    const toasts = document.querySelectorAll('.blx-toast');
    expect(toasts.length).toBe(1);

    const badge = q('.blx-toast [data-blx-part="count"]');
    expect(badge).toBeTruthy();
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('×2');
  });

  test('auto-dismisses toast after duration (and removes from DOM)', () => {
    const n = createToastNotifier({ durationMs: 50, dedupeWindowMs: 0 });
    n.notify({ message: 'Will disappear', issues: null, raw: 'Will disappear' });

    expect(q('.blx-toast')).toBeTruthy();

    jest.advanceTimersByTime(50);
    // leaving transition timer (180ms in implementation)
    jest.advanceTimersByTime(200);

    expect(q('.blx-toast')).toBeFalsy();
  });

  test('danger variant uses longer timeout by default', () => {
    const n = createToastNotifier({ durationMs: 10, dangerDurationMs: 100 });
    n.notify({ message: 'Issues: X', issues: [{ code: 'X' }], raw: null });

    // Before 100ms it should still exist.
    jest.advanceTimersByTime(50);
    expect(q('.blx-toast')).toBeTruthy();

    jest.advanceTimersByTime(60);
    jest.advanceTimersByTime(200);
    expect(q('.blx-toast')).toBeFalsy();
  });
});

