import { useId, useState } from "react";
import { errorMessage, useExportData, type ExportFormat } from "../../api";
import { AlertIcon, DownloadIcon } from "../../components/icons";
import { Toast } from "../../components/Toast";
import { Page } from "../Page";

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)", hint: "One workbook with an Expenses sheet and an Income sheet." },
  { value: "csv", label: "CSV (.zip)", hint: "A zip holding expenses.csv and income.csv." },
];

/** Export data (root §6.13): pick a format and an optional date range, then download. */
export function ExportPage() {
  const id = useId();
  const exporter = useExportData();
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const badRange = from !== "" && to !== "" && from > to;

  function download() {
    setDone(null);
    exporter.mutate({ format, from, to }, { onSuccess: (name) => setDone(`Downloaded ${name}`) });
  }

  return (
    <Page title="Export data">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!badRange) download();
        }}
      >
        <fieldset>
          <legend className="field-label">Format</legend>
          {FORMATS.map((f) => (
            <label key={f.value} style={{ display: "block", margin: "8px 0" }}>
              <input
                type="radio"
                name={`${id}-format`}
                value={f.value}
                checked={format === f.value}
                onChange={() => setFormat(f.value)}
              />{" "}
              {f.label}
              <span style={{ display: "block", marginLeft: 24, opacity: 0.7 }}>{f.hint}</span>
            </label>
          ))}
        </fieldset>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0" }}>
          <div>
            <label className="field-label" htmlFor={`${id}-from`}>
              From (optional)
            </label>
            <input id={`${id}-from`} className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-to`}>
              To (optional)
            </label>
            <input id={`${id}-to`} className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <p>Leave both dates empty to export everything. Amounts are in integer cents, plus a formatted dollars column.</p>

        {badRange && (
          <p className="alert alert--danger" role="alert">
            <AlertIcon width={18} height={18} />
            “From” must be on or before “To”.
          </p>
        )}
        {exporter.isError && (
          <p className="alert alert--danger" role="alert">
            <AlertIcon width={18} height={18} />
            {errorMessage(exporter.error)}
          </p>
        )}

        <button type="submit" className="btn btn--primary" disabled={exporter.isPending || badRange}>
          <DownloadIcon width={16} height={16} />
          {exporter.isPending ? "Preparing…" : "Download"}
        </button>
      </form>
      <Toast message={done} onDismiss={() => setDone(null)} />
    </Page>
  );
}
