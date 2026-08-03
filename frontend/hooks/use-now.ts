'use client';

import { useSyncExternalStore } from 'react';

/** How often subscribers are re-rendered with a fresh reading. */
const TICK_MS = 30_000;

let snapshot = Date.now();
let timer: number | undefined;
const listeners = new Set<() => void>();

function tick(): void {
  const next = Date.now();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  if (timer === undefined) {
    timer = window.setInterval(tick, TICK_MS);
  }

  // Nothing advances the snapshot while there are no subscribers, so it may be
  // arbitrarily stale by the time one arrives. Refresh rather than wait a tick.
  tick();

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = (): number => snapshot;

/** The server has no clock the client will agree with; nothing is past due until hydration. */
const getServerSnapshot = (): number => 0;

/**
 * Current epoch milliseconds, refreshed every {@link TICK_MS} while mounted.
 *
 * Reading `Date.now()` during render is impure — two renders of identical props
 * can disagree, and React is free to discard and replay a render. Sourcing the
 * clock from an external store makes the dependency explicit, and lets anything
 * derived from it (overdue badges, countdowns) go stale on its own rather than
 * waiting for an unrelated re-render.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
