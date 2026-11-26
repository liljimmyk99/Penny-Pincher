import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonth, monthName, shiftMonth } from "../lib/dates";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
// Still holds .month-switcher for the Yearly and Trends year switchers (#176, #177).
import "./MonthSwitcher.css";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Previous / next month, with the month named between (web/AGENTS.md: Summary,
 * Add entries, Transactions). The name opens a picker to jump to any month:
 * a year with previous / next, then its twelve months. `month` and `onChange`
 * are `YYYY-MM` strings; callers keep them in the URL (`useMonthParam`).
 */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));

  function openChange(next: boolean) {
    if (next) setYear(Number(month.slice(0, 4)));
    setOpen(next);
  }

  function pick(m: string) {
    setOpen(false);
    if (m !== month) onChange(m);
  }

  return (
    <div
      role="group"
      aria-label="Month"
      className="inline-flex items-center gap-1 rounded-md border border-solid border-border bg-card px-1"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Previous month, ${formatMonth(shiftMonth(month, -1))}`}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="min-w-[140px] px-2 text-[15px] font-semibold" aria-label={`Choose month, ${formatMonth(month)}`}>
            <span aria-live="polite">{formatMonth(month)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 p-3" aria-label="Choose a month">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" aria-label={`Previous year, ${year - 1}`} onClick={() => setYear(year - 1)}>
              <ChevronLeft />
            </Button>
            <span className="font-semibold tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label={`Next year, ${year + 1}`} onClick={() => setYear(year + 1)}>
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => {
              const m = `${year}-${pad(i + 1)}`;
              const on = m === month;
              return (
                <Button
                  key={m}
                  variant="ghost"
                  aria-label={formatMonth(m)}
                  aria-pressed={on}
                  className={cn("font-medium", on && "bg-selected text-selected-foreground hover:bg-selected")}
                  onClick={() => pick(m)}
                >
                  {monthName(m).slice(0, 3)}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Next month, ${formatMonth(shiftMonth(month, 1))}`}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
