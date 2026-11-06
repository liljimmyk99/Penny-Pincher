import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  errorMessage,
  useAllMerchants,
  useCategories,
  useCustomTrend,
  useMonthExpenses,
  useSavedTrends,
  type Schemas,
} from "../../api";
import { PeriodBars, Sparkline } from "../../charts/PeriodBars";
import { AlertIcon, PlusIcon } from "../../components/icons";
import { formatMonth, formatShortDate, monthName, todayISO } from "../../lib/dates";
import { changeTone } from "../../lib/change";
import { formatCents } from "../../lib/money";
import { Page } from "../Page";
import { CategoryTrends } from "./CategoryTrends";
import { NewTrendDialog } from "./NewTrendDialog";
import {
  describeMatch,
  matchesTrend,
  transactionsLink,
  trendRange,
  trendStats,
  valueOf,
  type Measure,
} from "./trends";
import "./TrendsPage.css";

type Trend = Schemas["SavedTrend"];

const count = new Intl.NumberFormat("en-US");
const formatValue = (v: number, m: Measure) => (m === "count" ? count.format(v) : formatCents(v));
const measureLabel = (m: Measure) => (m === "count" ? "Count" : "Amount");
const shortMonth = (month: string) => monthName(month).slice(0, 3);

/** Names for a trend's match, from the merchant and category lists. */
function useMatchNames(t: Trend | undefined) {
  const merchants = useAllMerchants();
  const categories = useCategories();
  return {
    merchant: t?.merchant_id ? (merchants.data?.find((m) => m.id === t.merchant_id)?.name ?? null) : null,
    category: t?.category_id ? (categories.data?.find((c) => c.id === t.category_id)?.name ?? null) : null,
  };
}

