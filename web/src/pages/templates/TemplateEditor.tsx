import { useState } from "react";
import {
  errorMessage,
  useCategories,
  useIncomeSources,
  useTemplate,
  useTemplateItemMutations,
} from "../../api";
import { PlusIcon } from "lucide-react";
import { LoadError } from "../../components/LoadError";
import { StatTile } from "../../components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { EXPENSE_GRID, ExpenseItemRow, INCOME_GRID, IncomeItemRow, ROW } from "./ItemRows";
import { groupByCategory, templateTotals } from "./totals";

type NewDraft = { kind: "income" } | { kind: "expense"; categoryId: string };
type Draft = NewDraft & { key: number };

/** One template's items: totals, the income items, then expense items by category. */
export function TemplateEditor({ templateId }: { templateId: string }) {
  const template = useTemplate(templateId);
  const categories = useCategories();
  const sources = useIncomeSources();
  const mutations = useTemplateItemMutations(templateId);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const failed = [template, categories, sources].find((q) => q.isError);
  if (failed) {
    return <LoadError message={`Couldn’t load this template. ${errorMessage(failed.error)}`} onRetry={() => void failed.refetch()} />;
  }
  if (!template.data || !categories.data || !sources.data) {
    return <p className="m-0 text-muted-foreground">Loading template…</p>;
  }

  const tpl = template.data;
  const totals = templateTotals(tpl, categories.data);
  const groups = groupByCategory(tpl.expense_items, categories.data);
  const incomeItems = [...tpl.income_items].sort((a, b) => a.sort_order - b.sort_order);

  function addDraft(draft: NewDraft) {
    setDrafts((ds) => [...ds, { ...draft, key: nextKey }]);
    setNextKey((k) => k + 1);
  }
  const doneWith = (key: number) => (again: boolean) => {
    if (!again) setDrafts((ds) => ds.filter((d) => d.key !== key));
  };

  const addButton = "h-11 px-1 font-semibold";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4" role="group" aria-label="Template totals">
        <StatTile label="Net income" value={formatCents(totals.netCents)} tone="income" />
        <StatTile
          label="Planned spending"
          value={formatCents(totals.spentCents)}
          sub={totals.savingCents > 0 ? `Includes ${formatCents(totals.savingCents)} saved & invested` : undefined}
        />
        <StatTile label="Left over" value={formatCents(totals.leftOverCents)} />
      </div>

      {/* Wide rows scroll inside the card, never the page. */}
      <div data-slot="card" className="overflow-x-auto rounded-xl border border-border bg-card text-card-foreground">
        <div className={GROUP} role="group" aria-labelledby="tpl-income-h">
          <div className={GROUP_HEAD}>
            <h3 id="tpl-income-h" className="m-0 text-sm font-bold text-income">
              Income
            </h3>
            <span className="inline-flex items-center gap-3">
              <span className="text-sm font-bold tabular-nums">{formatCents(totals.netCents)} net</span>
              <Button variant="link" className={addButton} onClick={() => addDraft({ kind: "income" })}>
                <PlusIcon aria-hidden="true" />
                Add income
              </Button>
            </span>
          </div>
          <div className={cn(ROW, INCOME_GRID, COLHEAD)} aria-hidden="true">
            <span>Source</span>
            <span>Label</span>
            <span className="text-right">Day</span>
            <span className="text-right">Gross</span>
            <span className="text-right">Taxable</span>
            <span className="text-right">Net</span>
            <span />
          </div>
          {incomeItems.map((item) => (
            <IncomeItemRow key={item.id} item={item} sources={sources.data} mutations={mutations} />
          ))}
          {drafts
            .filter((d) => d.kind === "income")
            .map((d) => (
              <IncomeItemRow
                key={`draft-${d.key}`}
                sources={sources.data}
                mutations={mutations}
                onDraftDone={doneWith(d.key)}
                autoFocus
              />
            ))}
          {incomeItems.length === 0 && !drafts.some((d) => d.kind === "income") && (
            <p className={GROUP_NOTE}>No income yet. Add each paycheck you expect in a month.</p>
          )}
          {incomeItems.length > 0 && (
            <p className={cn(GROUP_NOTE, "tabular-nums")}>
              All sources: gross {formatCents(totals.grossCents)} · taxable {formatCents(totals.grossTaxableCents)} ·
              net {formatCents(totals.netCents)} · tax rate {formatTaxRate(totals.grossTaxableCents, totals.netCents)}
            </p>
          )}
        </div>

        <div className={cn(ROW, EXPENSE_GRID, COLHEAD, "[border-top:1px_solid_var(--border)] pt-3.5")} aria-hidden="true">
          <span>Expense item</span>
          <span>Note</span>
          <span>Category</span>
          <span className="text-right">Day</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {groups.map(({ category, items, subtotalCents }, index) => {
          const groupDrafts = drafts.filter(
            (d): d is Draft & { kind: "expense" } => d.kind === "expense" && d.categoryId === category.id,
          );
          const headingId = `tpl-cat-${category.id}`;
          return (
            <div
              key={category.id}
              data-saving={category.is_saving || undefined}
              className={cn(
                GROUP,
                index > 0 && "[border-top:1px_solid_var(--border)]",
                category.is_saving && "bg-[color-mix(in_srgb,var(--saving-bar)_6%,var(--card))]",
              )}
              role="group"
              aria-labelledby={headingId}
            >
              <div className={GROUP_HEAD}>
                <span className="inline-flex items-center gap-3">
                  <h3 id={headingId} className={cn("m-0 text-sm font-bold", category.is_saving && "text-saving")}>
                    {category.name}
                  </h3>
                  {category.is_saving && <Badge variant="saving">Counted as savings</Badge>}
                </span>
                <span className="inline-flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums">{formatCents(subtotalCents)}</span>
                  <Button
                    variant="link"
                    className={addButton}
                    aria-label={`Add item to ${category.name}`}
                    onClick={() => addDraft({ kind: "expense", categoryId: category.id })}
                  >
                    <PlusIcon aria-hidden="true" />
                    Add item
                  </Button>
                </span>
              </div>
              {items.map((item) => (
                <ExpenseItemRow
                  key={item.id}
                  item={item}
                  categoryId={category.id}
                  categories={categories.data}
                  mutations={mutations}
                />
              ))}
              {groupDrafts.map((d) => (
                <ExpenseItemRow
                  key={`draft-${d.key}`}
                  categoryId={category.id}
                  categories={categories.data}
                  mutations={mutations}
                  onDraftDone={doneWith(d.key)}
                  autoFocus
                />
              ))}
              {items.length === 0 && groupDrafts.length === 0 && (
                <p className={GROUP_NOTE}>No items. Anything you add here gets copied every month.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A group of rows (Income, or one category), wide enough for its rows. */
const GROUP = "min-w-[820px] pb-2";
const GROUP_HEAD = "flex flex-wrap items-center justify-between gap-2 px-5 pt-3 pb-1";
const GROUP_NOTE = "m-0 px-5 pt-1 pb-2 text-[13px] text-muted-foreground";
/** The column headings above the rows (hidden from assistive tech: every field is labelled). */
const COLHEAD = "pt-1.5 pb-0.5 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase [&>span]:px-2";
