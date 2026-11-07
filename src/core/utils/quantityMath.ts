/**
 * Safe scaled-integer arithmetic for inventory quantities.
 * Uses a scale factor of 1000 (3 decimal places, e.g., 1.250 kg or 0.500 m)
 * to prevent IEEE-754 floating-point drift (such as 0.1 + 0.2 = 0.30000000000000004).
 */
const SCALE_FACTOR = 1000;

export function toScaledInt(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric quantity: ${value}`);
  }
  return Math.round(value * SCALE_FACTOR);
}

export function fromScaledInt(scaled: number): number {
  return scaled / SCALE_FACTOR;
}

export function normalizeQuantity(value: number, allowFractional = true): number {
  const normalized = fromScaledInt(toScaledInt(value));
  if (!allowFractional) {
    return Math.round(normalized);
  }
  return normalized;
}

export function addQuantities(a: number, b: number): number {
  return fromScaledInt(toScaledInt(a) + toScaledInt(b));
}

export function subtractQuantities(a: number, b: number): number {
  return fromScaledInt(toScaledInt(a) - toScaledInt(b));
}

export function compareQuantities(a: number, b: number): -1 | 0 | 1 {
  const sa = toScaledInt(a);
  const sb = toScaledInt(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

export function isQuantityLessOrEqual(a: number, b: number): boolean {
  return toScaledInt(a) <= toScaledInt(b);
}

export function isQuantityZero(a: number): boolean {
  return toScaledInt(a) === 0;
}

export function isQuantityPositive(a: number): boolean {
  return toScaledInt(a) > 0;
}

export function formatQuantity(
  value: number | null | undefined,
  unitSymbol?: string
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unknown';
  }
  const normalized = normalizeQuantity(value, true);
  const formatted = Number.isInteger(normalized)
    ? normalized.toString()
    : normalized.toFixed(3).replace(/\.?0+$/, '');
  return unitSymbol ? `${formatted} ${unitSymbol}` : formatted;
}
