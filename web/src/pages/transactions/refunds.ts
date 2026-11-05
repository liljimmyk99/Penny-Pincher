import type { Schemas } from "../../api";
import { formatShortDate, monthName, monthOf } from "../../lib/dates";
import { formatCents } from "../../lib/money";

/**
 * How refunds read in the transaction list (web/AGENTS.md "Refunds"). Display
 * only: an original's net is `amount_cents + refunded_total_cents`, never stored.
 */

type Expense = Schemas["Expense"];

export const isRefund = (e: Expense) => e.amount_cents < 0;

export interface RefundTag {
  kind: "full" | "partial" | "earlier" | "unlinked";
  label: string;
}

/**
 * The one tag on a refund row. "From <Month>" wins when the original is in an
 * earlier month (with the year when it differs); otherwise the refund is full
 * when it covers the original's whole amount. Null while the original loads.
 */
export function refundTag(refund: Expense, original: Expense | undefined): RefundTag | null {
  if (!refund.refunded_expense_id) return { kind: "unlinked", label: "Not linked" };
  if (!original) return null;
  const from = monthOf(original.date);
  const to = monthOf(refund.date);
  if (from < to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return { kind: "earlier", label: `From ${monthName(from)}${sameYear ? "" : ` ${from.slice(0, 4)}`}` };
  }
  return -refund.amount_cents >= original.amount_cents
    ? { kind: "full", label: "Full refund" }
    : { kind: "partial", label: "Partial refund" };
}

/** "Corner Store · Mar 12 · $50.00": what a refund's "Refund for" link reads. */
export function describeOriginal(original: Expense): string {
  return `${original.merchant.name} · ${formatShortDate(original.date)} · ${formatCents(original.amount_cents)}`;
}

export interface OriginalStatus {
  /** Refunds cover the whole amount, so the amount is struck through. */
  full: boolean;
  text: string;
  netCents: number;
}

/** What happened to an expense that refunds point at; null when none do. */
export function originalStatus(expense: Expense): OriginalStatus | null {
  if (isRefund(expense) || expense.refunded_total_cents === 0) return null;
  const netCents = expense.amount_cents + expense.refunded_total_cents;
  const on = expense.last_refund_date ? ` on ${formatShortDate(expense.last_refund_date)}` : "";
  const net = `net ${formatCents(netCents)}`;
  return netCents <= 0
    ? { full: true, netCents, text: `Refunded in full${on} · ${net}` }
    : { full: false, netCents, text: `Partly refunded · ${formatCents(expense.refunded_total_cents)}${on} · ${net}` };
}

export interface RefundTotals {
  /** Sum of the month's refunds (zero or negative). */
  refundCents: number;
  refundCount: number;
  linkedCount: number;
  /** Every expense logged in the month, refunds left out. */
  beforeCents: number;
  /** What Summary and Trends show: expenses plus refunds. */
  afterCents: number;
}

export function refundTotals(expenses: Expense[]): RefundTotals {
  let refundCents = 0;
  let refundCount = 0;
  let linkedCount = 0;
  let beforeCents = 0;
  for (const e of expenses) {
    if (isRefund(e)) {
      refundCents += e.amount_cents;
      refundCount += 1;
      if (e.refunded_expense_id) linkedCount += 1;
    } else {
      beforeCents += e.amount_cents;
    }
  }
  return { refundCents, refundCount, linkedCount, beforeCents, afterCents: beforeCents + refundCents };
}

/** The "Refunds" and "Not linked" chips. */
export type RefundFilter = "refunds" | "unlinked";

export function matchesRefundFilter(e: Expense, filter: RefundFilter | null): boolean {
  if (filter === "refunds") return isRefund(e);
  if (filter === "unlinked") return isRefund(e) && !e.refunded_expense_id;
  return true;
}

/**
 * The Suggested match in the linking dialog: an expense in the refund's
 * category, dated on or before the refund, with enough left (after earlier
 * refunds) to cover it; the closest one before the refund wins. Candidates
 * arrive newest first, so ties keep the most recent.
 */
export function suggestOriginal(refund: Expense, candidates: Expense[]): Expense | null {
  let best: Expense | null = null;
  for (const c of candidates) {
    if (isRefund(c) || c.id === refund.id) continue;
    if (c.category_id !== refund.category_id || c.date > refund.date) continue;
    if (c.amount_cents + c.refunded_total_cents < -refund.amount_cents) continue;
    if (!best || c.date > best.date) best = c;
  }
  return best;
}
