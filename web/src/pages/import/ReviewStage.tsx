import { Download, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import { StatTile, TileRow } from "@/components/StatTile";
import { edgeColumns } from "@/components/tableStyles";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { errorMessage, useDownloadImportProblems, useImportMutations, type ImportRecord } from "../../api";
import { formatMonth } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { ISSUE_TEXT, MAX_SHOWN, uploadErrorText, XLSX_ACCEPT } from "./hints";
import { ErrorLine, Footer } from "./parts";

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <strong className="font-semibold">{record.file_name}</strong>
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-10 px-1"
          disabled={discard.isPending}
          onClick={() => discard.mutate(record.id, { onSuccess: onDiscarded, onError: (e) => setError(errorMessage(e)) })}
        >
          Choose a different file
        </Button>
      </div>

      <TileRow label="File summary">
        <StatTile label="Entries found" value={String(found)} />
        <StatTile label="Date range" value={range} />
        <StatTile label="Ready to import" value={String(record.rows_ready)} />
        <StatTile
          label="Need fixing"
          value={String(record.rows_with_problems)}
          tone={record.rows_with_problems > 0 ? "worse" : "default"}
        />
      </TileRow>

      {record.months_with_existing_entries.length > 0 && (
        <Alert role="note" className="border-unconfirmed-pill bg-unconfirmed-tint text-foreground">
          <TriangleAlert aria-hidden="true" className="text-unconfirmed-text" />
          <AlertDescription className="text-foreground">
            <p className="m-0">
              <strong className="font-semibold">Some months already have entries.</strong> Imported entries are added
              alongside them, not replaced:{" "}
              {record.months_with_existing_entries
                .map((m) => `${formatMonth(m.month)} (${m.existing_entries} existing)`)
                .join(", ")}
              .
            </p>
          </AlertDescription>
        </Alert>
      )}

      <SectionCard title="By year" flush>
        <Table className={cn("min-w-[520px]", edgeColumns)}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Year</TableHead>
              <TableHead scope="col" numeric>Months</TableHead>
              <TableHead scope="col" numeric>Expenses</TableHead>
              <TableHead scope="col" numeric>Income</TableHead>
              <TableHead scope="col" numeric>Spent</TableHead>
              <TableHead scope="col" numeric>Problems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {record.years.map((y) => (
              <TableRow key={y.year}>
                <TableHead scope="row" className="font-semibold text-foreground">
                  {y.year}
                </TableHead>
                <TableCell numeric>{y.months}</TableCell>
                <TableCell numeric>{y.expense_rows}</TableCell>
                <TableCell numeric>{y.income_rows}</TableCell>
                <TableCell numeric>{formatCents(y.spent_cents)}</TableCell>
                <TableCell numeric className={cn(y.rows_with_problems > 0 && "font-semibold text-worse")}>
                  {y.rows_with_problems}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {groups.size > 0 && (
        <SectionCard title="Problems" contentClassName="flex flex-col gap-4">
          {[...groups].map(([code, issues]) => {
            const text = ISSUE_TEXT[code as keyof typeof ISSUE_TEXT];
            return (
              <div key={code} className="flex flex-col gap-1.5 border-x-0 border-t-0 border-b border-solid border-border pb-4">
                <h3 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
                  {text?.title ?? code} <Badge variant="unconfirmed">{issues.length}</Badge>
                </h3>
                {text && <p className="m-0 text-[13px] text-muted-foreground">{text.hint}</p>}
                <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[13px] tabular-nums">
                  {issues.slice(0, MAX_SHOWN).map((i) => (
                    <li key={`${i.sheet}-${i.row}-${i.column}`}>
                      {i.sheet === "expenses" ? "Expenses" : "Income"} · row {i.row} · {i.column}
                      {i.value ? `: “${i.value}”` : ""}
                    </li>
                  ))}
                </ul>
                {issues.length > MAX_SHOWN && (
                  <p className="m-0 text-[13px] text-muted-foreground">+ {issues.length - MAX_SHOWN} more</p>
                )}
              </div>
            );
          })}
          {record.issues_truncated && (
            <p className="m-0 text-[13px] text-muted-foreground">
              Only the first {record.issues.length} problems are listed. Download the file for all of them.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={problems.isPending}
            onClick={() => problems.mutate(record.id)}
          >
            <Download aria-hidden="true" />
            Download file with problems marked
          </Button>
        </SectionCard>
      )}

      {(error || problems.isError || start.isError) && (
        <ErrorLine>{error ?? errorMessage(problems.error ?? start.error)}</ErrorLine>
      )}

      <Footer>
        <span className="mr-auto text-sm text-muted-foreground">Nothing is saved yet.</span>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={XLSX_ACCEPT}
          aria-label="Fixed import file"
          tabIndex={-1}
          onChange={(e) => {
            replace(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
          Upload fixed file
        </Button>
        <Button
          type="button"
          disabled={record.rows_ready === 0 || start.isPending}
          onClick={() => {
            setError(null);
            start.mutate(record.id, { onSuccess: onStarted });
          }}
        >
          Import {record.rows_ready} {record.rows_ready === 1 ? "entry" : "entries"}
        </Button>
      </Footer>
    </div>
  );
}
