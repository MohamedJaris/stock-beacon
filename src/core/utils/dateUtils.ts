import { DateFormatOption } from '@/domain/enums';

/**
 * Validates that a string is in strict YYYY-MM-DD format and represents a real calendar date.
 */
export function isValidIsoDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Returns today's calendar date (YYYY-MM-DD) in the business's configured IANA timezone.
 */
export function getTodayInTimezone(timezone = 'Asia/Kolkata', now = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback to local calendar date if Intl timezone is unsupported
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds (or subtracts) calendar days from a YYYY-MM-DD string deterministically in UTC.
 */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const ry = dt.getUTCFullYear();
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/**
 * Generates an inclusive array of YYYY-MM-DD dates from startDate to endDate.
 * Throws if startDate > endDate or if either date is invalid.
 */
export function getInclusiveDateRange(startDate: string, endDate: string): string[] {
  if (!isValidIsoDate(startDate)) {
    throw new Error(`Invalid start date: ${startDate}`);
  }
  if (!isValidIsoDate(endDate)) {
    throw new Error(`Invalid end date: ${endDate}`);
  }
  if (startDate > endDate) {
    throw new Error(`Start date (${startDate}) cannot be later than end date (${endDate}).`);
  }

  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Formats a YYYY-MM-DD string according to the business's preferred date format.
 */
export function formatDisplayDate(
  isoDate: string | null | undefined,
  dateFormat: DateFormatOption = 'DD/MM/YYYY'
): string {
  if (!isoDate) return 'Never';
  const clean = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return isoDate;
  const [y, m, d] = clean.split('-');
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD':
      return `${y}-${m}-${d}`;
    case 'DD/MM/YYYY':
    default:
      return `${d}/${m}/${y}`;
  }
}

/**
 * Formats a friendly short date like "Nov 2, 2026".
 */
export function formatReadableDate(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}
