import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, useTemplates, type Schemas } from "../../api";
import { LoadError } from "@/components/LoadError";
import { StatusLine } from "@/components/StatusLine";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { monthName } from "../../lib/dates";
import { defaultTemplate, plural } from "./preview";
import { useApplyTemplate } from "./useApplyTemplate";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

/**
 * "Apply a template…" for a month that may already have data: pick a
 * template, then copy. A month with entries goes through the full-reset
 * confirmation in `useApplyTemplate`.
 */
export function ApplyTemplateDialog({
  month,
  open,
  onClose,
  onApplied,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  onApplied: (result: Schemas["TemplateApplyResult"]) => void;
}) {
  const templates = useTemplates();
  const list = templates.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = list.find((t) => t.id === picked) ?? defaultTemplate(list);
  const flow = useApplyTemplate(month, onApplied);
  const name = monthName(month);
  const items = (t: Schemas["TemplateSummary"]) => t.expense_item_count + t.income_item_count;

  return (
    <>
      <Dialog open={open && !flow.confirmingReset} onOpenChange={(next) => !next && !flow.pending && onClose()}>
        <DialogContent className="w-[min(560px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>Apply a template to {name}</DialogTitle>
            <DialogDescription>
              Every item is copied into {name} on its day of the month, unconfirmed until you check it.
            </DialogDescription>
          </DialogHeader>
          {templates.isPending && <StatusLine>Loading your templates…</StatusLine>}
          {templates.isError && <LoadError message={`Couldn’t load your templates. ${errorMessage(templates.error)}`} />}
          {templates.isSuccess && list.length === 0 && (
            <StatusLine>
              You have no templates yet.{" "}
              <Link to="/templates" className="text-link hover:text-link-hover">
                Build a template month
              </Link>{" "}
              first.
            </StatusLine>
          )}
          {list.length > 0 && (
            <ToggleGroup
              type="single"
              orientation="vertical"
              aria-label="Template"
              value={chosen?.id ?? ""}
              onValueChange={(v) => v && setPicked(v)}
              spacing={2}
              className="w-full flex-col items-stretch"
            >
              {list.map((t) => (
                <ToggleGroupItem
                  key={t.id}
                  value={t.id}
                  variant="outline"
                  className="h-auto min-h-11 w-full justify-between gap-3 rounded-md px-3.5 py-2 text-left data-[state=on]:border-ring data-[state=on]:bg-selected data-[state=on]:text-selected-foreground"
                >
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-[13px] font-normal text-muted-foreground">{plural(items(t), "item", "items")}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {flow.error && <LoadError message={flow.error} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={flow.pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!chosen || items(chosen) === 0 || flow.pending}
              onClick={() => chosen && void flow.apply(chosen)}
            >
              {flow.pending ? "Copying…" : `Copy into ${name}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {flow.dialog}
    </>
  );
}
