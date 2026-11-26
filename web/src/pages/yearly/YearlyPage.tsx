import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { errorMessage, useYearlySummary } from "../../api";
import { PairedBars } from "../../charts/PairedBars";
import { RankedBars, type RankedBar } from "../../charts/RankedBars";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { LoadError } from "../../components/LoadError";
import { SectionCard } from "../../components/SectionCard";
import { StatTile } from "../../components/StatTile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { monthName, todayISO } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { categoryColor } from "../summary/summary";
import { Page } from "../Page";
import { averageCents, rankedAverages, type Yearly } from "./yearly";

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
  if (summary.isPending) body = <p className="m-0 text-muted-foreground">Loading {year}…</p>;
  else if (summary.isError)
    body = <LoadError message={`Couldn’t load the yearly summary. ${errorMessage(summary.error)}`} onRetry={() => void summary.refetch()} />;
  else body = <YearlyBody key={year} data={summary.data} />;

  return (
    <Page
      title="Yearly"
      eyebrow={String(year)}
      actions={
        <div role="group" aria-label="Year" className="month-switcher">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Previous year, ${year - 1}`}
            disabled={year <= MIN_YEAR}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <span className="month-switcher__label" aria-live="polite">{year}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Next year, ${year + 1}`}
            disabled={year >= MAX_YEAR}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
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
  const tone = (t: "income" | "saving" | "default") => (empty ? "muted" : t);
  const avg = (cents: number) => `${formatCents(averageCents(cents, n))} / month`;

  return (
    <>
      <div className="flex flex-wrap gap-4" role="group" aria-label={`${data.year} totals`}>
        <StatTile label="Net income" value={formatCents(totals.net_cents)} tone={tone("income")} sub={`${avg(totals.net_cents)} average`} />
        <StatTile label="Spent" value={formatCents(totals.spent_cents)} tone={tone("default")} sub={`${avg(totals.spent_cents)} average`} />
        <StatTile
          label="Saved & invested"
          value={formatCents(totals.saving_cents)}
          tone={tone("saving")}
          sub={`Counted in Spent · ${avg(totals.saving_cents)}`}
        />
        <StatTile label="Left over" value={formatCents(totals.left_over_cents)} tone={tone("default")} sub={`${avg(totals.left_over_cents)} average`} />
      </div>

      {empty && (
        <p className="m-0 text-muted-foreground">
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
    <SectionCard flush id="yearly-pairs-h" title="Income vs. spent" description="Net income and spending per month. Select a month to open its summary.">
      <PairedBars
        groups={groups}
        aName="Net income"
        bName="Spent"
        label="Net income and spent per month"
        summary={`${data.year}: net income ${formatCents(data.totals.net_cents)}, spent ${formatCents(data.totals.spent_cents)}.`}
        onSelect={(month) => void navigate(`/summary?month=${month}`)}
      />
    </SectionCard>
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
    <SectionCard flush
      id="yearly-cats-h"
      title="Monthly average by category"
      description={
        <>
          Averaged over the {data.average_month_count} {data.average_month_count === 1 ? "month" : "months"} with entries.
          Saving is counted in Spent.
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 px-6 text-muted-foreground">No spending logged in {data.year}.</p>
      ) : (
        <RankedBars
          rows={rows}
          highlightedId={highlighted}
          onToggle={(id) => setHighlighted((h) => (h === id ? null : id))}
          label="Monthly average spending by category"
        />
      )}
    </SectionCard>
  );
}

function MonthTable({ data }: { data: Yearly }) {
  const navigate = useNavigate();
  const n = data.average_month_count;
  const { totals } = data;
  const cell = (cents: number, has: boolean) => (has ? formatCents(cents) : <span aria-label="none">—</span>);
  return (
    <SectionCard flush id="yearly-table-h" title="Month by month" description="Select a month to open its summary.">
      <Table aria-labelledby="yearly-table-h" className="min-w-[520px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="pl-6">Month</TableHead>
            <TableHead scope="col" numeric>Net income</TableHead>
            <TableHead scope="col" numeric>Spent</TableHead>
            <TableHead scope="col" numeric className="pr-6">Left over</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.months.map((m) => (
            // The whole row opens the month (§6.10); the month's link is the keyboard and screen-reader path.
            <TableRow
              key={m.month}
              data-quiet={m.has_entries ? undefined : true}
              className={cn("cursor-pointer", !m.has_entries && "text-muted-foreground")}
              onClick={() => void navigate(`/summary?month=${m.month}`)}
            >
              <TableHead scope="row" className="pl-6 font-bold text-foreground">
                <Link to={`/summary?month=${m.month}`} onClick={(e) => e.stopPropagation()}>
                  {monthName(m.month)}
                </Link>
              </TableHead>
              <TableCell numeric className="text-income">{cell(m.net_cents, m.has_entries)}</TableCell>
              <TableCell numeric>{cell(m.spent_cents, m.has_entries)}</TableCell>
              <TableCell numeric className="pr-6">{cell(m.left_over_cents, m.has_entries)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="font-bold">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" className="pl-6 text-foreground">Total</TableHead>
            <TableCell numeric className="text-income">{formatCents(totals.net_cents)}</TableCell>
            <TableCell numeric>{formatCents(totals.spent_cents)}</TableCell>
            <TableCell numeric className="pr-6">{formatCents(totals.left_over_cents)}</TableCell>
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" className="pl-6 text-foreground">Monthly average</TableHead>
            <TableCell numeric className="text-income">{formatCents(averageCents(totals.net_cents, n))}</TableCell>
            <TableCell numeric>{formatCents(averageCents(totals.spent_cents, n))}</TableCell>
            <TableCell numeric className="pr-6">{formatCents(averageCents(totals.left_over_cents, n))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </SectionCard>
  );
}
