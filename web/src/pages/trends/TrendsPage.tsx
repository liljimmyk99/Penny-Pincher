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
import { Plus } from "lucide-react";
import { ChangeText } from "@/components/ChangeBadge";
import { LoadingSection } from "@/components/LoadingSection";
import { SectionCard } from "@/components/SectionCard";
import { Segmented } from "@/components/Segmented";
import { StatTile, TileRow } from "@/components/StatTile";
import { LoadError } from "@/components/LoadError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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

type Trend = Schemas["SavedTrend"];

const count = new Intl.NumberFormat("en-US");
const formatValue = (v: number, m: Measure) => (m === "count" ? count.format(v) : formatCents(v));
const measureLabel = (m: Measure) => (m === "count" ? "Count" : "Amount");
const shortMonth = (month: string) => monthName(month).slice(0, 3);
const MEASURES = [
  { value: "amount", label: "Amount" },
  { value: "count", label: "Count" },
] as const;

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
      <Tabs value={tab} onValueChange={(v) => setTab(v === "category" ? "category" : "custom")} className="gap-4">
        <TabsList variant="line" aria-label="Trend views" className="w-full justify-start border-b border-solid border-x-0 border-t-0 border-border">
          <TabsTrigger value="custom" className="flex-none px-4">Custom trends</TabsTrigger>
          <TabsTrigger value="category" className="flex-none px-4">By category</TabsTrigger>
        </TabsList>
        <TabsContent value="custom">
          <CustomTrends />
        </TabsContent>
        <TabsContent value="category">
          <CategoryTrends />
        </TabsContent>
      </Tabs>
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
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <SectionCard
        title="Saved trends"
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            New trend
          </Button>
        }
        contentClassName="px-3"
      >
        {saved.isPending ? (
          <LoadingSection label="trends" rows={3} />
        ) : saved.isError ? (
          <LoadError message={`Couldn’t load saved trends. ${errorMessage(saved.error)}`} onRetry={() => void saved.refetch()} />
        ) : saved.data.length === 0 ? (
          <p className="m-0 px-2 text-muted-foreground">No saved trends yet. Create one to follow a merchant, category or note over time.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {saved.data.map((t) => (
              <TrendItem key={t.id} trend={t} selected={t.id === selected?.id} onSelect={() => select(t.id)} />
            ))}
          </ul>
        )}
      </SectionCard>

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
      <button
        type="button"
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-md border border-solid border-transparent bg-transparent px-2 py-2.5 text-left text-foreground [font:inherit] hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none",
          selected && "border-primary bg-selected text-selected-foreground hover:bg-selected",
        )}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{trend.name}</span>
          <span className="text-[13px] text-muted-foreground">{match} · {measureLabel(trend.measure)}</span>
        </span>
        {values.length > 0 && <Sparkline values={values} />}
        {values.length > 0 && (
          <span className="sr-only">
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

  if (data.isPending)
    return (
      <SectionCard title={trend.name}>
        <LoadingSection label={trend.name} rows={4} />
      </SectionCard>
    );
  if (data.isError)
    return (
      <SectionCard title={trend.name}>
        <LoadError message={`Couldn’t load this trend. ${errorMessage(data.error)}`} onRetry={() => void data.refetch()} />
      </SectionCard>
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

  const deltaText = `${delta > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(delta))}`;

  return (
    <SectionCard
      title={trend.name}
      action={<Segmented label="Measure" value={measure} options={MEASURES} onChange={setMeasure} />}
      contentClassName="flex flex-col gap-4"
    >
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Definition">
        <li>
          <Badge variant="secondary">{describeMatch(trend, mName, names.category)}</Badge>
        </li>
        <li>
          <Badge variant="secondary">{stats.since ? `Tracking since ${formatMonth(stats.since)}` : "No matches yet"}</Badge>
        </li>
      </ul>

      <TileRow label="Trend totals">
        <StatTile label="Year to date" value={fmt(stats.ytd)} sub={currentMonth.slice(0, 4)} />
        <StatTile
          label="Monthly average"
          value={fmt(stats.monthlyAverage)}
          sub={
            tone === "none" ? (
              `${monthName(currentMonth)} same as last month`
            ) : (
              <>
                <ChangeText
                  tone={tone}
                  text={deltaText}
                  words={`${tone === "worse" ? "Worse" : "Better"}: ${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))} this month vs. last month`}
                />{" "}
                this month vs. last
              </>
            )
          }
        />
        <StatTile
          label="Peak month"
          value={stats.peak ? fmt(stats.peak.value) : "—"}
          sub={stats.peak ? formatMonth(stats.peak.period) : "No matches yet"}
        />
        <StatTile
          label="Average per visit"
          value={stats.perVisitCents === null ? "—" : formatCents(stats.perVisitCents)}
          sub={`Last ${buckets.length} months`}
        />
      </TileRow>

      <div>
        <h3 className="m-0 mb-2 text-sm font-semibold">Per month · {measureLabel(measure)}</h3>
        <PeriodBars
          bars={bars}
          selectedId={month}
          onSelect={(id) => setMonth((m) => (m === id ? null : id))}
          label={`${trend.name}, ${measureLabel(measure).toLowerCase()} per month`}
          summary={`${trend.name}, ${measureLabel(measure).toLowerCase()} per month over the last ${buckets.length} months. ${
            stats.peak ? `Peak ${formatMonth(stats.peak.period)}: ${fmt(stats.peak.value)}.` : "No matches yet."
          } Select a month to list its entries.`}
        />
      </div>
      {month && <MonthEntries key={month} trend={trend} month={month} merchantName={mName} />}
    </SectionCard>
  );
}

function MonthEntries({ trend, month, merchantName }: { trend: Trend; month: string; merchantName: string | null }) {
  const expenses = useMonthExpenses(month);
  const categories = useCategories();
  const rows = (expenses.data ?? []).filter((e) => matchesTrend(e, trend));
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? "—";
  return (
    <div className="border-t border-solid border-x-0 border-b-0 border-border pt-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold">{formatMonth(month)} entries</h3>
        <Button asChild variant="outline">
          <Link to={transactionsLink(trend, month, merchantName)}>Open in Transactions</Link>
        </Button>
      </div>
      {expenses.isPending ? (
        <LoadingSection label="entries" rows={2} className="mt-2" />
      ) : expenses.isError ? (
        <div className="mt-2">
          <LoadError message={`Couldn’t load entries. ${errorMessage(expenses.error)}`} />
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 mt-2 text-muted-foreground">No matching entries in {monthName(month)}.</p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {rows.map((e) => {
            const refund = e.amount_cents < 0;
            return (
              <li
                key={e.id}
                data-refund={refund || undefined}
                className={cn(
                  "grid grid-cols-[60px_minmax(0,1fr)_auto] gap-3 border-b border-solid border-x-0 border-t-0 border-border px-2 py-2 tabular-nums",
                  refund && "bg-refund-row text-refund-text",
                )}
              >
                <span className={refund ? undefined : "text-muted-foreground"}>{formatShortDate(e.date)}</span>
                <span className="flex flex-col font-semibold">
                  {e.merchant.name}
                  <span className={cn("text-[13px] font-normal", !refund && "text-muted-foreground")}>
                    {catName(e.category_id)}
                    {e.note ? ` · ${e.note}` : ""}
                    {refund ? " · Refund" : ""}
                  </span>
                </span>
                <span className="font-semibold">{formatCents(e.amount_cents)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
