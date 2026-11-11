/**
 * Tiny store for "which button opened the plugin UI".
 *
 * The host fires onButtonPress in index.js, then mounts App. App cannot
 * receive props from the host, so it reads the last event from here and
 * subscribes for changes while mounted.
 */
export type ButtonEvent = {id: number; name: string; icon: string};

type Listener = (event: ButtonEvent) => void;

let last: ButtonEvent | null = null;
const listeners = new Set<Listener>();

export function setLastButton(event: ButtonEvent): void {
  last = event;
  listeners.forEach(fn => fn(event));
}

export function getLastButton(): ButtonEvent | null {
  return last;
}

export function subscribeLastButton(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
