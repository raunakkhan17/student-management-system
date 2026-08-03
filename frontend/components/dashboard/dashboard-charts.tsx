'use client';

import { format, parseISO } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  axisProps,
  ChartFrame,
  ChartLegend,
  ChartTooltipContent,
  dateAxisProps,
} from '@/components/ui/chart';
import { useChartPalette } from '@/hooks/use-chart-palette';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format';
import type { DashboardCharts } from '@/types/dashboard';
import { GENDER_LABELS } from '@/types/enums';

/** Bars and areas sit on the baseline with a 4px rounded data-end. */
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

const shortDate = (value: string): string => format(parseISO(value), 'd MMM');

// ------------------------------------------------------------------

export function AttendanceTrendChart({ data }: { data: DashboardCharts['attendanceTrend'] }) {
  const { series, ink } = useChartPalette();
  const points = data.filter((row) => row.percentage !== null);

  return (
    <ChartFrame
      title="Attendance trend"
      description="Daily present rate across the institution"
      isEmpty={points.length === 0}
    >
      <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={ink.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={ink.axis} {...dateAxisProps} />
        <YAxis
          domain={[0, 100]}
          unit="%"
          stroke={ink.axis}
          width={44}
          {...axisProps}
        />
        <Tooltip
          cursor={{ stroke: ink.axis, strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <ChartTooltipContent
                title={format(parseISO(String(payload[0].payload.date)), 'EEEE, d MMM yyyy')}
                rows={[
                  {
                    label: 'Present',
                    value: `${payload[0].payload.percentage}%`,
                    color: series[0],
                  },
                ]}
              />
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="percentage"
          stroke={series[0]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </LineChart>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------

export function FeeCollectionChart({ data }: { data: DashboardCharts['feeCollection'] }) {
  const { series, ink } = useChartPalette();
  const total = data.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <ChartFrame
      title="Fee collection"
      description="Payments received per day"
      action={
        <span className="text-sm font-semibold">{formatCurrency(total)}</span>
      }
      isEmpty={data.length === 0}
    >
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={ink.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={ink.axis} {...dateAxisProps} />
        <YAxis
          stroke={ink.axis}
          width={56}
          tickFormatter={(value: number) => formatCurrencyCompact(value)}
          {...axisProps}
        />
        <Tooltip
          cursor={{ fill: ink.grid, fillOpacity: 0.4 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <ChartTooltipContent
                title={format(parseISO(String(payload[0].payload.date)), 'EEEE, d MMM yyyy')}
                rows={[
                  {
                    label: 'Collected',
                    value: formatCurrency(payload[0].payload.amount),
                    color: series[0],
                  },
                  { label: 'Payments', value: String(payload[0].payload.count) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="amount" fill={series[0]} radius={BAR_RADIUS} maxBarSize={28} />
      </BarChart>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------

export function StudentGrowthChart({ data }: { data: DashboardCharts['studentGrowth'] }) {
  const { series, ink } = useChartPalette();

  return (
    <ChartFrame
      title="Student growth"
      description="Cumulative enrolment over the last 12 months"
      isEmpty={data.length === 0}
    >
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]} stopOpacity={0.24} />
            <stop offset="100%" stopColor={series[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={ink.grid} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(value: string) => format(parseISO(value), 'MMM yy')}
          stroke={ink.axis}
          {...dateAxisProps}
        />
        <YAxis stroke={ink.axis} width={44} allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={{ stroke: ink.axis, strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <ChartTooltipContent
                title={format(parseISO(String(payload[0].payload.month)), 'MMMM yyyy')}
                rows={[
                  {
                    label: 'Total enrolled',
                    value: String(payload[0].payload.total),
                    color: series[0],
                  },
                  { label: 'Admitted', value: `+${payload[0].payload.admitted}` },
                ]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={series[0]}
          strokeWidth={2}
          fill="url(#growth-fill)"
        />
      </AreaChart>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------

export function GenderDistributionChart({
  data,
}: {
  data: DashboardCharts['genderDistribution'];
}) {
  const { series } = useChartPalette();
  const total = data.reduce((sum, row) => sum + row.count, 0);

  const slices = data.map((row, index) => ({
    label: GENDER_LABELS[row.gender],
    count: row.count,
    color: series[index % series.length] as string,
    share: total === 0 ? 0 : Math.round((row.count / total) * 100),
  }));

  return (
    <ChartFrame
      title="Gender distribution"
      description="Active students"
      isEmpty={total === 0}
      action={
        <ChartLegend
          items={slices.map((slice) => ({
            label: slice.label,
            color: slice.color,
            value: `${slice.share}%`,
          }))}
        />
      }
    >
      <PieChart>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <ChartTooltipContent
                title={String(payload[0].payload.label)}
                rows={[
                  {
                    label: 'Students',
                    value: `${payload[0].payload.count} (${payload[0].payload.share}%)`,
                    color: String(payload[0].payload.color),
                  },
                ]}
              />
            ) : null
          }
        />
        <Pie
          data={slices}
          dataKey="count"
          nameKey="label"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          strokeWidth={2}
          className="stroke-card"
        >
          {slices.map((slice) => (
            <Cell key={slice.label} fill={slice.color} />
          ))}
        </Pie>
      </PieChart>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------

export function DepartmentStatisticsChart({
  data,
}: {
  data: DashboardCharts['departmentStatistics'];
}) {
  const { series, ink } = useChartPalette();

  return (
    <ChartFrame
      title="Department statistics"
      description="Students enrolled per department"
      isEmpty={data.length === 0}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
      >
        <CartesianGrid stroke={ink.grid} horizontal={false} />
        <XAxis type="number" stroke={ink.axis} allowDecimals={false} {...axisProps} />
        <YAxis
          type="category"
          dataKey="name"
          stroke={ink.axis}
          width={92}
          {...axisProps}
        />
        <Tooltip
          cursor={{ fill: ink.grid, fillOpacity: 0.4 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <ChartTooltipContent
                title={String(payload[0].payload.name)}
                rows={[
                  {
                    label: 'Students',
                    value: String(payload[0].payload.students),
                    color: series[0],
                  },
                  { label: 'Teachers', value: String(payload[0].payload.teachers) },
                  { label: 'Subjects', value: String(payload[0].payload.subjects) },
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="students"
          fill={series[0]}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ChartFrame>
  );
}
