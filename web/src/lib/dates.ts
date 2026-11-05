/**
 * Calendar dates are `YYYY-MM-DD` strings and months are `YYYY-MM` (web/AGENTS.md
 * "Dates"). Everything here works on the strings or on local calendar fields,
 * never on UTC instants, so a time zone can't shift a date.
 */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's local calendar date. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isMonth(value: string | null | undefined): value is string {
  return !!value && MONTH_RE.test(value);
}

/** A real calendar date (rejects 2026-02-30). */
export function isDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  return Number(m[3]) <= daysInMonth(Number(m[1]), Number(m[2]));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** "2026-01" shifted by -1 is "2025-12". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** First and last calendar date of a month. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  return { first: `${month}-01`, last: `${month}-${pad(daysInMonth(y, m))}` };
}

/** Where a new entry lands by default: today in the current month, else the 1st. */
export function defaultDateFor(month: string, today: string = todayISO()): string {
  return monthOf(today) === month ? today : `${month}-01`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10" -> "October 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2026-10" -> "October". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1];
}

/** "2026-10-03" -> "Oct 3". */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}
