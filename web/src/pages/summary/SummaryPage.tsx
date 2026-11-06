import { useCallback, useState } from "react";
import { Link } from "react-router";
import { errorMessage, useMonthlySummary, type Schemas } from "../../api";
import { Donut } from "../../charts/Donut";
import { RankedBars, type RankedBar } from "../../charts/RankedBars";
import { AlertIcon, PlusIcon } from "../../components/icons";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { Toast } from "../../components/Toast";
import { formatMonth, monthName, monthOf, todayISO } from "../../lib/dates";
import { changeWords } from "../../lib/change";
import { formatCents } from "../../lib/money";
import { useMonthParam } from "../../lib/useMonthParam";
import { NewMonthOffer } from "../months/NewMonthOffer";
import { UnconfirmedBanner } from "../months/UnconfirmedBanner";
import { Page } from "../Page";
import { ChangeBadge } from "./ChangeBadge";
import { IncomeDialog } from "./IncomeDialog";
import { categoryColor, donutSlices, percentOfIncome, rankedCategories } from "./summary";
import { Welcome } from "./Welcome";
import "./SummaryPage.css";

type Summary = Schemas["MonthlySummary"];
type View = "bars" | "donut";

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

/**
 * The landing screen: the current month at a glance (web/AGENTS.md "Summary"
 * and "Empty states"). The month is in the address (`?month=`), like Add
 * entries and Transactions.
 */
