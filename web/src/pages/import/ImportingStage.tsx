import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, useImportMutations, useImportProgress, type ImportRecord } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { formatMonth } from "../../lib/dates";
import { timeLeft } from "./hints";

export function ImportingStage({ record }: { record: ImportRecord }) {
  const live = useImportProgress(record.id, true);
  const { cancel } = useImportMutations();
  const [confirming, setConfirming] = useState(false);

  const p = live ?? record.progress;
  const done = p?.rows_done ?? 0;
  const total = p?.rows_total ?? record.rows_ready;
  const percent = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
  const month = p?.current_month ? formatMonth(p.current_month) : null;
  const left = timeLeft(p?.eta_seconds);

  return (
    <section className="card import-card" aria-labelledby="import-running-h">
      <h2 id="import-running-h" className="import-card__title">
        Importing {record.file_name}
      </h2>
      <p className="import-percent">{percent}%</p>
      <div
        className="import-bar"
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%, ${done} of ${total} entries${month ? `, ${month}` : ""}`}
      >
        <div className="import-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="import-muted">
        {done} of {total} entries{month ? ` · ${month}` : ""} · {left}
      </p>

      {p && p.years.length > 0 && (
        <ul className="import-years">
          {p.years.map((y) => (
            <li key={y.year}>
              <span>{y.year}</span>
              <span>
                {y.rows_done} / {y.rows_total}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="import-muted">You can leave this page. Months fill in as the import runs.</p>
      <div className="import-footer">
        <Link to="/summary" className="btn btn--ghost">
          Go to Summary while it runs
        </Link>
        <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
          Cancel import
        </button>
      </div>

      <DeleteDialog
        open={confirming}
        title="Cancel this import?"
        body="The import stops and every entry it already added is removed. Nothing from the file stays."
        confirmLabel="Cancel import and remove entries"
        cancelLabel="Keep importing"
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
        onConfirm={() => cancel.mutate(record.id, { onSuccess: () => setConfirming(false) })}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
