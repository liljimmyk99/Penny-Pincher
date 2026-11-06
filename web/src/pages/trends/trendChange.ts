import type { Schemas } from "../../api";
import { changeTone, type ChangeTone } from "../../lib/change";

export type Series = Schemas["CategoryTrendSeries"];

const sum = (values: number[], throughIndex: number) => values.slice(0, throughIndex + 1).reduce((a, b) => a + b, 0);

/** Figures for one series in one month (`index` 0 = January). All integer cents. */
export interface MonthFigures {
  spend: number;
  /** The previous month; January compares with last year's December. */
  previousMonth: number;
  sameMonthLastYear: number;
  ytd: number;
  ytdLastYear: number;
}

export function monthFigures(s: Series, index: number): MonthFigures {
  return {
    spend: s.this_year_cents[index],
    previousMonth: index === 0 ? s.last_year_cents[11] : s.this_year_cents[index - 1],
    sameMonthLastYear: s.last_year_cents[index],
    ytd: sum(s.this_year_cents, index),
    ytdLastYear: sum(s.last_year_cents, index),
  };
}

/** Tone of a change in a series: orange worse, blue better, flipped for Saving. */
export function seriesTone(s: Pick<Series, "is_saving">, current: number, previous: number): ChangeTone {
  return changeTone(current - previous, s.is_saving);
}

export interface Mover {
  series: Series;
  delta: number;
  tone: ChangeTone;
}

/** Every category that changed vs. the same month last year, biggest change first. */
export function biggestMovers(categories: Series[], index: number): Mover[] {
  return categories
    .map((series) => {
      const delta = series.this_year_cents[index] - series.last_year_cents[index];
      return { series, delta, tone: changeTone(delta, series.is_saving) };
    })
    .filter((m) => m.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** The month a year opens on: the current month in the current year, else December. */
export function defaultMonthIndex(year: number, today: string): number {
  return Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) - 1 : 11;
}
