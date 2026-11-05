import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { formatMonth, shiftMonth } from "../lib/dates";
import "./MonthSwitcher.css";

/** Previous / next month, with the month named between (web/AGENTS.md: Summary, Add entries). */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div role="group" aria-label="Month" className="month-switcher">
      <button
        type="button"
        className="icon-btn"
        aria-label={`Previous month, ${formatMonth(shiftMonth(month, -1))}`}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeftIcon />
      </button>
      <span className="month-switcher__label" aria-live="polite">
        {formatMonth(month)}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Next month, ${formatMonth(shiftMonth(month, 1))}`}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}
