import { useState } from "react";
import { errorMessage, useCategoryTrends, type Schemas } from "../../api";
import { DivergingBars, type DivergingBar } from "../../charts/DivergingBars";
import { PairedBars } from "../../charts/PairedBars";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChangeBadge, ChangeText } from "@/components/ChangeBadge";
import { LoadError } from "@/components/LoadError";
import { LoadingSection } from "@/components/LoadingSection";
import { SectionCard } from "@/components/SectionCard";
import { StatTile, TileRow } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { changeWords, describeChange } from "../../lib/change";
import { showSavingBadge } from "../../charts/rowNames";
import { monthName, todayISO } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { biggestMovers, defaultMonthIndex, monthFigures, type Series } from "./trendChange";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MONTHS = Array.from({ length: 12 }, (_, i) => monthName(`2000-${String(i + 1).padStart(2, "0")}`));
const ALL = "all";

type Trends = Schemas["CategoryTrends"];

/** Trends → By category (web/AGENTS.md "Trends"). */
export function CategoryTrends() {
  const today = todayISO();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const trends = useCategoryTrends(year);

  const yearSwitcher = (
    <div role="group" aria-label="Year" className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label={`Previous year, ${year - 1}`} disabled={year <= MIN_YEAR} onClick={() => setYear(year - 1)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="min-w-14 text-center font-semibold tabular-nums" aria-live="polite">{year}</span>
      <Button variant="outline" size="icon" aria-label={`Next year, ${year + 1}`} disabled={year >= MAX_YEAR} onClick={() => setYear(year + 1)}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );

  let body;
  if (trends.isPending) body = <LoadingSection label={String(year)} rows={4} />;
  else if (trends.isError)
    body = <LoadError message={`Couldn’t load category trends. ${errorMessage(trends.error)}`} onRetry={() => void trends.refetch()} />;
  else body = <Body key={year} data={trends.data} today={today} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{yearSwitcher}</div>
      {body}
    </div>
  );
}

