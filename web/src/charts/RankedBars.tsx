import type { ReactNode } from "react";
import { barWidth } from "../pages/summary/summary";
import "./charts.css";

export interface RankedBar {
  id: string;
  label: string;
  cents: number;
  /** The formatted amount. */
  amount: string;
  color: string;
  /** Text shown after the amount, e.g. "25% of income". */
  detail?: string;
  saving?: boolean;
  /** The row's change indicator, and its words for screen readers. */
  change?: ReactNode;
  changeText?: string;
}

/**
 * Ranked horizontal bars (an approved chart type). Rows are buttons that only
 * highlight themselves; each row's accessible name carries its figures.
 */
export function RankedBars({
  rows,
  highlightedId,
  onToggle,
  label,
}: {
  rows: RankedBar[];
  highlightedId: string | null;
  onToggle: (id: string) => void;
  label: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.cents));
  return (
    <ul className="ranked" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={`ranked__row${highlightedId === r.id ? " is-highlighted" : ""}${highlightedId && highlightedId !== r.id ? " is-dimmed" : ""}`}
            aria-pressed={highlightedId === r.id}
            aria-label={[r.label, r.amount, r.detail, r.changeText].filter(Boolean).join(", ")}
            onClick={() => onToggle(r.id)}
          >
            <span className="ranked__name">
              {r.label}
              {r.saving && <span className="badge badge--saving">Saving</span>}
            </span>
            <span className="ranked__track" aria-hidden="true">
              <span className="ranked__bar" style={{ width: `${barWidth(r.cents, max)}%`, background: r.color }} />
            </span>
            <span className="ranked__amount" aria-hidden="true">{r.amount}</span>
            <span className="ranked__detail" aria-hidden="true">{r.detail}</span>
            <span className="ranked__extra" aria-hidden="true">{r.change}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
