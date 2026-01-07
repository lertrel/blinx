<!--
  Notifier spec: centralized notification routing.
  This is intentionally small: it defines the stable API surface and how UI actions should use it.
-->

# Notifier (`lib/blinx.notifier.js`)

Blinx does not ship a built-in toast/banner UI. Instead it provides a **central, pluggable notifier** that any app can register once and all Blinx components can use without prop-drilling.

This solves the “custom actions collect issues but don’t automatically render them” gap described in `docs/wip.md` (Aspect 2 / Iteration 1).

## 1) Direct API (app integration)

Use this in your app bootstrap code to register a single notifier implementation.

```js
import { Notifier } from '../lib/blinx.notifier.js';

Notifier.set({
  notify(payload) {
    // payload = { message, issues?, raw }
    // Render a toast/banner however your app prefers.
    console.log(payload.message);
  },
});
```

### 1.1 `Notifier.set(impl)`

- Registers the active notifier implementation (only one is active per runtime).
- Pass `null`/`undefined` to clear.
- `impl` must be an object with `notify(payload)`.

### 1.2 `Notifier.get()`

Returns the currently active implementation or `null`.

### 1.3 `Notifier.notify(messageOrIssues, fallback?)`

Best-effort notification:

- If an implementation is registered, calls `impl.notify(payload)`.
- Otherwise, calls the provided `fallback(message, payload)` if present.

Accepted inputs:

- `string | number | ...` → normalized to `{ message: String(input) }`
- `Issue[]` → normalized to `{ issues, message }`
- `{ issues: Issue[] }` → normalized to `{ issues, message }`

Where an `Issue` is the facade issue shape:

```ts
type Issue = { code: string; message?: string; field?: string; [k: string]: any };
```

## 2) Recommended API for custom actions: `ctx.notify(...)`

Custom actions should **not** import `Notifier` directly. Instead, forms/collections provide:

```js
ctx.notify(messageOrIssues, fallback?)
```

This is a thin wrapper over `Notifier.notify(...)` that defaults its fallback to the component’s existing status channel (`setStatus(...)`).

Example:

```js
action: async (ctx) => {
  ctx.notify('Copied to clipboard');
}
```

## 3) Automatic issue surfacing: `ctx.getIssues()` post-action hook

For custom actions executed by `blinxForm` and `blinxCollection`:

- Actions can collect non-fatal warnings/errors via the action facade.
- After the action completes successfully, Blinx checks `ctx.getIssues()`.
- If issues exist, they are routed to the notifier (`Notifier`), falling back to `setStatus(...)` when no notifier implementation is registered.

This keeps “issues” as structured data while still making them visible by default.

