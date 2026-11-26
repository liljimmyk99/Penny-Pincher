import { useState } from "react";
import { errorMessage, useImportMutations, useImports, type ImportSummary } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { LoadError } from "@/components/LoadError";
import { SectionCard } from "@/components/SectionCard";
import { StatusLine } from "@/components/StatusLine";
import { edgeColumns } from "@/components/tableStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const LABEL: Record<ImportSummary["status"], string> = {
  review: "In review",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  undone: "Undone",
  expired: "Expired",
};

const CHIP = {
  review: "selected",
  running: "selected",
  completed: "income",
  cancelled: "secondary",
  failed: "destructive",
  undone: "secondary",
  expired: "secondary",
} as const satisfies Record<ImportSummary["status"], string>;

export function ImportHistory() {
  const imports = useImports();
  const { undo } = useImportMutations();
  const [target, setTarget] = useState<ImportSummary | null>(null);
  const rows = (imports.data ?? []).filter((i) => i.status !== "review");

  return (
    <SectionCard title="Import history" flush>
      {imports.isError && (
        <div className="px-5">
          <LoadError message={errorMessage(imports.error)} onRetry={() => void imports.refetch()} />
        </div>
      )}
      {rows.length === 0 && !imports.isError ? (
        <StatusLine inset>No imports yet.</StatusLine>
      ) : (
        <Table aria-label="Import history" className={cn("min-w-[620px]", edgeColumns)}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">File</TableHead>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col" numeric>Entries</TableHead>
              <TableHead scope="col">Years</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableHead scope="row" className="font-semibold text-foreground">
                  {i.file_name}
                </TableHead>
                <TableCell className="tabular-nums">{i.created_at.slice(0, 10)}</TableCell>
                <TableCell numeric>{i.entries_imported}</TableCell>
                <TableCell className="tabular-nums">{years(i)}</TableCell>
                <TableCell>
                  <Badge variant={CHIP[i.status]}>{LABEL[i.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {i.status === "completed" && (
                    <Button type="button" variant="link" className="h-auto min-h-10 px-1" onClick={() => setTarget(i)}>
                      Undo<span className="sr-only"> import {i.file_name}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </SectionCard>
  );
}

function years(i: ImportSummary): string {
  if (!i.first_month || !i.last_month) return "—";
  const a = i.first_month.slice(0, 4);
  const b = i.last_month.slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}
