import "./charts.css";

export interface PeriodBar {
  id: string;
  /** Short label under the bar, e.g. "Jan". */
  label: string;
  value: number;
  /** The bar's text alternative, e.g. "March: $12.00". */
  name: string;
}

/**
 * One measure per period as vertical bars (the approved custom-trend chart).
 * Each bar is a button when `onSelect` is given; the chart also has a text summary.
 */
export function PeriodBars({
  bars,
  selectedId,
  onSelect,
  label,
  summary,
}: {
  bars: PeriodBar[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  label: string;
  summary: string;
}) {
  const max = Math.max(0, ...bars.map((b) => b.value));
  const height = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.max(2, Math.round((v / max) * 100)));
  return (
    <div className="period">
      <p className="visually-hidden">{summary}</p>
      <ul className="period__plot" aria-label={label} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b) => {
          const inner = (
            <>
              <span className="period__bar-wrap" aria-hidden="true">
                <span className="period__bar" style={{ height: `${height(b.value)}%` }} />
              </span>
              <span className="paired__label" aria-hidden="true">{b.label}</span>
            </>
          );
          return (
            <li key={b.id}>
              {onSelect ? (
                <button
                  type="button"
                  className={`paired__group${b.id === selectedId ? " is-selected" : ""}`}
                  aria-label={b.name}
                  aria-pressed={b.id === selectedId}
                  onClick={() => onSelect(b.id)}
                >
                  {inner}
                </button>
              ) : (
                <div className="paired__group" role="img" aria-label={b.name}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Small decorative bars for lists; the caller supplies the text alternative. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(0, ...values);
  return (
    <span className="spark" aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} className="spark__bar" style={{ height: `${v <= 0 || max <= 0 ? 0 : Math.max(8, Math.round((v / max) * 100))}%` }} />
      ))}
    </span>
  );
}
