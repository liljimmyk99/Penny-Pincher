import { Download, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage, useDownloadImportTemplate, useImportMutations, type ImportRecord } from "../../api";
import { uploadErrorText, XLSX_ACCEPT } from "./hints";
import { ErrorLine } from "./parts";

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
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="1. Get the template" contentClassName="flex flex-col gap-4">
        <div aria-hidden="true" className="overflow-hidden rounded-xl border border-solid border-border bg-card">
          <div className="flex gap-0.5 border-x-0 border-t-0 border-b border-solid border-border bg-muted/50 px-1.5 pt-1.5">
            <span className="-mb-px rounded-t-lg border border-b-0 border-solid border-border bg-card px-4 py-2.5 text-[13px] font-semibold">
              Expenses
            </span>
            <span className="px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">Income</span>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3 text-[13px] text-muted-foreground">
            <p className="m-0">Date · Category · Merchant · Amount · Note</p>
            <p className="m-0">Date · Source · Gross · Gross taxable · Net · Note</p>
          </div>
        </div>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-sm">
          <li>The Category and Source dropdowns hold your current categories and income sources.</li>
          <li>One file can hold any number of years.</li>
          <li>Refunds are negative amounts. Amounts are in dollars.</li>
        </ul>
        {template.isError && <ErrorLine>{errorMessage(template.error)}</ErrorLine>}
        <Button type="button" variant="outline" className="self-start" disabled={template.isPending} onClick={() => template.mutate()}>
          <Download aria-hidden="true" />
          Download template
        </Button>
      </SectionCard>

      <SectionCard title="2. Upload your file" contentClassName="flex flex-col gap-4">
        <div
          data-over={over || undefined}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-input bg-muted/40 px-6 py-9 text-center transition-colors",
            over && "border-primary bg-selected",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-xl bg-selected text-saving">
            <Upload className="size-[26px]" />
          </span>
          <p className="m-0 font-semibold">{upload.isPending ? "Checking your file…" : "Drop your .xlsx file here"}</p>
          <p className="m-0 text-[13px] text-muted-foreground">Up to 10 MB. Nothing is saved until you review it.</p>
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept={XLSX_ACCEPT}
            aria-label="Import file"
            tabIndex={-1}
            onChange={(e) => {
              send(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" disabled={upload.isPending} onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </div>
        {upload.isError && <ErrorLine>{uploadErrorText(upload.error)}</ErrorLine>}
      </SectionCard>
    </div>
  );
}
