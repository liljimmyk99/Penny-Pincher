import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { errorMessage, useYearlySummary } from "../../api";
import { PairedBars } from "../../charts/PairedBars";
import { RankedBars, type RankedBar } from "../../charts/RankedBars";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import { monthName, todayISO } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { categoryColor } from "../summary/summary";
import { Page } from "../Page";
import { averageCents, rankedAverages, type Yearly } from "./yearly";
import "./YearlyPage.css";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** The year in the address (`?year=`), defaulting to the current year. */
function useYearParam(): [number, (year: number) => void] {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("year"));
  const year =
    Number.isInteger(requested) && requested >= MIN_YEAR && requested <= MAX_YEAR
      ? requested
      : Number(todayISO().slice(0, 4));
  return [year, (next) => setParams((p) => { p.set("year", String(next)); return p; })];
}

/** The year at a glance (web/AGENTS.md "Yearly"). */
export function YearlyPage() {
  const [year, setYear] = useYearParam();
  const summary = useYearlySummary(year);

  let body;
  if (summary.isPending) body = <p className="yearly__status">Loading {year}…</p>;
  else if (summary.isError)
    body = (
      <p role="alert" className="alert alert--danger">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load the yearly summary. {errorMessage(summary.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void summary.refetch()}>
            Try again
          </button>
        </span>
      </p>
    );
  else body = <YearlyBody key={year} data={summary.data} />;

  return (
    <Page
      title="Yearly"
      eyebrow={String(year)}
      actions={
        <div role="group" aria-label="Year" className="month-switcher">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Previous year, ${year - 1}`}
            disabled={year <= MIN_YEAR}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeftIcon />
          </button>
          <span className="month-switcher__label" aria-live="polite">{year}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Next year, ${year + 1}`}
            disabled={year >= MAX_YEAR}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRightIcon />
          </button>
        </div>
      }
    >
      {body}
    </Page>
  );
}

function YearlyBody({ data }: { data: Yearly }) {
  const { totals, average_month_count: n } = data;
  const empty = n === 0;
  const muted = empty ? " tile__value--muted" : "";
  const avg = (cents: number) => `${formatCents(averageCents(cents, n))} / month`;

  return (
    <>
      <div className="tiles" role="group" aria-label={`${data.year} totals`}>
        <div className="tile">
          <span className="tile__label">Net income</span>
          <span className={`tile__value tile__value--income${muted}`}>{formatCents(totals.net_cents)}</span>
          <span className="tile__sub">{avg(totals.net_cents)} average</span>
        </div>
        <div className="tile">
          <span className="tile__label">Spent</span>
          <span className={`tile__value${muted}`}>{formatCents(totals.spent_cents)}</span>
          <span className="tile__sub">{avg(totals.spent_cents)} average</span>
        </div>
        <div className="tile">
          <span className="tile__label">Saved &amp; invested</span>
          <span className={`tile__value tile__value--saving${muted}`}>{formatCents(totals.saving_cents)}</span>
          <span className="tile__sub">Counted in Spent · {avg(totals.saving_cents)}</span>
        </div>
        <div className="tile">
          <span className="tile__label">Left over</span>
          <span className={`tile__value${muted}`}>{formatCents(totals.left_over_cents)}</span>
          <span className="tile__sub">{avg(totals.left_over_cents)} average</span>
        </div>
      </div>

      {empty && (
        <p className="yearly__status">
          Nothing logged in {data.year} yet. <Link to="/add">Add entries</Link> to see the year take shape.
        </p>
      )}

      <IncomeVsSpent data={data} />
      <CategoryAverages data={data} />
      <MonthTable data={data} />
    </>
  );
}

const shortMonth = (month: string) => monthName(month).slice(0, 3);

