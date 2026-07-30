'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Events that count as the user still being present. */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'] as const;

interface IdleTimeoutOptions {
  /** Total inactivity before `onTimeout` fires. */
  timeoutMs: number;
  /** How long before the timeout the warning appears. */
  warningMs: number;
  onTimeout: () => void;
  enabled?: boolean;
}

interface IdleTimeoutResult {
  isWarning: boolean;
  /** Whole seconds remaining once the warning is showing. */
  secondsRemaining: number;
  /** Dismisses the warning and restarts the countdown. */
  stayActive: () => void;
}

/**
 * Tracks user inactivity to satisfy the PRD's session-timeout requirement.
 *
 * The user is warned before the session ends rather than being dropped
 * silently, so in-progress work can be saved.
 */
export function useIdleTimeout({
  timeoutMs,
  warningMs,
  onTimeout,
  enabled = true,
}: IdleTimeoutOptions): IdleTimeoutResult {
  const [isWarning, setIsWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(warningMs / 1000));

  const lastActivityRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsWarning(false);
    setSecondsRemaining(Math.ceil(warningMs / 1000));
  }, [warningMs]);

  useEffect(() => {
    if (!enabled) return;

    const markActive = () => {
      // While the warning is showing, only the explicit "stay signed in"
      // action should reset the clock — otherwise a stray scroll hides it.
      if (!isWarning) {
        lastActivityRef.current = Date.now();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;

      if (idleFor >= timeoutMs) {
        setIsWarning(false);
        onTimeoutRef.current();
        return;
      }

      if (idleFor >= timeoutMs - warningMs) {
        setIsWarning(true);
        setSecondsRemaining(Math.max(0, Math.ceil((timeoutMs - idleFor) / 1000)));
      } else if (isWarning) {
        setIsWarning(false);
      }
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
      window.clearInterval(interval);
    };
  }, [enabled, isWarning, timeoutMs, warningMs]);

  return { isWarning, secondsRemaining, stayActive: reset };
}
