import { useRef, useState, type DragEvent } from "react";
import { errorMessage, useDownloadImportTemplate, useImportMutations, type ImportRecord } from "../../api";
import { uploadErrorText } from "./hints";
import { AlertIcon, DownloadIcon, UploadIcon } from "../../components/icons";

export function UploadStage({ onUploaded }: { onUploaded: (record: ImportRecord) => void }) {
  const template = useDownloadImportTemplate();
  const { upload } = useImportMutations();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function send(file: File | undefined) {
    if (file) upload.mutate(file, { onSuccess: onUploaded });
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    send(e.dataTransfer.files[0]);
  }

  return (
    <div className="import-grid">
      <section className="card import-card" aria-labelledby="import-template-h">
        <h2 id="import-template-h" className="import-card__title">
          1. Get the template
        </h2>
        <div className="import-preview" aria-hidden="true">
          <span className="import-preview__tab">Expenses</span>
          <span className="import-preview__tab">Income</span>
          <p>Date · Category · Merchant · Amount · Note</p>
          <p>Date · Source · Gross · Gross taxable · Net · Note</p>
        </div>
        <ul className="import-rules">
          <li>The Category and Source dropdowns hold your current categories and income sources.</li>
          <li>One file can hold any number of years.</li>
          <li>Refunds are negative amounts. Amounts are in dollars.</li>
        </ul>
        {template.isError && (
          <p role="alert" className="alert alert--danger">
            <AlertIcon width={18} height={18} />
            {errorMessage(template.error)}
          </p>
        )}
        <button type="button" className="btn btn--ghost" disabled={template.isPending} onClick={() => template.mutate()}>
          <DownloadIcon width={16} height={16} />
          Download template
        </button>
      </section>

      <section className="card import-card" aria-labelledby="import-upload-h">
        <h2 id="import-upload-h" className="import-card__title">
          2. Upload your file
        </h2>
        <div
          className={`import-drop${over ? " import-drop--over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <UploadIcon width={28} height={28} />
          <p>{upload.isPending ? "Checking your file…" : "Drop your .xlsx file here"}</p>
          <p className="import-muted">Up to 10 MB. Nothing is saved until you review it.</p>
          <input
            ref={input}
            type="file"
            className="visually-hidden"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Import file"
            tabIndex={-1}
            onChange={(e) => {
              send(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn--primary" disabled={upload.isPending} onClick={() => input.current?.click()}>
            Choose file
          </button>
        </div>
        {upload.isError && (
          <p role="alert" className="alert alert--danger">
            <AlertIcon width={18} height={18} />
            {uploadErrorText(upload.error)}
          </p>
        )}
      </section>
    </div>
  );
}