/** Trends (web/AGENTS.md "Trends"). */
export function TrendsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "category" ? "category" : "custom";
  const setTab = (next: "custom" | "category") =>
    setParams((p) => { p.set("tab", next); return p; }, { replace: true });

  return (
    <Page title="Trends" eyebrow="Spending over time">
      <div role="tablist" aria-label="Trend views" className="trends__tabs">
        {([["custom", "Custom trends"], ["category", "By category"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`trends-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="trends-panel"
            className={`trends__tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="trends-panel" aria-labelledby={`trends-tab-${tab}`}>
        {tab === "custom" ? (
          <CustomTrends />
        ) : (
          <CategoryTrends />
        )}
      </div>
    </Page>
  );
}

function CustomTrends() {
  const [params, setParams] = useSearchParams();
  const saved = useSavedTrends();
  const [creating, setCreating] = useState(false);
  const selectedId = params.get("trend");
  const selected = saved.data?.find((t) => t.id === selectedId) ?? saved.data?.[0];
  const select = (id: string) => setParams((p) => { p.set("trend", id); return p; }, { replace: true });

  return (
    <div className="trends">
      <section className="card trends__list" aria-labelledby="trends-list-h">
        <div className="trends__list-head">
          <h2 id="trends-list-h">Saved trends</h2>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            New trend
          </button>
        </div>
        {saved.isPending ? (
          <p className="trends__status">Loading trends…</p>
        ) : saved.isError ? (
          <p role="alert" className="alert alert--danger trends__alert">
            <AlertIcon width={18} height={18} />
            <span>
              Couldn’t load saved trends. {errorMessage(saved.error)}{" "}
              <button type="button" className="text-btn" onClick={() => void saved.refetch()}>Try again</button>
            </span>
          </p>
        ) : saved.data.length === 0 ? (
          <p className="trends__status">No saved trends yet. Create one to follow a merchant, category or note over time.</p>
        ) : (
          <ul className="trends__items">
            {saved.data.map((t) => (
              <TrendItem key={t.id} trend={t} selected={t.id === selected?.id} onSelect={() => select(t.id)} />
            ))}
          </ul>
        )}
      </section>

      {selected ? <TrendDetail key={selected.id} trend={selected} /> : <div />}

      <NewTrendDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setCreating(false);
          select(t.id);
        }}
      />
    </div>
  );
}

function TrendItem({ trend, selected, onSelect }: { trend: Trend; selected: boolean; onSelect: () => void }) {
  const range = trendRange(todayISO().slice(0, 7));
  const data = useCustomTrend(trend, range);
  const names = useMatchNames(trend);
  const match = describeMatch(trend, names.merchant, names.category);
  const values = (data.data?.buckets ?? []).map((b) => valueOf(b, trend.measure));
  return (
    <li>
      <button type="button" className={`trends__item${selected ? " is-selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
        <span className="trends__item-text">
          <span className="trends__item-name">{trend.name}</span>
          <span className="trends__item-meta">{match} · {measureLabel(trend.measure)}</span>
        </span>
        {values.length > 0 && <Sparkline values={values} />}
        {values.length > 0 && (
          <span className="visually-hidden">
            Last {values.length} months, {measureLabel(trend.measure).toLowerCase()}:{" "}
            {values.map((v) => formatValue(v, trend.measure)).join(", ")}.
          </span>
        )}
      </button>
    </li>
  );
}

function TrendDetail({ trend }: { trend: Trend }) {
  const currentMonth = todayISO().slice(0, 7);
  const range = trendRange(currentMonth);
  const data = useCustomTrend(trend, range);
  const names = useMatchNames(trend);
  const [measure, setMeasure] = useState<Measure>(trend.measure);
  const [month, setMonth] = useState<string | null>(null);

  if (data.isPending) return <section className="card trends__detail"><p className="trends__status">Loading {trend.name}…</p></section>;
  if (data.isError)
    return (
      <section className="card trends__detail">
        <p role="alert" className="alert alert--danger trends__alert">
          <AlertIcon width={18} height={18} />
          <span>
            Couldn’t load this trend. {errorMessage(data.error)}{" "}
            <button type="button" className="text-btn" onClick={() => void data.refetch()}>Try again</button>
          </span>
        </p>
      </section>
    );

  const buckets = data.data.buckets;
  const stats = trendStats(buckets, measure, currentMonth);
  const fmt = (v: number) => formatValue(v, measure);
  const bars = buckets.map((b) => {
    const v = valueOf(b, measure);
    return { id: b.period, label: shortMonth(b.period), value: v, name: `${formatMonth(b.period)}: ${fmt(v)}. Show entries` };
  });
  const delta = stats.current - stats.previous;
  const tone = changeTone(delta, false);
  const mName = names.merchant;

  return (
    <section className="card trends__detail" aria-labelledby="trend-h">
      <div className="trends__detail-head">
        <h2 id="trend-h">{trend.name}</h2>
        <div role="group" aria-label="Measure" className="trends__toggle">
          {(["amount", "count"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={measure === m} className={measure === m ? "is-active" : undefined} onClick={() => setMeasure(m)}>
              {measureLabel(m)}
            </button>
          ))}
        </div>
      </div>
      <ul className="trends__pills" aria-label="Definition">
        <li className="badge">{describeMatch(trend, mName, names.category)}</li>
        <li className="badge">{stats.since ? `Tracking since ${formatMonth(stats.since)}` : "No matches yet"}</li>
      </ul>

      <div className="tiles trends__tiles" role="group" aria-label="Trend totals">
        <div className="tile">
          <span className="tile__label">Year to date</span>
          <span className="tile__value">{fmt(stats.ytd)}</span>
          <span className="tile__sub">{currentMonth.slice(0, 4)}</span>
        </div>
        <div className="tile">
          <span className="tile__label">Monthly average</span>
          <span className="tile__value">{fmt(stats.monthlyAverage)}</span>
          <span className="tile__sub">
            {tone === "none" ? (
              `${monthName(currentMonth)} same as last month`
            ) : (
              <span className={`change change--${tone}`}>
                <span aria-hidden="true">{delta > 0 ? "▲ +" : "▼ −"}{fmt(Math.abs(delta))}</span>
                <span className="visually-hidden">
                  {tone === "worse" ? "Worse" : "Better"}: {delta > 0 ? "+" : "−"}{fmt(Math.abs(delta))} this month vs. last month
                </span>
              </span>
            )}
            {tone !== "none" && " this month vs. last"}
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Peak month</span>
          <span className="tile__value">{stats.peak ? fmt(stats.peak.value) : "—"}</span>
          <span className="tile__sub">{stats.peak ? formatMonth(stats.peak.period) : "No matches yet"}</span>
        </div>
        <div className="tile">
          <span className="tile__label">Average per visit</span>
          <span className="tile__value">{stats.perVisitCents === null ? "—" : formatCents(stats.perVisitCents)}</span>
          <span className="tile__sub">Last {buckets.length} months</span>
        </div>
      </div>

      <h3 className="trends__chart-h">Per month · {measureLabel(measure)}</h3>
      <PeriodBars
        bars={bars}
        selectedId={month}
        onSelect={(id) => setMonth((m) => (m === id ? null : id))}
        label={`${trend.name}, ${measureLabel(measure).toLowerCase()} per month`}
        summary={`${trend.name}, ${measureLabel(measure).toLowerCase()} per month over the last ${buckets.length} months. ${
          stats.peak ? `Peak ${formatMonth(stats.peak.period)}: ${fmt(stats.peak.value)}.` : "No matches yet."
        } Select a month to list its entries.`}
      />
      {month && <MonthEntries key={month} trend={trend} month={month} merchantName={mName} />}
    </section>
  );
}

function MonthEntries({ trend, month, merchantName }: { trend: Trend; month: string; merchantName: string | null }) {
  const expenses = useMonthExpenses(month);
  const categories = useCategories();
  const rows = (expenses.data ?? []).filter((e) => matchesTrend(e, trend));
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? "—";
  return (
    <div className="trends__entries" aria-live="polite">
      <div className="trends__entries-head">
        <h3>{formatMonth(month)} entries</h3>
        <Link className="btn btn--ghost btn--sm" to={transactionsLink(trend, month, merchantName)}>
          Open in Transactions
        </Link>
      </div>
      {expenses.isPending ? (
        <p className="trends__status">Loading entries…</p>
      ) : expenses.isError ? (
        <p role="alert" className="alert alert--danger trends__alert">
          <AlertIcon width={18} height={18} />
          Couldn’t load entries. {errorMessage(expenses.error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="trends__status">No matching entries in {monthName(month)}.</p>
      ) : (
        <ul className="trends__rows">
          {rows.map((e) => (
            <li key={e.id} className={e.amount_cents < 0 ? "is-refund" : undefined}>
              <span className="trends__row-date">{formatShortDate(e.date)}</span>
              <span className="trends__row-main">
                {e.merchant.name}
                <span className="trends__row-sub">{catName(e.category_id)}{e.note ? ` · ${e.note}` : ""}{e.amount_cents < 0 ? " · Refund" : ""}</span>
              </span>
              <span className="trends__row-amount">{formatCents(e.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
