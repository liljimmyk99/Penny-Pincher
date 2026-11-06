import { useId, useState } from "react";
import { Link } from "react-router";
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
import { AlertIcon, CopyIcon, PencilIcon } from "../../components/icons";
import { monthName, shiftMonth } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { defaultTemplate, plural, templatePreview } from "./preview";
import { useApplyTemplate } from "./useApplyTemplate";
import "./months.css";

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
  const headingId = useId();
  const pickId = useId();
  const templates = useTemplates();
  const [picked, setPicked] = useState<string | null>(null);
  const list = templates.data ?? [];
  const chosen = list.find((t) => t.id === picked) ?? defaultTemplate(list);
  const flow = useApplyTemplate(month, onApplied);
  const name = monthName(month);

  let body;
  if (templates.isPending) body = <p className="new-month__status">Loading your templates…</p>;
  else if (templates.isError)
    body = (
      <p role="alert" className="alert alert--danger">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load your templates. {errorMessage(templates.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void templates.refetch()}>
            Try again
          </button>
        </span>
      </p>
    );
  else if (!chosen)
    body = (
      <p className="new-month__status">
        You have no templates yet. <Link to="/templates">Build a template month</Link> to start months from it.
      </p>
    );
  else body = <Preview month={month} templateId={chosen.id} />;

  const empty = chosen !== null && chosen.expense_item_count + chosen.income_item_count === 0;

  return (
    <section className="card new-month" aria-labelledby={headingId}>
      <div className="new-month__head">
        <p className="eyebrow">New month</p>
        <h2 id={headingId} className="new-month__title">
          Start {name} from your template?
        </h2>
        <p className="new-month__desc">
          Every item is copied into {name} on its day of the month, marked unconfirmed until you check it. You can undo
          right after.
        </p>
      </div>
      {list.length > 1 && (
        <div className="new-month__pick">
          <label htmlFor={pickId} className="field-label">
            Template
          </label>
          <select id={pickId} className="field field--sm" value={chosen?.id ?? ""} onChange={(e) => setPicked(e.target.value)}>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {body}
      {flow.error && (
        <p role="alert" className="alert alert--danger">
          <AlertIcon width={18} height={18} />
          {flow.error}
        </p>
      )}
      <div className="new-month__actions">
        {chosen && (
          <button
            type="button"
            className="btn btn--primary"
            disabled={flow.pending || empty}
            onClick={() => void flow.apply(chosen)}
          >
            <CopyIcon />
            {flow.pending ? "Copying…" : `Copy into ${name}`}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onStartBlank} disabled={flow.pending}>
          Start blank
        </button>
        {chosen && (
          <Link className="btn btn--ghost" to={`/templates?template=${chosen.id}`}>
            <PencilIcon width={18} height={18} />
            Edit template
          </Link>
        )}
      </div>
      {flow.dialog}
    </section>
  );
}

function Preview({ month, templateId }: { month: string; templateId: string }) {
  const template = useTemplate(templateId);
  const categories = useCategories();
  const sources = useIncomeSources();

  const failed = [template, categories, sources].find((q) => q.isError);
  if (failed) return <PreviewError error={failed.error} retry={() => void failed.refetch()} />;
  if (!template.data || !categories.data || !sources.data) return <p className="new-month__status">Loading the preview…</p>;
  if (template.data.income_items.length === 0 && template.data.expense_items.length === 0)
    return (
      <p className="new-month__status">
        “{template.data.name}” has no items yet. Add the paychecks and bills you expect, then copy it.
      </p>
    );
  // Last month is only loaded for a template with items, so an empty one doesn't fill that month's cache.
  return <PreviewWithLastMonth month={month} template={template.data} categories={categories.data} sources={sources.data} />;
}

function PreviewError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <p role="alert" className="alert alert--danger">
      <AlertIcon width={18} height={18} />
      <span>
        Couldn’t load the template preview. {errorMessage(error)}{" "}
        <button type="button" className="text-btn" onClick={retry}>
          Try again
        </button>
      </span>
    </p>
  );
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
  if (!prevExpenses.data || !prevIncome.data) return <p className="new-month__status">Loading the preview…</p>;

  const p = templatePreview(template, categories, sources, prevExpenses.data, prevIncome.data);
  const last = monthName(previousMonth);
  const prev = (cents: number | null) => (cents === null ? "—" : formatCents(cents));
  return (
    <div className="new-month__preview">
      <div className="tiles" role="group" aria-label={`${template.name} totals`}>
        <div className="tile">
          <span className="tile__label">Planned net income</span>
          <span className="tile__value new-month__income">{formatCents(p.totals.netCents)}</span>
          <span className="tile__sub">{last}: {formatCents(p.previous.netCents)}</span>
        </div>
        <div className="tile">
          <span className="tile__label">Planned spending</span>
          <span className="tile__value">{formatCents(p.totals.spentCents)}</span>
          <span className="tile__sub">
            {last}: {formatCents(p.previous.spentCents)}
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Left over</span>
          <span className="tile__value">{formatCents(p.totals.leftOverCents)}</span>
          <span className="tile__sub">
            {last}: {formatCents(p.previous.leftOverCents)}
          </span>
        </div>
      </div>

      <div className="new-month__lists">
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
    <div className="new-month__table-wrap">
      <table className="new-month__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Item</th>
            <th scope="col" className="num">
              {income ? "Net" : "Amount"}
            </th>
            <th scope="col" className="num">
              {last}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="new-month__day">{r.day}</td>
              <td>
                <span className="new-month__name">{r.name}</span>
                {r.detail && (
                  <span className={r.saving ? "new-month__detail new-month__detail--saving" : "new-month__detail"}>
                    {r.detail}
                  </span>
                )}
              </td>
              <td className={income ? "num new-month__income" : "num"}>{formatCents(r.cents)}</td>
              <td className="num new-month__prev">{r.previous}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total
            </th>
            <td className={income ? "num new-month__income" : "num"}>{formatCents(totalCents)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
