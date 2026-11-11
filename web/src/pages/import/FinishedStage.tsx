import { Link } from "react-router";
import { errorMessage, useDownloadImportProblems, type ImportRecord } from "../../api";
import { AlertIcon, CheckIcon, DownloadIcon } from "../../components/icons";

export function FinishedStage({ record, onAnother }: { record: ImportRecord; onAnother: () => void }) {
  const problems = useDownloadImportProblems();
  const ok = record.status === "completed";
  const verb = record.status === "cancelled" ? "Import cancelled" : record.status === "failed" ? "Import stopped" : "Import finished";

  return (
    <section className="card import-card" aria-labelledby="import-done-h">
      <h2 id="import-done-h" className="import-card__title">
        {ok ? <CheckIcon width={20} height={20} /> : <AlertIcon width={20} height={20} />} {verb}
      </h2>
      {ok ? (
        <p>
          {record.entries_imported} {record.entries_imported === 1 ? "entry" : "entries"} imported from {record.file_name}
          {record.rows_with_problems > 0 ? `; ${record.rows_with_problems} rows with problems were skipped.` : "."}
        </p>
      ) : (
        <p>
          Nothing from {record.file_name} was saved.
          {record.failure_reason ? ` ${record.failure_reason}` : ""}
        </p>
      )}
      {problems.isError && (
        <p role="alert" className="alert alert--danger">
          <AlertIcon width={18} height={18} />
          {errorMessage(problems.error)}
        </p>
      )}
      <div className="import-footer">
        {ok && (
          <Link to="/yearly" className="btn btn--primary">
            Open Yearly
          </Link>
        )}
        {record.rows_with_problems > 0 && (
          <button type="button" className="btn btn--ghost" onClick={() => problems.mutate(record.id)}>
            <DownloadIcon width={16} height={16} />
            Download skipped rows
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onAnother}>
          {ok ? "Import another file" : "Try again"}
        </button>
      </div>
    </section>
  );
}
