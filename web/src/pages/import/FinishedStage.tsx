import { Link } from "react-router";
import { errorMessage, useDownloadImportProblems, type ImportRecord } from "../../api";
import { CircleAlert, CircleCheck, Download } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { ErrorLine, Footer } from "./parts";

export function FinishedStage({ record, onAnother }: { record: ImportRecord; onAnother: () => void }) {
  const problems = useDownloadImportProblems();
  const ok = record.status === "completed";
  const verb = record.status === "cancelled" ? "Import cancelled" : record.status === "failed" ? "Import stopped" : "Import finished";

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {ok ? (
            <CircleCheck aria-hidden="true" className="size-5 text-income" />
          ) : (
            <CircleAlert aria-hidden="true" className="size-5 text-destructive" />
          )}
          {verb}
        </span>
      }
      contentClassName="flex flex-col gap-4"
    >
      {ok ? (
        <p className="m-0">
          {record.entries_imported} {record.entries_imported === 1 ? "entry" : "entries"} imported from {record.file_name}
          {record.rows_with_problems > 0 ? `; ${record.rows_with_problems} rows with problems were skipped.` : "."}
        </p>
      ) : (
        <p className="m-0">
          Nothing from {record.file_name} was saved.
          {record.failure_reason ? ` ${record.failure_reason}` : ""}
        </p>
      )}
      {problems.isError && <ErrorLine>{errorMessage(problems.error)}</ErrorLine>}
      <Footer>
        {ok && (
          <Button asChild>
            <Link to="/yearly">Open Yearly</Link>
          </Button>
        )}
        {record.rows_with_problems > 0 && (
          <Button type="button" variant="outline" onClick={() => problems.mutate(record.id)}>
            <Download aria-hidden="true" />
            Download skipped rows
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onAnother}>
          {ok ? "Import another file" : "Try again"}
        </Button>
      </Footer>
    </SectionCard>
  );
}