function Body({ data, today }: { data: Trends; today: string }) {
  const [selected, setSelected] = useState<string>(ALL);
  const [index, setIndex] = useState(() => defaultMonthIndex(data.year, today));

  const series: Series = selected === ALL ? data.all_spending : (data.categories.find((c) => c.category_id === selected) ?? data.all_spending);
  const f = monthFigures(series, index);
  const month = MONTHS[index];
  const saving = series.is_saving;

  const groups = MONTHS.map((m, i) => ({
    id: String(i),
    label: m.slice(0, 3),
    a: series.this_year_cents[i],
    b: series.last_year_cents[i],
    // Starts with the visible label ("Jan"), so the name contains it (WCAG 2.5.3, #179).
    name: `${m.slice(0, 3)}: ${data.year} ${formatCents(series.this_year_cents[i])}, ${data.year - 1} ${formatCents(series.last_year_cents[i])}`,
  }));

  const movers = biggestMovers(data.categories, index);
  const moverRows: DivergingBar[] = movers.map((m) => {
    const c = describeChange(m.series.this_year_cents[index], m.series.last_year_cents[index], m.series.is_saving);
    const words = changeWords(m.series.this_year_cents[index], m.series.last_year_cents[index], m.series.is_saving).replace("last month", `${month} ${data.year - 1}`);
    return {
      id: m.series.category_id ?? m.series.name,
      label: m.series.name,
      delta: m.delta,
      tone: m.tone,
      saving: m.series.is_saving,
      change: <ChangeText tone={c.tone} text={`${c.arrow} ${c.amount}`} />,
      name: `${m.series.name}${showSavingBadge({ label: m.series.name, saving: m.series.is_saving }) ? ", Saving" : ""}, ${words}. Chart this category`,
    };
  });

  const tile = (label: string, value: string, current: number, previous: number, suffix: string) => (
    <StatTile label={label} value={value} sub={<ChangeBadge current={current} previous={previous} saving={saving} suffix={suffix} />} />
  );

  return (
    <>
      <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
        {[{ id: ALL, name: "All spending", saving: false }, ...data.categories.map((c) => ({ id: c.category_id as string, name: c.name, saving: c.is_saving }))].map((c) => (
          <Toggle
            key={c.id}
            variant="outline"
            pressed={selected === c.id}
            onPressedChange={() => setSelected(c.id)}
            className="rounded-full px-4 text-foreground data-[state=on]:border-primary"
          >
            {c.name}
            {c.saving && <Badge variant="saving">Saving</Badge>}
          </Toggle>
        ))}
      </div>

      <TileRow label={`${series.name}, ${month} ${data.year}`}>
        <StatTile label={`${month} spend`} value={formatCents(f.spend)} sub={series.name} />
        {tile("vs. previous month", formatCents(f.previousMonth), f.spend, f.previousMonth, index === 0 ? "vs. last December" : "vs. last month")}
        {tile(`vs. ${month} ${data.year - 1}`, formatCents(f.sameMonthLastYear), f.spend, f.sameMonthLastYear, `vs. ${month} ${data.year - 1}`)}
        {tile("Year to date vs. last year", formatCents(f.ytd), f.ytd, f.ytdLastYear, `vs. ${formatCents(f.ytdLastYear)} last year`)}
      </TileRow>

      <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard title={`${data.year} vs. ${data.year - 1}`} description={`${series.name} per month. Select a month to compare it.`}>
          <PairedBars
            groups={groups}
            aName={String(data.year)}
            bName={String(data.year - 1)}
            variant="years"
            selectedId={String(index)}
            onSelect={(id) => setIndex(Number(id))}
            label={`${series.name} per month, ${data.year} and ${data.year - 1}`}
            summary={`${series.name}: ${data.year} year to date ${formatCents(f.ytd)}, ${data.year - 1} ${formatCents(f.ytdLastYear)}.`}
          />
        </SectionCard>

        <SectionCard title="Biggest movers" description={`Change in ${month} vs. ${month} ${data.year - 1}. Select a category to chart it.`}>
          {moverRows.length === 0 ? (
            <p className="m-0 text-muted-foreground">No category changed in {month}.</p>
          ) : (
            <DivergingBars
              rows={moverRows}
              selectedId={selected}
              onSelect={(id) => setSelected((s) => (s === id ? ALL : id))}
              label={`Biggest movers, ${month} ${data.year} vs. ${data.year - 1}`}
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Month by month" description={`${series.name}. January compares with last December.`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Month</TableHead>
              <TableHead scope="col" numeric>Spend</TableHead>
              <TableHead scope="col" numeric>vs. previous month</TableHead>
              <TableHead scope="col" numeric>{data.year - 1}</TableHead>
              <TableHead scope="col" numeric>vs. {data.year - 1}</TableHead>
              <TableHead scope="col" numeric>Year to date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MONTHS.map((m, i) => {
              const r = monthFigures(series, i);
              const future = data.year === Number(today.slice(0, 4)) && i > Number(today.slice(5, 7)) - 1;
              const dash = <span aria-label="none">—</span>;
              return (
                <TableRow
                  key={m}
                  data-future={future || undefined}
                  data-selected={i === index || undefined}
                  className={cn("cursor-pointer", future && "text-muted-foreground", i === index && "bg-selected hover:bg-selected")}
                  onClick={() => setIndex(i)}
                >
                  <TableHead scope="row" className="text-inherit">{m}</TableHead>
                  <TableCell numeric>{future ? dash : formatCents(r.spend)}</TableCell>
                  <TableCell numeric>{future ? dash : <ChangeBadge current={r.spend} previous={r.previousMonth} saving={saving} />}</TableCell>
                  <TableCell numeric>{formatCents(r.sameMonthLastYear)}</TableCell>
                  <TableCell numeric>{future ? dash : <ChangeBadge current={r.spend} previous={r.sameMonthLastYear} saving={saving} suffix={`vs. ${m} ${data.year - 1}`} />}</TableCell>
                  <TableCell numeric>{future ? dash : formatCents(r.ytd)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}
