import { formatCents } from "./money";

/**
 * Change indicators (web/AGENTS.md "Change indicators"): colour by meaning,
 * not direction. Spending up is worse (orange), down is better (blue).
 * For Saving the meaning flips: saving more is better.
 * An arrow and a +/− sign always accompany the colour.
 */
export type ChangeTone = "worse" | "better" | "none";

export function changeTone(deltaCents: number, isSaving: boolean): ChangeTone {
  if (deltaCents === 0) return "none";
  return deltaCents > 0 !== isSaving ? "worse" : "better";
}

export interface Change {
  tone: ChangeTone;
  /** "▲", "▼", or "" when nothing changed. */
  arrow: string;
  /** "+$12.00", "−$3.50" or "$0.00". */
  amount: string;
  /** "+10%" / "−4%", or null when there was nothing last month to compare with. */
  percent: string | null;
}

/** Current vs. previous period, in integer cents. */
export function describeChange(currentCents: number, previousCents: number, isSaving = false): Change {
  const delta = currentCents - previousCents;
  const percent =
    previousCents > 0 && delta !== 0
      ? `${delta > 0 ? "+" : "−"}${Math.round((Math.abs(delta) / previousCents) * 100)}%`
      : null;
  return {
    tone: changeTone(delta, isSaving),
    arrow: delta === 0 ? "" : delta > 0 ? "▲" : "▼",
    amount: formatCents(delta, { showPlus: true }),
    percent,
  };
}

/** The change as words, for a row's accessible name. */
export function changeWords(current: number, previous: number, saving = false): string {
  const c = describeChange(current, previous, saving);
  if (c.tone === "none") return "no change vs. last month";
  return `${c.tone === "worse" ? "worse" : "better"} ${c.amount}${c.percent ? ` (${c.percent})` : ""} vs. last month`;
}
