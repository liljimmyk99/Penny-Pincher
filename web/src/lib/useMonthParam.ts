import { useSearchParams } from "react-router";
import { isMonth, monthOf, todayISO } from "./dates";

/**
 * The month a month-based screen shows: `?month=YYYY-MM` in the address,
 * defaulting to the current month. Summary, Add entries and Transactions all
 * read it, so a link that carries `?month=` opens any of them on that month.
 * Changing it keeps the screen's other search params.
 */
export function useMonthParam(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get("month");
  const month = isMonth(requested) ? requested : monthOf(todayISO());
  const setMonth = (next: string) =>
    setParams((p) => {
      p.set("month", next);
      return p;
    });
  return [month, setMonth];
}
