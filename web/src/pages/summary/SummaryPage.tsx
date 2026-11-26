import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { errorMessage, useMonthlySummary, type Schemas } from "../../api";
import { Donut } from "../../charts/Donut";
import { RankedBars, type RankedBar } from "../../charts/RankedBars";
import { ChangeBadge } from "@/components/ChangeBadge";
import { LoadingSection } from "@/components/LoadingSection";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { SectionCard } from "@/components/SectionCard";
import { Segmented } from "@/components/Segmented";
import { StatTile, TileRow } from "@/components/StatTile";
import { LoadError } from "@/components/LoadError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "../../lib/toast";
import { formatMonth, monthName, monthOf, todayISO } from "../../lib/dates";
import { changeWords } from "../../lib/change";
import { formatCents } from "../../lib/money";
import { useMonthParam } from "../../lib/useMonthParam";
import { cn } from "@/lib/utils";
import { NewMonthOffer } from "../months/NewMonthOffer";
import { UnconfirmedBanner } from "../months/UnconfirmedBanner";
import { Page } from "../Page";
import { IncomeDialog } from "./IncomeDialog";
import { categoryColor, donutSlices, percentOfIncome, rankedCategories } from "./summary";
import { Welcome } from "./Welcome";

type Summary = Schemas["MonthlySummary"];
type View = "bars" | "donut";