function IncomeVsSpent({ data }: { data: Yearly }) {
  const navigate = useNavigate();
  const groups = data.months.map((m) => ({
    id: m.month,
    label: shortMonth(m.month),
    a: m.net_cents,
    b: m.spent_cents,
    name: `${monthName(m.month)}: net income ${formatCents(m.net_cents)}, spent ${formatCents(m.spent_cents)}. Open ${monthName(m.month)} summary`,
  }));
  return (
    <section className="card yearly" aria-labelledby="yearly-pairs-h">
      <div className="yearly__head">
        <h2 id="yearly-pairs-h">Income vs. spent</h2>
        <p className="yearly__desc">Net income and spending per month. Select a month to open its summary.</p>
      </div>
      <PairedBars
        groups={groups}
        aName="Net income"
        bName="Spent"
        label="Net income and spent per month"
        summary={`${data.year}: net income ${formatCents(data.totals.net_cents)}, spent ${formatCents(data.totals.spent_cents)}.`}
        onSelect={(month) => void navigate(`/summary?month=${month}`)}
      />
    </section>
  );
}

function CategoryAverages({ data }: { data: Yearly }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const ranked = rankedAverages(data.categories);
  const rows: RankedBar[] = ranked.map((c, i) => ({
    id: c.category_id,
    label: c.name,
    cents: c.monthly_average_cents,
    amount: formatCents(c.monthly_average_cents),
    color: categoryColor(c, i),
    saving: c.is_saving,
    detail: `${formatCents(c.total_cents)} for the year`,
  }));
  return (
    <section className="card yearly" aria-labelledby="yearly-cats-h">
      <div className="yearly__head">
        <h2 id="yearly-cats-h">Monthly average by category</h2>
        <p className="yearly__desc">
          Averaged over the {data.average_month_count} {data.average_month_count === 1 ? "month" : "months"} with entries.
          Saving is counted in Spent.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="yearly__empty">No spending logged in {data.year}.</p>
      ) : (
        <RankedBars
          rows={rows}
          highlightedId={highlighted}
          onToggle={(id) => setHighlighted((h) => (h === id ? null : id))}
          label="Monthly average spending by category"
        />
      )}
    </section>
  );
}

function MonthTable({ data }: { data: Yearly }) {
  const navigate = useNavigate();
  const n = data.average_month_count;
  const { totals } = data;
  const cell = (cents: number, has: boolean) => (has ? formatCents(cents) : <span aria-label="none">—</span>);
  return (
    <section className="card yearly" aria-labelledby="yearly-table-h">
      <div className="yearly__head">
        <h2 id="yearly-table-h">Month by month</h2>
        <p className="yearly__desc">Select a month to open its summary.</p>
      </div>
      <div className="yearly__scroll">
        <table className="tx-table yearly__table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="num">Net income</th>
              <th scope="col" className="num">Spent</th>
              <th scope="col" className="num">Left over</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr
                key={m.month}
                className={`yearly__row${m.has_entries ? "" : " is-quiet"}`}
                onClick={() => void navigate(`/summary?month=${m.month}`)}
              >
                <th scope="row">
                  <Link to={`/summary?month=${m.month}`} onClick={(e) => e.stopPropagation()}>
                    {monthName(m.month)}
                  </Link>
                </th>
                <td className="num yearly__income">{cell(m.net_cents, m.has_entries)}</td>
                <td className="num">{cell(m.spent_cents, m.has_entries)}</td>
                <td className="num">{cell(m.left_over_cents, m.has_entries)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num yearly__income">{formatCents(totals.net_cents)}</td>
              <td className="num">{formatCents(totals.spent_cents)}</td>
              <td className="num">{formatCents(totals.left_over_cents)}</td>
            </tr>
            <tr>
              <th scope="row">Monthly average</th>
              <td className="num yearly__income">{formatCents(averageCents(totals.net_cents, n))}</td>
              <td className="num">{formatCents(averageCents(totals.spent_cents, n))}</td>
              <td className="num">{formatCents(averageCents(totals.left_over_cents, n))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
