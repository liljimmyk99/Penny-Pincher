import { useState } from "react";
import { errorMessage, useImport, useImports } from "../../api";
import { AlertIcon } from "../../components/icons";
import { Page } from "../Page";
import { FinishedStage } from "./FinishedStage";
import { ImportHistory } from "./ImportHistory";
import { ImportingStage } from "./ImportingStage";
import { ReviewStage } from "./ReviewStage";
import { StepIndicator } from "./StepIndicator";
import { UploadStage } from "./UploadStage";
import "./ImportPage.css";

/**
 * Import past years from Excel (root §6.14). The stage follows the server's
 * import status, so a reload resumes a review or a running import.
 */
export function ImportPage() {
  const imports = useImports();
  // undefined = not decided yet; null = start fresh. The first answer from the
  // server (a running or in-review import) is latched, so the page doesn't jump
  // back to the upload stage when that import finishes.
  const [currentId, setCurrentId] = useState<string | null | undefined>(undefined);
  if (currentId === undefined && imports.data) {
    const open = imports.data.find((i) => i.status === "running") ?? imports.data.find((i) => i.status === "review");
    setCurrentId(open?.id ?? null);
  }

  const current = useImport(currentId ?? null);
  const record = currentId ? current.data : undefined;

  let step = 1;
  let body;
  if (currentId === undefined || (currentId !== null && !record)) {
    body = current.isError ? (
      <p role="alert" className="alert alert--danger">
        <AlertIcon width={18} height={18} />
        {errorMessage(current.error)}
      </p>
    ) : (
      <p className="import-muted" role="status">
        Loading…
      </p>
    );
  } else if (record?.status === "review") {
    step = 2;
    body = (
      <ReviewStage
        record={record}
        onDiscarded={() => setCurrentId(null)}
        onReplaced={(next) => setCurrentId(next.id)}
        onStarted={() => undefined}
      />
    );
  } else if (record?.status === "running") {
    step = 3;
    body = <ImportingStage record={record} />;
  } else if (record && ["completed", "cancelled", "failed"].includes(record.status)) {
    step = 3;
    body = <FinishedStage record={record} onAnother={() => setCurrentId(null)} />;
  } else {
    body = <UploadStage onUploaded={(next) => setCurrentId(next.id)} />;
  }

  const showHistory = step === 1 || (step === 3 && record?.status !== "running");
  return (
    <Page title="Import" eyebrow="Excel">
      <StepIndicator current={step} />
      {body}
      {showHistory && <ImportHistory />}
    </Page>
  );
}
