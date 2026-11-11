import { Link } from "react-router";
import { IMPORT_PATH } from "../navigation";
import { useImportBanner } from "./useImportBanner";
import "./ImportBanner.css";

function timeLeft(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return "less than a minute left";
  return `about ${Math.round(seconds / 60)} min left`;
}

const entries = (n: number) => `${n.toLocaleString()} ${n === 1 ? "entry" : "entries"}`;

/**
 * Shows an import's progress on every screen (web/AGENTS.md "Progress banner"):
 * blue while running, green when finished, red when it stopped.
 */
export function ImportBanner() {
  const { state, dismiss } = useImportBanner();
  if (!state) return null;

  if (state.kind === "running") {
    const p = state.progress;
    const percent = p && p.rows_total > 0 ? Math.floor((p.rows_done / p.rows_total) * 100) : 0;
    const left = timeLeft(p?.eta_seconds);
    return (
      <section className="import-banner import-banner--running" role="status" aria-label="Import progress">
        <div className="import-banner__row">
          <p className="import-banner__text">
            <strong>Importing {state.name}</strong> · {percent}%
            {p ? ` · ${p.rows_done.toLocaleString()} of ${entries(p.rows_total)}` : ""}
            {left ? ` · ${left}` : ""}
          </p>
          <Link className="btn btn--ghost btn--sm" to={IMPORT_PATH}>
            View progress
          </Link>
        </div>
        <div
          className="import-banner__line"
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="import-banner__fill" style={{ width: `${percent}%` }} />
        </div>
      </section>
    );
  }

  const finished = state.kind === "finished";
  return (
    <section
      className={`import-banner ${finished ? "import-banner--finished" : "import-banner--stopped"}`}
      role={finished ? "status" : "alert"}
      aria-label="Import result"
    >
      <div className="import-banner__row">
        <p className="import-banner__text">
          {finished ? (
            <>
              <strong>Import finished</strong> · {entries(state.record.entries_imported)} added from{" "}
              {state.record.file_name}
            </>
          ) : (
            <>
              <strong>Import stopped</strong> · {state.record.file_name}. Nothing was saved.
            </>
          )}
        </p>
        <div className="import-banner__actions">
          <Link className="btn btn--ghost btn--sm" to={IMPORT_PATH}>
            {finished ? "View details" : "Try again"}
          </Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
