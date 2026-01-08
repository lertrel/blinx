function isElement(v) {
  return !!v && typeof v === 'object' && v.nodeType === 1 && typeof v.appendChild === 'function';
}

function nowMs() {
  return Date.now();
}

function safeRemove(el) {
  try { el?.remove?.(); } catch { /* ignore */ }
}

function resolveMountRoot(root) {
  if (isElement(root)) return root;
  if (typeof document === 'undefined') return null;
  // Prefer an existing Blinx theme boundary when present.
  const themed = document.querySelector?.('[data-blinx-theme]');
  if (themed) return themed;
  return document.body || document.documentElement || null;
}

function pickVariant(payload, explicitVariant) {
  if (explicitVariant) return String(explicitVariant);
  const hasIssues = Array.isArray(payload?.issues) && payload.issues.length > 0;
  if (hasIssues) return 'danger';
  return 'info';
}

function isEmptyMessage(msg) {
  return !msg || !String(msg).trim();
}

/**
 * Create a DOM toast notifier implementation compatible with `Notifier.set(...)`.
 *
 * Notes:
 * - Opt-in only: does not register itself.
 * - Best-effort: never throws on notify().
 * - Scoped styling: uses `.blx-*` classes and Blinx CSS tokens (see `lib/blinx.css`).
 */
export function createToastNotifier(options = {}) {
  const {
    root = null,
    position = 'top-right', // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
    maxToasts = 4,
    dedupeWindowMs = 1200,
    durationMs = 4000,
    dangerDurationMs = 8000,
    ariaLive = 'polite', // 'polite' | 'assertive' | 'off'
    label = 'Notifications',
    onNotify = null,
  } = options || {};

  let region = null;
  const dedupe = new Map(); // key -> { el, count, lastAt, timerId }

  function ensureRegion() {
    if (region && region.isConnected) return region;
    const mountRoot = resolveMountRoot(root);
    if (!mountRoot || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'blx-toast-region';
    el.setAttribute('data-position', String(position || 'top-right'));
    if (label) el.setAttribute('aria-label', String(label));
    el.setAttribute('aria-live', String(ariaLive || 'polite'));
    el.setAttribute('aria-relevant', 'additions text');
    el.setAttribute('aria-atomic', 'false');
    mountRoot.appendChild(el);
    region = el;
    return region;
  }

  function updateCount(toastEl, count) {
    if (!toastEl) return;
    const badge = toastEl.querySelector?.('[data-blx-part="count"]');
    if (!badge) return;
    const n = Number(count) || 1;
    badge.textContent = n > 1 ? `×${n}` : '';
    badge.toggleAttribute?.('hidden', !(n > 1));
  }

  function scheduleRemoval(toastEl, ms, key) {
    if (!toastEl) return;
    const delay = Math.max(0, Number(ms) || 0);
    const existing = key ? dedupe.get(key) : null;
    if (existing?.timerId) {
      try { clearTimeout(existing.timerId); } catch { /* ignore */ }
      existing.timerId = null;
    }
    const timerId = setTimeout(() => {
      // Mark leaving for CSS transition, then remove.
      try { toastEl.setAttribute('data-state', 'leaving'); } catch { /* ignore */ }
      setTimeout(() => {
        safeRemove(toastEl);
        if (key && dedupe.get(key)?.el === toastEl) dedupe.delete(key);
      }, 180);
    }, delay);
    if (existing) existing.timerId = timerId;
    return timerId;
  }

  function enforceMax(regionEl) {
    if (!regionEl) return;
    const max = Math.max(1, Number(maxToasts) || 1);
    while (regionEl.children.length > max) {
      safeRemove(regionEl.firstElementChild);
    }
  }

  function buildToast({ message, variant }) {
    const toastEl = document.createElement('div');
    toastEl.className = 'blx-toast';
    toastEl.setAttribute('data-variant', variant);
    toastEl.setAttribute('data-state', 'enter');

    const msgEl = document.createElement('div');
    msgEl.className = 'blx-toast__message';
    msgEl.setAttribute('data-blx-part', 'message');
    msgEl.textContent = message;

    const countEl = document.createElement('span');
    countEl.className = 'blx-toast__count';
    countEl.setAttribute('data-blx-part', 'count');
    countEl.hidden = true;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'blx-toast__close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('data-blx-part', 'close');
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      scheduleRemoval(toastEl, 0);
    });

    const right = document.createElement('div');
    right.className = 'blx-toast__right';
    right.appendChild(countEl);
    right.appendChild(closeBtn);

    toastEl.appendChild(msgEl);
    toastEl.appendChild(right);

    // Let the browser apply initial state before transitioning in.
    setTimeout(() => {
      try { toastEl.setAttribute('data-state', 'shown'); } catch { /* ignore */ }
    }, 0);

    return toastEl;
  }

  function notify(payload) {
    try {
      if (!payload || typeof payload !== 'object') return;
      const message = String(payload.message ?? '');
      const hasIssues = Array.isArray(payload.issues) && payload.issues.length > 0;
      if (isEmptyMessage(message) && !hasIssues) return;

      const variant = pickVariant(payload, options?.variant);
      const regionEl = ensureRegion();
      if (!regionEl) return;

      // Dedupe by message for a short window to avoid spam (e.g., repeated save failures).
      const key = message;
      const t = nowMs();
      const prev = dedupe.get(key);
      const withinWindow = prev && (t - prev.lastAt) <= Math.max(0, Number(dedupeWindowMs) || 0) && prev.el?.isConnected;
      if (withinWindow) {
        prev.count += 1;
        prev.lastAt = t;
        updateCount(prev.el, prev.count);
        // Refresh dismissal timer.
        const autoMs = (variant === 'danger') ? dangerDurationMs : durationMs;
        scheduleRemoval(prev.el, autoMs, key);
        if (typeof onNotify === 'function') {
          try { onNotify({ payload, toastEl: prev.el, deduped: true }); } catch { /* ignore */ }
        }
        return;
      }

      const toastEl = buildToast({ message: message || (hasIssues ? 'Issues occurred.' : ''), variant });
      regionEl.appendChild(toastEl);
      enforceMax(regionEl);

      dedupe.set(key, { el: toastEl, count: 1, lastAt: t, timerId: null });

      const autoMs = (variant === 'danger') ? dangerDurationMs : durationMs;
      scheduleRemoval(toastEl, autoMs, key);

      if (typeof onNotify === 'function') {
        try { onNotify({ payload, toastEl, deduped: false }); } catch { /* ignore */ }
      }
    } catch {
      // Never throw from a notifier; best-effort only.
    }
  }

  function destroy() {
    try {
      for (const [, entry] of dedupe) {
        if (entry?.timerId) {
          try { clearTimeout(entry.timerId); } catch { /* ignore */ }
        }
      }
      dedupe.clear();
      safeRemove(region);
      region = null;
    } catch {
      // ignore
    }
  }

  return { notify, destroy };
}

