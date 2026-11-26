import type { CSSProperties, ReactNode } from "react";
import { barWidth } from "../pages/summary/summary";
import { Badge } from "@/components/ui/badge";
import { rankedBarName, showSavingBadge } from "./rowNames";
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
  detailWidth,
}: {
  rows: RankedBar[];
  highlightedId: string | null;
  onToggle: (id: string) => void;
  label: string;
  /** The detail column's width, when its text is longer than "25% of income". */
  detailWidth?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.cents));
  return (
    <ul className="ranked" aria-label={label} style={detailWidth ? ({ "--ranked-detail-width": detailWidth } as CSSProperties) : undefined}>
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={`ranked__row${highlightedId === r.id ? " is-highlighted" : ""}${highlightedId && highlightedId !== r.id ? " is-dimmed" : ""}`}
            aria-pressed={highlightedId === r.id}
            aria-label={rankedBarName(r)}
            onClick={() => onToggle(r.id)}
          >
            <span className="ranked__name">
              {r.label}{" "}
              {showSavingBadge(r) && <Badge variant="saving">Saving</Badge>}
            </span>{" "}
            <span className="ranked__track" aria-hidden="true">
              <span className="ranked__bar" style={{ width: `${barWidth(r.cents, max)}%`, background: r.color }} />
            </span>{" "}
            <span className="ranked__amount" aria-hidden="true">{r.amount}</span>{" "}
            <span className="ranked__detail" aria-hidden="true">{r.detail}</span>{" "}
            <span className="ranked__extra" aria-hidden="true">{r.change}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
