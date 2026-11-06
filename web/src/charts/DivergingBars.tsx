import type { ChangeTone } from "../lib/change";
import "./charts.css";

export interface DivergingBar {
  id: string;
  label: string;
  /** Signed change in cents: right of the zero line when positive, left when negative. */
  delta: number;
  tone: ChangeTone;
  /** The change indicator shown beside the bar (arrow, sign, amount). */
  change: React.ReactNode;
  /** The row's text alternative. */
  name: string;
  saving?: boolean;
}

/** Bar half-width as a percent of the track (0–50); a visible minimum for any change. */
function divergingWidth(delta: number, maxAbs: number): number {
  if (delta === 0 || maxAbs <= 0) return 0;
  return Math.max(1, Math.round((Math.abs(delta) / maxAbs) * 50));
}

/**
 * Biggest movers as diverging horizontal bars around a zero line (an approved
 * chart type). Increases go right, decreases left; colour says better or worse.
 */
export function DivergingBars({
  rows,
  selectedId,
  onSelect,
  label,
}: {
  rows: DivergingBar[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
}) {
  const maxAbs = Math.max(0, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <ul className="diverging" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={`diverging__row${selectedId === r.id ? " is-selected" : ""}`}
            aria-pressed={selectedId === r.id}
            aria-label={r.name}
            onClick={() => onSelect(r.id)}
          >
            <span className="ranked__name">
              {r.label}
              {r.saving && <span className="badge badge--saving">Saving</span>}
            </span>
            <span className="diverging__track" aria-hidden="true">
              <span
                className={`diverging__bar diverging__bar--${r.delta > 0 ? "up" : "down"} diverging__bar--${r.tone}`}
                style={{ width: `${divergingWidth(r.delta, maxAbs)}%` }}
              />
            </span>
            <span aria-hidden="true">{r.change}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
