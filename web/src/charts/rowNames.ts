import type { RankedBar } from "./RankedBars";

/** The Saving badge, unless the row is already called "Saving" (it would say it twice). */
export function showSavingBadge(r: { label: string; saving?: boolean }): boolean {
  return !!r.saving && r.label.trim().toLowerCase() !== "saving";
}

/**
 * A row's accessible name: the visible text in its visible order (WCAG 2.5.3, #179),
 * "Name[, Saving], amount, detail, change in words".
 */
export function rankedBarName(r: RankedBar): string {
  return [r.label, showSavingBadge(r) && "Saving", r.amount, r.detail, r.changeText].filter(Boolean).join(", ");
}
