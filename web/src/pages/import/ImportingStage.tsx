import { useState } from "react";
import { Link } from "react-router";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { errorMessage, useImportMutations, useImportProgress, type ImportRecord } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { formatMonth } from "../../lib/dates";
import { timeLeft } from "./hints";
import { Footer } from "./parts";

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

  const valueText = `${percent}%, ${done} of ${total} entries${month ? `, ${month}` : ""}`;

  return (
    <SectionCard title={`Importing ${record.file_name}`} contentClassName="flex flex-col gap-4">
      <p className="m-0 text-5xl leading-none font-bold tracking-[-0.03em] tabular-nums" aria-hidden="true">
        {percent}%
      </p>
      <Progress
        value={percent}
        aria-label="Import progress"
        getValueLabel={() => valueText}
        className="h-3.5"
      />
      <p className="m-0 text-sm text-muted-foreground tabular-nums">
        {done} of {total} entries{month ? ` · ${month}` : ""} · {left}
      </p>

      {p && p.years.length > 0 && (
        <ul aria-label="Progress by year" className="m-0 flex list-none flex-col gap-2.5 p-0">
          {p.years.map((y) => (
            <li key={y.year} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 text-sm tabular-nums">
              <span className="font-semibold">{y.year}</span>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full bg-primary", y.rows_done >= y.rows_total && "bg-income")}
                  style={{ width: `${y.rows_total > 0 ? Math.min(100, (y.rows_done / y.rows_total) * 100) : 0}%` }}
                />
              </span>
              <span className="text-muted-foreground">
                {y.rows_done} / {y.rows_total}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 text-sm text-muted-foreground">You can leave this page. Months fill in as the import runs.</p>
      <Footer>
        <Button asChild variant="outline">
          <Link to="/summary">Go to Summary while it runs</Link>
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
          Cancel import
        </Button>
      </Footer>

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
    </SectionCard>
  );
}
