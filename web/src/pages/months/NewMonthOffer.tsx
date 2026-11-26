import { Copy, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { FormField } from "@/components/FormField";
import { LoadError } from "@/components/LoadError";
import { SectionCard } from "@/components/SectionCard";
import { StatTile, TileRow } from "@/components/StatTile";
import { StatusLine } from "@/components/StatusLine";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  useCategories,
  useIncomeSources,
  useMonthExpenses,
  useMonthIncome,
  useTemplate,
  useTemplates,
  type Schemas,
} from "../../api";
import { monthName, shiftMonth } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { defaultTemplate, plural, templatePreview } from "./preview";
import { useApplyTemplate } from "./useApplyTemplate";

/**
 * The new-month empty state (web/AGENTS.md "Empty states → New month"):
 * "Start <Month> from your template?" with a preview of its paychecks and
 * bills, last month's figures for reference, and Copy / Start blank / Edit
 * template. Shown only for a month with no entries.
 */
export function NewMonthOffer({
  month,
  onStartBlank,
  onApplied,
}: {
  month: string;
  onStartBlank: () => void;
  onApplied: (result: Schemas["TemplateApplyResult"]) => void;
}) {
  const templates = useTemplates();
  const [picked, setPicked] = useState<string | null>(null);
  const list = templates.data ?? [];
  const chosen = list.find((t) => t.id === picked) ?? defaultTemplate(list);
  const flow = useApplyTemplate(month, onApplied);
  const name = monthName(month);

  let body;
  if (templates.isPending) body = <StatusLine>Loading your templates…</StatusLine>;
  else if (templates.isError)
    body = (
      <LoadError
        message={`Couldn’t load your templates. ${errorMessage(templates.error)}`}
        onRetry={() => void templates.refetch()}
      />
    );
  else if (!chosen)
    body = (
      <StatusLine>
        You have no templates yet.{" "}
        <Link to="/templates" className="text-link hover:text-link-hover">
          Build a template month
        </Link>{" "}
        to start months from it.
      </StatusLine>
    );
  else body = <Preview month={month} templateId={chosen.id} />;

  const empty = chosen !== null && chosen.expense_item_count + chosen.income_item_count === 0;

  return (
    <SectionCard
      eyebrow="New month"
      title={`Start ${name} from your template?`}
      description={`Every item is copied into ${name} on its day of the month, marked unconfirmed until you check it. You can undo right after.`}
      contentClassName="flex flex-col gap-5"
    >
      {list.length > 1 && (
        <FormField label="Template" className="max-w-[320px]">
          {(control) => (
            <Select value={chosen?.id ?? ""} onValueChange={setPicked}>
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {list.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
      {body}
      {flow.error && <LoadError message={flow.error} />}
      <div className="flex flex-wrap gap-2.5">
        {chosen && (
          <Button type="button" disabled={flow.pending || empty} onClick={() => void flow.apply(chosen)}>
            <Copy aria-hidden="true" />
            {flow.pending ? "Copying…" : `Copy into ${name}`}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onStartBlank} disabled={flow.pending}>
          Start blank
        </Button>
        {chosen && (
          <Button asChild variant="ghost">
            <Link to={`/templates?template=${chosen.id}`}>
              <Pencil aria-hidden="true" />
              Edit template
            </Link>
          </Button>
        )}
      </div>
      {flow.dialog}
    </SectionCard>
  );
}

function Preview({ month, templateId }: { month: string; templateId: string }) {
  const template = useTemplate(templateId);
  const categories = useCategories();
  const sources = useIncomeSources();

  const failed = [template, categories, sources].find((q) => q.isError);
  if (failed) return <PreviewError error={failed.error} retry={() => void failed.refetch()} />;
  if (!template.data || !categories.data || !sources.data) return <StatusLine>Loading the preview…</StatusLine>;
  if (template.data.income_items.length === 0 && template.data.expense_items.length === 0)
    return (
      <StatusLine>
        “{template.data.name}” has no items yet. Add the paychecks and bills you expect, then copy it.
      </StatusLine>
    );
  // Last month is only loaded for a template with items, so an empty one doesn't fill that month's cache.
  return <PreviewWithLastMonth month={month} template={template.data} categories={categories.data} sources={sources.data} />;
}

function PreviewError({ error, retry }: { error: unknown; retry: () => void }) {
  return <LoadError message={`Couldn’t load the template preview. ${errorMessage(error)}`} onRetry={retry} />;
}

function PreviewWithLastMonth({
  month,
  template,
  categories,
  sources,
}: {
  month: string;
  template: Schemas["Template"];
  categories: Schemas["Category"][];
  sources: Schemas["IncomeSource"][];
}) {
  const previousMonth = shiftMonth(month, -1);
  const prevExpenses = useMonthExpenses(previousMonth);
  const prevIncome = useMonthIncome(previousMonth);

  const failed = [prevExpenses, prevIncome].find((q) => q.isError);
  if (failed) return <PreviewError error={failed.error} retry={() => void failed.refetch()} />;
  if (!prevExpenses.data || !prevIncome.data) return <StatusLine>Loading the preview…</StatusLine>;

  const p = templatePreview(template, categories, sources, prevExpenses.data, prevIncome.data);
  const last = monthName(previousMonth);
  const prev = (cents: number | null) => (cents === null ? "—" : formatCents(cents));
  return (
    <div className="flex flex-col gap-5">
      <TileRow label={`${template.name} totals`}>
        <StatTile label="Planned net income" value={formatCents(p.totals.netCents)} tone="income" sub={`${last}: ${formatCents(p.previous.netCents)}`} />
        <StatTile label="Planned spending" value={formatCents(p.totals.spentCents)} sub={`${last}: ${formatCents(p.previous.spentCents)}`} />
        <StatTile label="Left over" value={formatCents(p.totals.leftOverCents)} sub={`${last}: ${formatCents(p.previous.leftOverCents)}`} />
      </TileRow>

      <div className="grid gap-5 lg:grid-cols-2">
        <PreviewTable
          caption={`Paychecks · ${plural(p.paychecks.length, "item", "items")}`}
          last={last}
          rows={p.paychecks.map((i) => ({
            id: i.id,
            day: i.day,
            name: i.sourceName,
            detail: i.label,
            cents: i.netCents,
            previous: prev(i.previousCents),
          }))}
          totalCents={p.totals.netCents}
          income
        />
        <PreviewTable
          caption={`Bills · ${plural(p.bills.length, "item", "items")}`}
          last={last}
          rows={p.bills.map((i) => ({
            id: i.id,
            day: i.day,
            name: i.merchant,
            detail: i.categoryName,
            saving: i.isSaving,
            cents: i.amountCents,
            previous: prev(i.previousCents),
          }))}
          totalCents={p.totals.spentCents}
        />
      </div>
    </div>
  );
}

interface Row {
  id: string;
  day: number;
  name: string;
  detail: string | null;
  saving?: boolean;
  cents: number;
  previous: string;
}

function PreviewTable({
  caption,
  last,
  rows,
  totalCents,
  income,
}: {
  caption: string;
  last: string;
  rows: Row[];
  totalCents: number;
  income?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0 rounded-xl border border-solid border-border">
      <Table className="min-w-[360px]">
        <TableCaption className="mt-0 caption-top px-3 pt-3 pb-1 text-left text-sm font-semibold text-foreground">
          {caption}
        </TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-12 pl-3">Day</TableHead>
            <TableHead scope="col">Item</TableHead>
            <TableHead scope="col" numeric>
              {income ? "Net" : "Amount"}
            </TableHead>
            <TableHead scope="col" numeric className="pr-3">
              {last}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-3 text-muted-foreground tabular-nums">{r.day}</TableCell>
              <TableCell className="whitespace-normal">
                <span className="font-semibold">{r.name}</span>
                {r.detail && (
                  <span className={cn("ml-2 text-[13px] text-muted-foreground", r.saving && "font-semibold text-saving")}>
                    {r.detail}
                  </span>
                )}
              </TableCell>
              <TableCell numeric className={cn("font-semibold", income && "text-income")}>
                {formatCents(r.cents)}
              </TableCell>
              <TableCell numeric className="pr-3 text-muted-foreground">
                {r.previous}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" colSpan={2} className="pl-3 text-foreground">
              Total
            </TableHead>
            <TableCell numeric className={cn("font-bold", income && "text-income")}>
              {formatCents(totalCents)}
            </TableCell>
            <TableCell className="pr-3" />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
