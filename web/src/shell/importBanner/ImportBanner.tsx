import { Check, TriangleAlert, Upload, X } from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { IMPORT_PATH } from "../navigation";
import { useImportBanner } from "./useImportBanner";

function timeLeft(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return "less than a minute left";
  return `about ${Math.round(seconds / 60)} min left`;
}

const entries = (n: number) => `${n.toLocaleString()} ${n === 1 ? "entry" : "entries"}`;

/** One row: icon, text, then the actions; the Alert's grid becomes a wrapping flex row. */
const row = "mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-2 overflow-hidden py-2 pr-2 pl-5 text-sm [&>svg]:size-5 [&>svg]:translate-y-0";
const action = "text-inherit hover:bg-black/5 dark:hover:bg-white/10";

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
      <Alert variant="info" className={`${row} pb-3`} aria-label="Import progress">
        <Upload aria-hidden="true" />
        <AlertDescription className="block min-w-0 flex-1">
          <strong className="font-semibold">Importing {state.name}</strong> · {percent}%
          {p ? ` · ${p.rows_done.toLocaleString()} of ${entries(p.rows_total)}` : ""}
          {left ? ` · ${left}` : ""}
        </AlertDescription>
        <Button asChild variant="ghost" className={action}>
          <Link to={IMPORT_PATH}>View progress</Link>
        </Button>
        <Progress
          className="absolute inset-x-0 bottom-0 h-1 rounded-none bg-info-alert-border"
          aria-label="Import progress"
          value={percent}
          getValueLabel={(value) => (p ? `${value}%, ${p.rows_done.toLocaleString()} of ${entries(p.rows_total)}` : `${value}%`)}
        />
      </Alert>
    );
  }

  const finished = state.kind === "finished";
  return (
    <Alert variant={finished ? "success" : "destructive"} className={row} aria-label="Import result">
      {finished ? <Check aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
      <AlertDescription className="block min-w-0 flex-1">
        {finished ? (
          <>
            <strong className="font-semibold">Import finished</strong> · {entries(state.record.entries_imported)} added
            from {state.record.file_name}
          </>
        ) : (
          <>
            <strong className="font-semibold">Import stopped</strong> · {state.record.file_name}. Nothing was saved.
          </>
        )}
      </AlertDescription>
      <Button asChild variant="ghost" className={action}>
        <Link to={IMPORT_PATH}>{finished ? "View details" : "Try again"}</Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss" className={action} onClick={dismiss}>
        <X />
      </Button>
    </Alert>
  );
}
