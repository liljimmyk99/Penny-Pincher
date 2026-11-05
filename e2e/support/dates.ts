/** Calendar dates as YYYY-MM-DD in a given time zone (the browser's, in tests). */
export function todayIn(timeZone: string | undefined, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const monthOf = (date: string) => date.slice(0, 7);

/** "2026-01" shifted by -1 is "2025-12". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (month: string) => NAMES[Number(month.slice(5, 7)) - 1];
export const formatMonth = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`;
/** "2026-10-03" -> "Oct 3", as the app writes short dates. */
export const shortDate = (date: string) => `${monthName(date.slice(0, 7)).slice(0, 3)} ${Number(date.slice(8, 10))}`;

/**
 * A time zone whose calendar date differs from UTC's right now, so any code that
 * turns a local date into a UTC instant (new Date("YYYY-MM-DD"), toISOString())
 * lands on the wrong day. The gate's "after 7 pm Eastern" case is one instance;
 * this picks a zone that shows the bug at any time of day.
 */
export function zoneOffUtcDate(now = new Date()): string {
  return now.getUTCHours() < 10 ? "Pacific/Pago_Pago" /* UTC-11 */ : "Pacific/Kiritimati" /* UTC+14 */;
}
