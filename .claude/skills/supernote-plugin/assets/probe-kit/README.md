# Probe kit

Drop these files into a fresh template project before writing any feature.
They turn the plugin into a test instrument that prints what each SDK call
returns on the real device, which is the only place PluginHost runs.

| File | Put it at | What it does |
|---|---|---|
| `index.js` | project root | Entry with global error capture, lazy `App` load that prints load failures, two buttons, button-event store |
| `App.tsx` | project root | Minimal console: banner, window size, opening button, captured errors, one button per probe |
| `crashLog.ts` | `src/` | Global error handler + in-memory log the UI prints |
| `ErrorBoundary.tsx` | `src/` | Renders render-phase exceptions as text |
| `lastButton.ts` | `src/` | Which button opened the view |
| `buttons.ts` | `src/` | Stable button ids |
| `PluginConfig.example.json` | project root, as `PluginConfig.json` | Manifest with `uses-permissions` declared; keep the `pluginID` the first build generates, and `pluginKey` equal to the `name` in `app.json` |
| `probes.ts` | `src/` | Generic probes: native method inventory, status calls, raw permission calls, raw `listFiles` shape, insertText, lasso recognition |

Rules the kit follows, learned the hard way:

- Paint something before any SDK call. A blank screen has no information.
- One SDK call per tap. A native crash kills the view and the log with it.
- Print raw results with `JSON.stringify` before trusting their shape.
- Print thrown errors with `name`, `code`, `message`, `userInfo`; the useful
  part of a native rejection is rarely in `message`.
- Ask for permissions right before the call that needs them, and declare
  them in `PluginConfig.json` first.
