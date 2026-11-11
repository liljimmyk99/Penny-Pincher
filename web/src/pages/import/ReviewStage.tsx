import { useState } from "react";
import { errorMessage, useDownloadImportProblems, useImportMutations, type ImportRecord } from "../../api";
import { AlertIcon, DownloadIcon } from "../../components/icons";
import { formatCents } from "../../lib/money";
import { formatMonth } from "../../lib/dates";
import { ISSUE_TEXT, MAX_SHOWN, uploadErrorText } from "./hints";
import { useRef } from "react";

export function ReviewStage({
  record,
  onDiscarded,
  onReplaced,
  onStarted,
}: {
  record: ImportRecord;
  onDiscarded: () => void;
  onReplaced: (next: ImportRecord) => void;
  onStarted: () => void;
}) {
  const { upload, start, discard } = useImportMutations();
  const problems = useDownloadImportProblems();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const found = record.rows_ready + record.rows_with_problems;
  const range =
    record.first_month && record.last_month
      ? record.first_month === record.last_month
        ? formatMonth(record.first_month)
        : `${formatMonth(record.first_month)} – ${formatMonth(record.last_month)}`
      : "—";

  const groups = new Map<string, ImportRecord["issues"]>();
  for (const issue of record.issues) groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);

  function replace(file: File | undefined) {
    if (!file) return;
    setError(null);
    upload.mutate(file, {
      onSuccess: (next) => {
        // The old review is superseded; drop it so it doesn't linger in the history.
        discard.mutate(record.id);
        onReplaced(next);
      },
      onError: (err) => setError(uploadErrorText(err)),
    });
  }

  return (
    <div className="import-review">
      <div className="import-filebar">
        <strong>{record.file_name}</strong>
        <button
          type="button"
          className="text-btn"
          disabled={discard.isPending}
          onClick={() => discard.mutate(record.id, { onSuccess: onDiscarded, onError: (e) => setError(errorMessage(e)) })}
        >
          Choose a different file
        </button>
      </div>

      <div className="tiles">
        <Tile label="Entries found" value={String(found)} />
        <Tile label="Date range" value={range} />
        <Tile label="Ready to import" value={String(record.rows_ready)} />
        <Tile label="Need fixing" value={String(record.rows_with_problems)} warn={record.rows_with_problems > 0} />
      </div>

      {record.months_with_existing_entries.length > 0 && (
        <div className="import-warning" role="note">
          <AlertIcon width={18} height={18} />
          <div>
            <strong>Some months already have entries.</strong> Imported entries are added alongside them, not replaced:{" "}
            {record.months_with_existing_entries
              .map((m) => `${formatMonth(m.month)} (${m.existing_entries} existing)`)
              .join(", ")}
            .
          </div>
        </div>
      )}

      <section className="card import-card" aria-labelledby="import-years-h">
        <h2 id="import-years-h" className="import-card__title">
          By year
        </h2>
        <table className="import-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Months</th>
              <th scope="col">Expenses</th>
              <th scope="col">Income</th>
              <th scope="col">Spent</th>
              <th scope="col">Problems</th>
            </tr>
          </thead>
          <tbody>
            {record.years.map((y) => (
              <tr key={y.year}>
                <th scope="row">{y.year}</th>
                <td>{y.months}</td>
                <td>{y.expense_rows}</td>
                <td>{y.income_rows}</td>
                <td>{formatCents(y.spent_cents)}</td>
                <td>{y.rows_with_problems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {groups.size > 0 && (
        <section className="card import-card" aria-labelledby="import-problems-h">
          <h2 id="import-problems-h" className="import-card__title">
            Problems
          </h2>
          {[...groups].map(([code, issues]) => {
            const text = ISSUE_TEXT[code as keyof typeof ISSUE_TEXT];
            return (
              <div key={code} className="import-problem">
                <h3>
                  {text?.title ?? code} <span className="badge">{issues.length}</span>
                </h3>
                {text && <p className="import-muted">{text.hint}</p>}
                <ul>
                  {issues.slice(0, MAX_SHOWN).map((i) => (
                    <li key={`${i.sheet}-${i.row}-${i.column}`}>
                      {i.sheet === "expenses" ? "Expenses" : "Income"} · row {i.row} · {i.column}
                      {i.value ? `: “${i.value}”` : ""}
                    </li>
                  ))}
                </ul>
                {issues.length > MAX_SHOWN && <p className="import-muted">+ {issues.length - MAX_SHOWN} more</p>}
              </div>
            );
          })}
          {record.issues_truncated && (
            <p className="import-muted">Only the first {record.issues.length} problems are listed. Download the file for all of them.</p>
          )}
          <button type="button" className="btn btn--ghost" disabled={problems.isPending} onClick={() => problems.mutate(record.id)}>
            <DownloadIcon width={16} height={16} />
            Download file with problems marked
          </button>
        </section>
      )}

      {(error || problems.isError || start.isError) && (
        <p role="alert" className="alert alert--danger">
          <AlertIcon width={18} height={18} />
          {error ?? errorMessage(problems.error ?? start.error)}
        </p>
      )}

      <div className="import-footer">
        <span className="import-muted">Nothing is saved yet.</span>
        <input
          ref={input}
          type="file"
          className="visually-hidden"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Fixed import file"
          tabIndex={-1}
          onChange={(e) => {
            replace(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn--ghost" disabled={upload.isPending} onClick={() => input.current?.click()}>
          Upload fixed file
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={record.rows_ready === 0 || start.isPending}
          onClick={() => {
            setError(null);
            start.mutate(record.id, { onSuccess: onStarted });
          }}
        >
          Import {record.rows_ready} {record.rows_ready === 1 ? "entry" : "entries"}
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className={`tile__value${warn ? " import-tile--warn" : ""}`}>{value}</span>
    </div>
  );
}