export function SummaryPage() {
  const [month, setMonth] = useMonthParam();
  const summary = useMonthlySummary(month);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  // Months the user chose to start blank (this visit only; it's not data).
  const [blank, setBlank] = useState<ReadonlySet<string>>(() => new Set());

  let body;
  if (summary.isPending) body = <p className="summary__status">Loading {monthName(month)}…</p>;
  else if (summary.isError)
    body = (
      <p role="alert" className="alert alert--danger">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load the summary. {errorMessage(summary.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void summary.refetch()}>
            Try again
          </button>
        </span>
      </p>
    );
  else
    body = (
      <>
        {summary.data.is_empty && month === monthOf(todayISO()) && <Welcome hasEntries={false} />}
        <UnconfirmedBanner month={month} showReview onDone={setToast} />
        {summary.data.is_empty && !blank.has(month) && (
          <NewMonthOffer
            key={month}
            month={month}
            onStartBlank={() => setBlank((b) => new Set(b).add(month))}
            onApplied={(r) =>
              setToast(`Copied ${plural(r.created_expense_count + r.created_income_entry_count, "item", "items")} into ${monthName(month)}`)
            }
          />
        )}
        <SummaryBody key={month} month={month} data={summary.data} />
      </>
    );

  return (
    <Page
      title="Summary"
      eyebrow={formatMonth(month)}
      actions={
        <>
          <MonthSwitcher month={month} onChange={setMonth} />
          <Link className="btn btn--primary" to={`/add?month=${month}`}>
            <PlusIcon />
            Add entries
          </Link>
        </>
      }
    >
      {body}
      <Toast message={toast} onDismiss={dismissToast} />
    </Page>
  );
}

function SummaryBody({ month, data }: { month: string; data: Summary }) {
  const { income, spending } = data;
  const empty = data.is_empty;
  const muted = empty ? " tile__value--muted" : "";
  const [openSource, setOpenSource] = useState<string | null>(null);
  const source = income.sources.find((s) => s.income_source_id === openSource);
  const previousSaving = spending.categories.filter((c) => c.is_saving).reduce((t, c) => t + c.previous_month_total_cents, 0);

  return (
    <>
      <div className="tiles" role="group" aria-label={`${formatMonth(month)} totals`}>
        <div className="tile">
          <span className="tile__label">Net income</span>
          <span className={`tile__value tile__value--income${muted}`}>{formatCents(income.combined.net_cents)}</span>
          <span className="tile__sub">{plural(income.combined.entry_count, "entry", "entries")}</span>
        </div>
        <div className="tile">
          <span className="tile__label">Spent</span>
          <span className={`tile__value${muted}`}>{formatCents(spending.total_cents)}</span>
          <span className="tile__sub">
            <ChangeBadge current={spending.total_cents} previous={spending.previous_month_total_cents} />
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Saved &amp; invested</span>
          <span className={`tile__value tile__value--saving${muted}`}>{formatCents(spending.saving_cents)}</span>
          <span className="tile__sub">
            Counted in Spent · <ChangeBadge current={spending.saving_cents} previous={previousSaving} saving />
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Left over</span>
          <span className={`tile__value${muted}`}>{formatCents(data.left_over_cents)}</span>
          <span className="tile__sub">Net income − spent</span>
        </div>
      </div>

      <section className="card summary" aria-labelledby="summary-income-h">
        <div className="summary__head">
          <h2 id="summary-income-h">Income</h2>
          <p className="summary__desc">Select a source to see its entries.</p>
        </div>
        <IncomeList month={month} data={data} onOpen={setOpenSource} />
      </section>

      <SpendingPanel month={month} data={data} />

      {source && (
        <IncomeDialog
          month={month}
          source={source}
          combined={income.combined}
          onClose={() => setOpenSource(null)}
        />
      )}
    </>
  );
}

function IncomeList({ month, data, onOpen }: { month: string; data: Summary; onOpen: (id: string) => void }) {
  const { sources, combined } = data.income;
  const used = sources.filter((s) => s.entry_count > 0);
  if (used.length === 0)
    return (
      <div className="summary__empty">
        <p>No income logged in {monthName(month)}. Add paychecks and one-off jobs to see where your money comes from.</p>
        <Link className="btn btn--ghost" to={`/add?month=${month}`}>
          <PlusIcon />
          Add income
        </Link>
      </div>
    );
  return (
    <ul className="summary__rows">
      {used.map((s) => (
        <li key={s.income_source_id}>
          <button
            type="button"
            className="summary__row"
            aria-haspopup="dialog"
            aria-label={`${s.name}, ${formatCents(s.net_cents)} net, ${plural(s.entry_count, "entry", "entries")}`}
            onClick={() => onOpen(s.income_source_id)}
          >
            <span className="summary__row-name">{s.name}</span>
            <span className="summary__row-sub" aria-hidden="true">{plural(s.entry_count, "entry", "entries")}</span>
            <span className="summary__row-amount summary__row-amount--income" aria-hidden="true">{formatCents(s.net_cents)}</span>
          </button>
        </li>
      ))}
      <li className="summary__total">
        <span>All sources combined</span>
        <span className="summary__row-amount summary__row-amount--income">{formatCents(combined.net_cents)}</span>
      </li>
    </ul>
  );
}

function SpendingPanel({ month, data }: { month: string; data: Summary }) {
  const [view, setView] = useState<View>("bars");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const { spending } = data;
  const net = data.income.combined.net_cents;
  const ranked = rankedCategories(spending.categories);
  const toggle = (id: string) => setHighlighted((h) => (h === id ? null : id));

  const rows: RankedBar[] = ranked.map((c, i) => ({
    id: c.category_id,
    label: c.name,
    cents: c.total_cents,
    amount: formatCents(c.total_cents),
    color: categoryColor(c, i),
    saving: c.is_saving,
    detail: `${percentOfIncome(c.total_cents, net)} of income`,
    change: <ChangeBadge current={c.total_cents} previous={c.previous_month_total_cents} saving={c.is_saving} suffix="" />,
    changeText: changeWords(c.total_cents, c.previous_month_total_cents, c.is_saving),
  }));

  let body;
  if (ranked.length === 0)
    body = (
      <div className="summary__empty">
        <p>No spending logged in {monthName(month)}. Log expenses as they happen, or in batches later.</p>
        <Link className="btn btn--ghost" to={`/add?month=${month}`}>
          <PlusIcon />
          Add expenses
        </Link>
      </div>
    );
  else if (view === "bars")
    body = <RankedBars rows={rows} highlightedId={highlighted} onToggle={toggle} label="Spending by category" />;
  else
    body = (
      <div className="summary__donut">
        <Donut
          slices={donutSlices(ranked)}
          label={`Spending by category, ${formatCents(spending.total_cents)} in total`}
          centre={
            <>
              <span className="summary__donut-label">Spent</span>
              <strong>{formatCents(spending.total_cents)}</strong>
            </>
          }
        />
        <RankedLegend rows={rows} highlightedId={highlighted} onToggle={toggle} />
      </div>
    );

  return (
    <section className="card summary" aria-labelledby="summary-spending-h">
      <div className="summary__head">
        <div>
          <h2 id="summary-spending-h">Spending by category</h2>
          <p className="summary__desc">Percent of net income, and change vs. last month. Saving is counted in Spent.</p>
        </div>
        {ranked.length > 0 && (
          <div role="group" aria-label="Chart type" className="segmented">
            {(["bars", "donut"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "bars" ? "Bars" : "Donut"}
              </button>
            ))}
          </div>
        )}
      </div>
      {body}
    </section>
  );
}

/** The donut's legend: the same rows as the bars, as buttons that only highlight. */
function RankedLegend({
  rows,
  highlightedId,
  onToggle,
}: {
  rows: RankedBar[];
  highlightedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="legend" aria-label="Spending by category">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={`legend__row${highlightedId === r.id ? " is-highlighted" : ""}${highlightedId && highlightedId !== r.id ? " is-dimmed" : ""}`}
            aria-pressed={highlightedId === r.id}
            aria-label={[r.label, r.amount, r.detail, r.changeText].filter(Boolean).join(", ")}
            onClick={() => onToggle(r.id)}
          >
            <span className="legend__swatch" style={{ background: r.color }} aria-hidden="true" />
            <span className="legend__name" aria-hidden="true">{r.label}</span>
            <span className="legend__amount" aria-hidden="true">{r.amount}</span>
            <span className="legend__detail" aria-hidden="true">{r.detail}</span>
            <span className="legend__change" aria-hidden="true">{r.change}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
