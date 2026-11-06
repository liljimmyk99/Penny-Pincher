import { useState } from "react";
import { errorMessage, useCategoryTrends, type Schemas } from "../../api";
import { DivergingBars, type DivergingBar } from "../../charts/DivergingBars";
import { PairedBars } from "../../charts/PairedBars";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import { changeWords, describeChange } from "../../lib/change";
import { monthName, todayISO } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { ChangeBadge } from "../summary/ChangeBadge";
import "../yearly/YearlyPage.css";
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
    <div role="group" aria-label="Year" className="month-switcher">
      <button type="button" className="icon-btn" aria-label={`Previous year, ${year - 1}`} disabled={year <= MIN_YEAR} onClick={() => setYear(year - 1)}>
        <ChevronLeftIcon />
      </button>
      <span className="month-switcher__label" aria-live="polite">{year}</span>
      <button type="button" className="icon-btn" aria-label={`Next year, ${year + 1}`} disabled={year >= MAX_YEAR} onClick={() => setYear(year + 1)}>
        <ChevronRightIcon />
      </button>
    </div>
  );

  let body;
  if (trends.isPending) body = <p className="trends__status">Loading {year}…</p>;
  else if (trends.isError)
    body = (
      <p role="alert" className="alert alert--danger trends__alert">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load category trends. {errorMessage(trends.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void trends.refetch()}>Try again</button>
        </span>
      </p>
    );
  else body = <Body key={year} data={trends.data} today={today} />;

  return (
    <div className="cattrends">
      <div className="cattrends__bar">{yearSwitcher}</div>
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
    name: `${m}: ${data.year} ${formatCents(series.this_year_cents[i])}, ${data.year - 1} ${formatCents(series.last_year_cents[i])}`,
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
      change: <span className={`change change--${c.tone}`}>{c.arrow} {c.amount}</span>,
      name: `${m.series.name}, ${words}. Chart this category`,
    };
  });

  const tile = (label: string, value: string, current: number, previous: number, suffix: string) => (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      <span className="tile__sub"><ChangeBadge current={current} previous={previous} saving={saving} suffix={suffix} /></span>
    </div>
  );

  return (
    <>
      <div role="group" aria-label="Category" className="cattrends__chips">
        {[{ id: ALL, name: "All spending", saving: false }, ...data.categories.map((c) => ({ id: c.category_id as string, name: c.name, saving: c.is_saving }))].map((c) => (
          <button key={c.id} type="button" className={`chip${selected === c.id ? " is-active" : ""}`} aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
            {c.name}
            {c.saving && <span className="badge badge--saving">Saving</span>}
          </button>
        ))}
      </div>

      <div className="tiles" role="group" aria-label={`${series.name}, ${month} ${data.year}`}>
        <div className="tile">
          <span className="tile__label">{month} spend</span>
          <span className="tile__value">{formatCents(f.spend)}</span>
          <span className="tile__sub">{series.name}</span>
        </div>
        {tile("vs. previous month", formatCents(f.previousMonth), f.spend, f.previousMonth, index === 0 ? "vs. last December" : "vs. last month")}
        {tile(`vs. ${month} ${data.year - 1}`, formatCents(f.sameMonthLastYear), f.spend, f.sameMonthLastYear, `vs. ${month} ${data.year - 1}`)}
        {tile("Year to date vs. last year", formatCents(f.ytd), f.ytd, f.ytdLastYear, `vs. ${formatCents(f.ytdLastYear)} last year`)}
      </div>

      <div className="cattrends__charts">
        <section className="card cattrends__panel" aria-labelledby="cat-pairs-h">
          <div className="yearly__head">
            <h2 id="cat-pairs-h">{data.year} vs. {data.year - 1}</h2>
            <p className="yearly__desc">{series.name} per month. Select a month to compare it.</p>
          </div>
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
        </section>

        <section className="card cattrends__panel" aria-labelledby="cat-movers-h">
          <div className="yearly__head">
            <h2 id="cat-movers-h">Biggest movers</h2>
            <p className="yearly__desc">Change in {month} vs. {month} {data.year - 1}. Select a category to chart it.</p>
          </div>
          {moverRows.length === 0 ? (
            <p className="trends__status">No category changed in {month}.</p>
          ) : (
            <DivergingBars
              rows={moverRows}
              selectedId={selected}
              onSelect={(id) => setSelected((s) => (s === id ? ALL : id))}
              label={`Biggest movers, ${month} ${data.year} vs. ${data.year - 1}`}
            />
          )}
        </section>
      </div>

      <section className="card cattrends__panel" aria-labelledby="cat-table-h">
        <div className="yearly__head">
          <h2 id="cat-table-h">Month by month</h2>
          <p className="yearly__desc">{series.name}. January compares with last December.</p>
        </div>
        <div className="yearly__scroll">
          <table className="tx-table yearly__table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">Spend</th>
                <th scope="col" className="num">vs. previous month</th>
                <th scope="col" className="num">{data.year - 1}</th>
                <th scope="col" className="num">vs. {data.year - 1}</th>
                <th scope="col" className="num">Year to date</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, i) => {
                const r = monthFigures(series, i);
                const future = data.year === Number(today.slice(0, 4)) && i > Number(today.slice(5, 7)) - 1;
                const dash = <span aria-label="none">—</span>;
                return (
                  <tr key={m} className={`yearly__row${future ? " is-quiet" : ""}${i === index ? " is-selected" : ""}`} onClick={() => setIndex(i)}>
                    <th scope="row">{m}</th>
                    <td className="num">{future ? dash : formatCents(r.spend)}</td>
                    <td className="num">{future ? dash : <ChangeBadge current={r.spend} previous={r.previousMonth} saving={saving} />}</td>
                    <td className="num">{formatCents(r.sameMonthLastYear)}</td>
                    <td className="num">{future ? dash : <ChangeBadge current={r.spend} previous={r.sameMonthLastYear} saving={saving} suffix={`vs. ${m} ${data.year - 1}`} />}</td>
                    <td className="num">{future ? dash : formatCents(r.ytd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
