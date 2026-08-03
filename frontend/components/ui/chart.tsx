'use client';

import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Shared chart chrome. Recharts needs concrete values rather than CSS custom
 * properties for stroke and fill, so the series colours live here as literals
 * that mirror the `--chart-*` tokens in `globals.css`.
 *
 * Fixed order, never cycled: slot 1 carries every single-series chart, and a
 * categorical chart takes slots in order. Both sets are validated for
 * colour-vision separation against their own surface.
 */
export const CHART_SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a'],
  dark: ['#3987e5', '#d95926', '#199e70'],
} as const;

export const CHART_INK = {
  light: { grid: '#e5e7eb', axis: '#6b7280' },
  dark: { grid: '#374151', axis: '#9ca3af' },
} as const;

/** Recharts axis/grid defaults — recessive, never competing with the marks. */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const;

/**
 * For date axes. Recharts will happily draw a tick per point and let the labels
 * collide, so drop ticks rather than overlap them — the tooltip carries the
 * exact date for every point regardless.
 */
export const dateAxisProps = {
  ...axisProps,
  minTickGap: 24,
  interval: 'preserveStartEnd',
} as const;

interface ChartFrameProps {
  title: string;
  description?: string;
  /** Rendered top-right — a legend, a total, or a range control. */
  action?: ReactNode;
  /** Shown instead of the plot when there is nothing to draw. */
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Titled card around a chart. The title names the measure, which is why a
 * single-series chart needs no legend box.
 */
export function ChartFrame({
  title,
  description,
  action,
  isEmpty = false,
  emptyMessage = 'No data for this period yet.',
  height = 240,
  className,
  children,
}: ChartFrameProps) {
  return (
    <section
      className={cn('bg-card rounded-xl border p-5', className)}
      aria-label={title}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          )}
        </div>
        {action}
      </div>

      {isEmpty ? (
        <div
          className="text-muted-foreground flex items-center justify-center text-sm"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

interface LegendProps {
  items: { label: string; color: string; value?: string }[];
}

/** Always present for two or more series — identity is never colour alone. */
export function ChartLegend({ items }: LegendProps) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.label}</span>
          {item.value && <span className="text-foreground font-medium">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Shared tooltip body so every chart's hover layer reads the same. */
export function ChartTooltipContent({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-medium tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
