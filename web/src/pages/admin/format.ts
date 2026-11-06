/** Display helpers for the admin panel. Sizes are bytes; times are ISO instants. */

const units = ["B", "KB", "MB", "GB", "TB"];

/** 0 -> "0 B", 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return `${text} ${units[unit]}`;
}

/** 90061 -> "1d 1h", 3700 -> "1h 1m", 42 -> "42s". */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** An ISO instant in the viewer's time zone, e.g. "Nov 6, 2026, 3:04 PM". */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
