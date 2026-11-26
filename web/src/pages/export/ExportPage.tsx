import { CircleAlert, Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FormField } from "@/components/FormField";
import { Segmented } from "@/components/Segmented";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage, useExportData, type ExportFormat } from "../../api";
import { toast } from "../../lib/toast";
import { Page } from "../Page";

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)", hint: "One workbook with an Expenses sheet and an Income sheet." },
  { value: "csv", label: "CSV (.zip)", hint: "A zip holding expenses.csv and income.csv." },
];

/** Export data (root §6.13): pick a format and an optional date range, then download. */
export function ExportPage() {
  const exporter = useExportData();
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const badRange = from !== "" && to !== "" && from > to;

  function download() {
    exporter.mutate({ format, from, to }, { onSuccess: (name) => toast(`Downloaded ${name}`) });
  }

  const chosen = FORMATS.find((f) => f.value === format) ?? FORMATS[0];

  return (
    <Page title="Export data">
      <Card className="max-w-[640px] px-6">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!badRange) download();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <span aria-hidden="true" className="text-sm font-medium">
              Format
            </span>
            <Segmented
              label="Format"
              value={format}
              options={FORMATS}
              onChange={setFormat}
              className="self-start"
            />
            <p className="m-0 text-[13px] text-muted-foreground">{chosen.hint}</p>
          </div>

          <div className="flex flex-wrap gap-4">
            <FormField label="From (optional)" className="w-auto min-w-[180px] flex-1" invalid={badRange}>
              {(control) => <Input {...control} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
            </FormField>
            <FormField label="To (optional)" className="w-auto min-w-[180px] flex-1" invalid={badRange}>
              {(control) => <Input {...control} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
            </FormField>
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            Leave both dates empty to export everything. Amounts are in integer cents, plus a formatted dollars column.
          </p>

          {badRange && <ErrorAlert>“From” must be on or before “To”.</ErrorAlert>}
          {exporter.isError && <ErrorAlert>{errorMessage(exporter.error)}</ErrorAlert>}

          <Button type="submit" className="self-start" disabled={exporter.isPending || badRange}>
            <Download aria-hidden="true" />
            {exporter.isPending ? "Preparing…" : "Download"}
          </Button>
        </form>
      </Card>
    </Page>
  );
}

function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
