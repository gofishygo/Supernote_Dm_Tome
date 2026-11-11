/**
 * Captures errors that would otherwise make the plugin view silently blank.
 *
 * In a release bundle there is no red box and console.log goes nowhere, so an
 * uncaught exception during startup or render leaves an empty screen. We hook
 * React Native's global error handler and keep the last few errors in memory
 * so the UI can print them.
 */
type Entry = {when: string; message: string; fatal: boolean};

const entries: Entry[] = [];
const listeners = new Set<() => void>();

export function getCrashLog(): Entry[] {
  return entries;
}

export function subscribeCrashLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function recordError(err: unknown, fatal = false): void {
  const e = err as {message?: string; stack?: string} | undefined;
  const message = e?.stack
    ? `${e.message ?? ''}\n${e.stack}`.slice(0, 1500)
    : String(err);
  entries.push({when: new Date().toISOString().slice(11, 19), message, fatal});
  if (entries.length > 10) {
    entries.shift();
  }
  listeners.forEach(fn => fn());
}

export function installGlobalErrorHandler(): void {
  const g = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
  };
  const utils = g.ErrorUtils;
  if (!utils) {
    return;
  }
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((e, fatal) => {
    recordError(e, !!fatal);
    // Do not re-throw: a fatal here would kill the plugin runtime and hide
    // the message we just captured. Call the previous handler only for
    // non-fatal errors so logging still happens where it is available.
    if (!fatal && previous) {
      try {
        previous(e, fatal);
      } catch {
        // ignore
      }
    }
  });
}
