'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { CHART_INK, CHART_SERIES } from '@/components/ui/chart';

/** Nothing to subscribe to — the value differs between server and client, and never again. */
const neverChanges = () => () => {};

/**
 * Series colours for the active theme.
 *
 * Recharts writes `fill`/`stroke` as SVG presentation attributes, which do not
 * resolve `var()`, so the charts need literal values rather than the
 * `--chart-*` tokens. Light is assumed until hydration, matching the server
 * render; the dark steps are selected for their own surface, not flipped.
 */
export function useChartPalette() {
  const { resolvedTheme } = useTheme();

  const mounted = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );

  const mode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return { series: CHART_SERIES[mode], ink: CHART_INK[mode], mode };
}
