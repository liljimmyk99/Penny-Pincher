import "./charts.css";

export interface PairedGroup {
  id: string;
  /** Short label under the pair, e.g. "Jan". */
  label: string;
  a: number;
  b: number;
  /** The group's text alternative, e.g. "January: income $1.00, spent $2.00". */
  name: string;
}

/**
 * Income vs. spent per period as paired vertical bars (an approved chart type).
 * Each pair is a button when `onSelect` is given; its accessible name is the
 * group's text alternative, and the chart has a text summary too.
 */
export function PairedBars({
  groups,
  aName,
  bName,
  onSelect,
  selectedId,
  variant,
  label,
  summary,
}: {
  groups: PairedGroup[];
  aName: string;
  bName: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** "years" colours the pair as this year (a) vs. last year (b). */
  variant?: "years";
  label: string;
  /** One sentence for screen readers, e.g. the year's totals. */
  summary: string;
}) {
  const max = Math.max(0, ...groups.flatMap((g) => [g.a, g.b]));
  const height = (cents: number) => (cents <= 0 || max <= 0 ? 0 : Math.max(2, Math.round((cents / max) * 100)));
  return (
    <div className={`paired${variant ? ` paired--${variant}` : ""}`}>
      <p className="visually-hidden">{summary}</p>
      <ul className="paired__plot" aria-label={label}>
        {groups.map((g) => {
          const inner = (
            <>
              <span className="paired__bars" aria-hidden="true">
                <span className="paired__bar paired__bar--a" style={{ height: `${height(g.a)}%` }} />
                <span className="paired__bar paired__bar--b" style={{ height: `${height(g.b)}%` }} />
              </span>
              <span className="paired__label" aria-hidden="true">{g.label}</span>
            </>
          );
          return (
            <li key={g.id}>
              {onSelect ? (
                <button type="button" className={`paired__group${selectedId === g.id ? " is-selected" : ""}`}
                  aria-pressed={selectedId === undefined ? undefined : selectedId === g.id}
                  aria-label={g.name}
                  onClick={() => onSelect(g.id)}>
                  {inner}
                </button>
              ) : (
                <div className="paired__group" role="img" aria-label={g.name}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="paired__legend" aria-hidden="true">
        <span><i className="paired__swatch paired__bar--a" />{aName}</span>
        <span><i className="paired__swatch paired__bar--b" />{bName}</span>
      </p>
    </div>
  );
}
