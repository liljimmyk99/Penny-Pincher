import { useState } from "react";
import {
  errorMessage,
  useCategories,
  useIncomeSources,
  useTemplate,
  useTemplateItemMutations,
} from "../../api";
import { AlertIcon, PlusIcon } from "../../components/icons";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { ExpenseItemRow, IncomeItemRow } from "./ItemRows";
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
    return (
      <div role="alert" className="alert alert--danger">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load this template. {errorMessage(failed.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void failed.refetch()}>
            Try again
          </button>
        </span>
      </div>
    );
  }
  if (!template.data || !categories.data || !sources.data) {
    return <p className="tpl-status">Loading template…</p>;
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

  return (
    <div className="tpl-editor">
      <div className="tiles" role="group" aria-label="Template totals">
        <Tile label="Net income" value={formatCents(totals.netCents)} tone="income" />
        <Tile
          label="Planned spending"
          value={formatCents(totals.spentCents)}
          sub={totals.savingCents > 0 ? `Includes ${formatCents(totals.savingCents)} saved & invested` : undefined}
        />
        <Tile label="Left over" value={formatCents(totals.leftOverCents)} />
      </div>

      <div className="card tpl-card">
        <div className="tpl-group" role="group" aria-labelledby="tpl-income-h">
          <div className="tpl-group__head">
            <h3 id="tpl-income-h" className="tpl-group__name tpl-group__name--income">
              Income
            </h3>
            <span className="tpl-group__end">
              <span className="tpl-group__sub">{formatCents(totals.netCents)} net</span>
              <button type="button" className="text-btn" onClick={() => addDraft({ kind: "income" })}>
                <PlusIcon />
                Add income
              </button>
            </span>
          </div>
          <div className="tpl-row tpl-row--income tpl-colhead" aria-hidden="true">
            <span>Source</span>
            <span>Label</span>
            <span className="num">Day</span>
            <span className="num">Gross</span>
            <span className="num">Taxable</span>
            <span className="num">Net</span>
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
            <p className="tpl-group__empty">No income yet. Add each paycheck you expect in a month.</p>
          )}
          {incomeItems.length > 0 && (
            <p className="tpl-group__totals">
              All sources: gross {formatCents(totals.grossCents)} · taxable {formatCents(totals.grossTaxableCents)} ·
              net {formatCents(totals.netCents)} · tax rate {formatTaxRate(totals.grossTaxableCents, totals.netCents)}
            </p>
          )}
        </div>

        <div className="tpl-row tpl-row--expense tpl-colhead tpl-colhead--expense" aria-hidden="true">
          <span>Expense item</span>
          <span>Category</span>
          <span className="num">Day</span>
          <span className="num">Amount</span>
          <span />
        </div>
        {groups.map(({ category, items, subtotalCents }) => {
          const groupDrafts = drafts.filter(
            (d): d is Draft & { kind: "expense" } => d.kind === "expense" && d.categoryId === category.id,
          );
          const headingId = `tpl-cat-${category.id}`;
          return (
            <div
              key={category.id}
              className={category.is_saving ? "tpl-group tpl-group--saving" : "tpl-group"}
              role="group"
              aria-labelledby={headingId}
            >
              <div className="tpl-group__head">
                <span className="tpl-group__title">
                  <h3 id={headingId} className="tpl-group__name">
                    {category.name}
                  </h3>
                  {category.is_saving && <span className="badge badge--saving">Counted as savings</span>}
                </span>
                <span className="tpl-group__end">
                  <span className="tpl-group__sub">{formatCents(subtotalCents)}</span>
                  <button
                    type="button"
                    className="text-btn"
                    aria-label={`Add item to ${category.name}`}
                    onClick={() => addDraft({ kind: "expense", categoryId: category.id })}
                  >
                    <PlusIcon />
                    Add item
                  </button>
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
                <p className="tpl-group__empty">No items. Anything you add here gets copied every month.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "income";
}) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className={tone === "income" ? "tile__value tpl-tile--income" : "tile__value"}>{value}</span>
      {sub && <span className="tile__sub">{sub}</span>}
    </div>
  );
}

