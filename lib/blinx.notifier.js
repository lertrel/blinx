function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function formatIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return '';
  const codes = issues.map(i => i?.code).filter(Boolean);
  const messages = issues.map(i => i?.message).filter(Boolean);
  if (codes.length && messages.length) return `Issues: ${codes.join(', ')} — ${messages[0]}`;
  if (codes.length) return `Issues: ${codes.join(', ')}`;
  if (messages.length) return `Issues: ${messages[0]}`;
  return 'Issues occurred.';
}

function normalizePayload(input) {
  // Accept:
  // - string/number/etc => { message }
  // - Issue[] => { issues, message }
  // - { issues: Issue[] } => { issues, message }
  if (Array.isArray(input)) {
    const issues = input.slice();
    return { issues, message: formatIssues(issues), raw: input };
  }
  if (isPlainObject(input) && Array.isArray(input.issues)) {
    const issues = input.issues.slice();
    return { issues, message: formatIssues(issues), raw: input };
  }
  const message = (input === undefined || input === null) ? '' : String(input);
  return { issues: null, message, raw: input };
}

let ACTIVE_NOTIFIER = null;

/**
 * Centralized, singleton notifier registry.
 *
 * Only one implementation is active per app/runtime.
 * Consumers can call Notifier.notify(...) without having to pass it through props/params.
 *
 * Contract for implementations:
 * - { notify(payload) } where payload is { message, issues?, raw }
 */
export const Notifier = {
  /**
   * Register the active notifier implementation.
   * Passing null/undefined clears the notifier.
   */
  set(impl) {
    if (!impl) {
      ACTIVE_NOTIFIER = null;
      return;
    }
    if (!isPlainObject(impl) || typeof impl.notify !== 'function') {
      throw new Error('Notifier.set(impl): impl must be an object with notify(payload).');
    }
    ACTIVE_NOTIFIER = impl;
  },

  /**
   * Returns the currently active notifier implementation (or null).
   */
  get() {
    return ACTIVE_NOTIFIER;
  },

  /**
   * Notify via the active impl, falling back to the provided fallback function.
   *
   * @param {any} messageOrIssues
   * @param {Function|null} fallback - fallback(message, payload) called when no notifier is registered.
   */
  notify(messageOrIssues, fallback = null) {
    const payload = normalizePayload(messageOrIssues);
    const impl = ACTIVE_NOTIFIER;
    if (impl && typeof impl.notify === 'function') {
      try {
        impl.notify(payload);
        return;
      } catch {
        // If a notifier impl throws, do not crash the app; fall back.
      }
    }
    if (typeof fallback === 'function') {
      try {
        fallback(payload.message, payload);
      } catch {
        // ignore fallback failures (best-effort)
      }
    }
  },
};

