import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

type DateLike = string | number | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

/** `12 Aug 2026` */
export function formatDate(value: DateLike, fallback = '—'): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy') : fallback;
}

/** `12 Aug 2026, 3:45 pm` */
export function formatDateTime(value: DateLike, fallback = '—'): string {
  const date = toDate(value);
  return date ? format(date, "d MMM yyyy, h:mm aaa") : fallback;
}

/** `3:45 pm` */
export function formatTime(value: DateLike, fallback = '—'): string {
  const date = toDate(value);
  return date ? format(date, 'h:mm aaa') : fallback;
}

/** `about 2 hours ago` */
export function formatRelative(value: DateLike, fallback = '—'): string {
  const date = toDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : fallback;
}

/** `2026-08-12` — the format the API expects for date-only fields. */
export function toDateInputValue(value: DateLike): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/** `₹1,20,000.00` — Prisma serialises Decimal as a string, so both are accepted. */
export function formatCurrency(value: number | string | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : fallback;
}

const numberFormatter = new Intl.NumberFormat('en-IN');

export function formatNumber(value: number | string | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? numberFormatter.format(numeric) : fallback;
}

/** `87.5%` */
export function formatPercent(
  value: number | string | null | undefined,
  fractionDigits = 1,
  fallback = '—',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? `${numeric.toFixed(fractionDigits)}%` : fallback;
}

/** Turns `AB_POSITIVE` into `Ab positive` for enums without an explicit label. */
export function humanizeEnum(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
