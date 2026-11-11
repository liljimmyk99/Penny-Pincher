import { useState } from "react";
import { errorMessage, useImportMutations, useImports, type ImportSummary } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";

const LABEL: Record<ImportSummary["status"], string> = {
  review: "In review",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  undone: "Undone",
  expired: "Expired",
};

export function ImportHistory() {
  const imports = useImports();
  const { undo } = useImportMutations();
  const [target, setTarget] = useState<ImportSummary | null>(null);
  const rows = (imports.data ?? []).filter((i) => i.status !== "review");

  return (
    <section className="card import-card" aria-labelledby="import-history-h">
      <h2 id="import-history-h" className="import-card__title">
        Import history
      </h2>
      {imports.isError && (
        <p role="alert" className="alert alert--danger">
          {errorMessage(imports.error)}
        </p>
      )}
      {rows.length === 0 && !imports.isError ? (
        <p className="import-muted">No imports yet.</p>
      ) : (
        <table className="import-table">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Date</th>
              <th scope="col">Entries</th>
              <th scope="col">Years</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <th scope="row">{i.file_name}</th>
                <td>{i.created_at.slice(0, 10)}</td>
                <td>{i.entries_imported}</td>
                <td>{years(i)}</td>
                <td>
                  <span className={`badge import-chip import-chip--${i.status}`}>{LABEL[i.status]}</span>
                </td>
                <td>
                  {i.status === "completed" && (
                    <button type="button" className="text-btn" onClick={() => setTarget(i)}>
                      Undo<span className="visually-hidden"> import {i.file_name}</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <DeleteDialog
        open={target !== null}
        title="Undo this import?"
        body={`This deletes every entry ${target?.file_name ?? "the file"} added, including ones you edited since. Entries you added by hand are not touched.`}
        confirmLabel="Undo import and delete entries"
        pending={undo.isPending}
        error={undo.isError ? errorMessage(undo.error) : null}
        onConfirm={() => target && undo.mutate(target.id, { onSuccess: () => setTarget(null) })}
        onCancel={() => {
          setTarget(null);
          undo.reset();
        }}
      />
    </section>
  );
}

function years(i: ImportSummary): string {
  if (!i.first_month || !i.last_month) return "—";
  const a = i.first_month.slice(0, 4);
  const b = i.last_month.slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}
