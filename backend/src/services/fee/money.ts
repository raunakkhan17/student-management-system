import { Prisma } from '@prisma/client';

/**
 * Money helpers.
 *
 * All currency arithmetic goes through Prisma.Decimal rather than JS numbers —
 * `0.1 + 0.2 !== 0.3` in binary floating point, and a fee ledger cannot carry
 * that kind of drift. Values are quantised to 2 decimal places on the way out.
 */

export const ZERO = new Prisma.Decimal(0);

export function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Rounds half-up to 2 decimal places, the convention for invoice totals. */
export function money(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: (Prisma.Decimal | number | string)[]): Prisma.Decimal {
  return money(values.reduce<Prisma.Decimal>((total, value) => total.add(toDecimal(value)), ZERO));
}

/** Applies a percentage or fixed concession, never exceeding `base`. */
export function applyConcession(
  base: Prisma.Decimal,
  type: 'PERCENTAGE' | 'FIXED',
  value: Prisma.Decimal | number,
): Prisma.Decimal {
  const amount =
    type === 'PERCENTAGE' ? base.mul(toDecimal(value)).div(100) : toDecimal(value);

  // A concession can never turn into a credit.
  return money(Prisma.Decimal.min(money(amount), base));
}

/** Splits a total into `count` installments, putting any remainder on the first. */
export function splitInstallments(total: Prisma.Decimal, count: number): Prisma.Decimal[] {
  if (count <= 1) return [money(total)];

  const base = money(total.div(count));
  const parts = Array.from({ length: count }, () => base);

  // Rounding can leave the parts short or long of the total by a few paise.
  const drift = money(total.sub(sum(parts)));
  parts[0] = money(base.add(drift));

  return parts;
}

export function isZero(value: Prisma.Decimal): boolean {
  return value.isZero();
}

export function gt(a: Prisma.Decimal, b: Prisma.Decimal | number): boolean {
  return a.greaterThan(toDecimal(b));
}

export function gte(a: Prisma.Decimal, b: Prisma.Decimal | number): boolean {
  return a.greaterThanOrEqualTo(toDecimal(b));
}