const VIEWS = [
  { value: "bars", label: "Bars" },
  { value: "donut", label: "Donut" },
] as const;

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
  // Months the user chose to start blank (this visit only; it's not data).
  const [blank, setBlank] = useState<ReadonlySet<string>>(() => new Set());

  let body;
  if (summary.isPending) body = <LoadingSection label={monthName(month)} rows={4} />;
  else if (summary.isError)
    body = (
      <LoadError message={`Couldn’t load the summary. ${errorMessage(summary.error)}`} onRetry={() => void summary.refetch()} />
    );
  else
    body = (
      <>
        {summary.data.is_empty && month === monthOf(todayISO()) && <Welcome hasEntries={false} />}
        <UnconfirmedBanner month={month} showReview />
        {summary.data.is_empty && !blank.has(month) && (
          <NewMonthOffer
            key={month}
            month={month}
            onStartBlank={() => setBlank((b) => new Set(b).add(month))}
            onApplied={(r) =>
              toast(`Copied ${plural(r.created_expense_count + r.created_income_entry_count, "item", "items")} into ${monthName(month)}`)
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
          <Button asChild>
            <Link to={`/add?month=${month}`}>
              <Plus aria-hidden="true" />
              Add entries
            </Link>
          </Button>
        </>
      }
    >
      {body}
    </Page>
  );
}

function SummaryBody({ month, data }: { month: string; data: Summary }) {
  const { income, spending } = data;
  const empty = data.is_empty;
  const [openSource, setOpenSource] = useState<string | null>(null);
  const source = income.sources.find((s) => s.income_source_id === openSource);
  const previousSaving = spending.categories.filter((c) => c.is_saving).reduce((t, c) => t + c.previous_month_total_cents, 0);

  return (
    <>
      <TileRow label={`${formatMonth(month)} totals`}>
        <StatTile
          label="Net income"
          value={formatCents(income.combined.net_cents)}
          tone={empty ? "muted" : "income"}
          sub={plural(income.combined.entry_count, "entry", "entries")}
        />
        <StatTile
          label="Spent"
          value={formatCents(spending.total_cents)}
          tone={empty ? "muted" : "default"}
          sub={<ChangeBadge current={spending.total_cents} previous={spending.previous_month_total_cents} />}
        />
        <StatTile
          label="Saved & invested"
          value={formatCents(spending.saving_cents)}
          tone={empty ? "muted" : "saving"}
          sub={
            <>
              Counted in Spent · <ChangeBadge current={spending.saving_cents} previous={previousSaving} saving />
            </>
          }
        />
        <StatTile
          label="Left over"
          value={formatCents(data.left_over_cents)}
          tone={empty ? "muted" : "default"}
          sub="Net income − spent"
        />
      </TileRow>

      <SectionCard title="Income" description="Select a source to see its entries.">
        <IncomeList month={month} data={data} onOpen={setOpenSource} />
      </SectionCard>

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

/** A dashed panel for a section with nothing logged yet, with a link to add some. */
function EmptyPanel({ children, to, action }: { children: ReactNode; to: string; action: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-input p-5 text-muted-foreground">
      <p className="m-0">{children}</p>
      <Button asChild variant="outline">
        <Link to={to}>
          <Plus aria-hidden="true" />
          {action}
        </Link>
      </Button>
    </div>
  );
}

const rowButton =
  "w-full cursor-pointer rounded-md border-0 bg-transparent px-2 text-left text-foreground [font:inherit] hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none";

function IncomeList({ month, data, onOpen }: { month: string; data: Summary; onOpen: (id: string) => void }) {
  const { sources, combined } = data.income;
  const used = sources.filter((s) => s.entry_count > 0);
  if (used.length === 0)
    return (
      <EmptyPanel to={`/add?month=${month}`} action="Add income">
        No income logged in {monthName(month)}. Add paychecks and one-off jobs to see where your money comes from.
      </EmptyPanel>
    );
  return (
    <ul className="m-0 list-none p-0">
      {used.map((s) => (
        <li key={s.income_source_id}>
          <button
            type="button"
            className={cn(rowButton, "grid min-h-11 grid-cols-[1fr_auto_auto] items-center gap-4 py-1")}
            aria-haspopup="dialog"
            aria-label={`${s.name}, ${formatCents(s.net_cents)} net, ${plural(s.entry_count, "entry", "entries")}`}
            onClick={() => onOpen(s.income_source_id)}
          >
            <span className="font-semibold">{s.name}</span>
            <span className="text-[13px] text-muted-foreground" aria-hidden="true">{plural(s.entry_count, "entry", "entries")}</span>
            <span className="min-w-24 text-right font-semibold text-income tabular-nums" aria-hidden="true">{formatCents(s.net_cents)}</span>
          </button>
        </li>
      ))}
      <li className="mt-1.5 flex justify-between gap-4 border-t border-border px-2 pt-3 pb-1 font-semibold">
        <span>All sources combined</span>
        <span className="min-w-24 text-right text-income tabular-nums">{formatCents(combined.net_cents)}</span>
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
      <EmptyPanel to={`/add?month=${month}`} action="Add expenses">
        No spending logged in {monthName(month)}. Log expenses as they happen, or in batches later.
      </EmptyPanel>
    );
  else if (view === "bars")
    body = <RankedBars rows={rows} highlightedId={highlighted} onToggle={toggle} label="Spending by category" />;
  else
    body = (
      <div className="flex flex-wrap items-center gap-6">
        <Donut
          slices={donutSlices(ranked)}
          label={`Spending by category, ${formatCents(spending.total_cents)} in total`}
          centre={
            <>
              <span className="text-xs text-muted-foreground">Spent</span>
              <strong>{formatCents(spending.total_cents)}</strong>
            </>
          }
        />
        <RankedLegend rows={rows} highlightedId={highlighted} onToggle={toggle} />
      </div>
    );

  return (
    <SectionCard
      title="Spending by category"
      description="Percent of net income, and change vs. last month. Saving is counted in Spent."
      action={ranked.length > 0 && <Segmented label="Chart type" value={view} options={VIEWS} onChange={setView} />}
    >
      {body}
    </SectionCard>
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
    <ul className="m-0 min-w-0 flex-[1_1_320px] list-none p-0" aria-label="Spending by category">
      {rows.map((r) => {
        const on = highlightedId === r.id;
        return (
          <li key={r.id}>
            <button
              type="button"
              className={cn(
                rowButton,
                "grid min-h-11 grid-cols-[14px_minmax(80px,1fr)_auto_auto_auto] items-center gap-3 border border-solid border-transparent py-0.5",
                on && "border-primary bg-selected hover:bg-selected",
                highlightedId && !on && "opacity-55",
              )}
              data-highlighted={on || undefined}
              data-dimmed={(highlightedId && !on) || undefined}
              aria-pressed={on}
              aria-label={[r.label, r.amount, r.detail, r.changeText].filter(Boolean).join(", ")}
              onClick={() => onToggle(r.id)}
            >
              <span className="size-3 rounded-[3px]" style={{ background: r.color }} aria-hidden="true" />
              <span className="flex items-center gap-2 font-semibold" aria-hidden="true">
                {r.label}
                {r.saving && <Badge variant="saving">Saving</Badge>}
              </span>
              <span className="text-[13px] font-semibold tabular-nums" aria-hidden="true">{r.amount}</span>
              <span className="text-[13px] text-muted-foreground tabular-nums" aria-hidden="true">{r.detail}</span>
              <span className="text-[13px]" aria-hidden="true">{r.change}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
