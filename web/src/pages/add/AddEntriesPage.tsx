import { MonthSwitcher } from "../../components/MonthSwitcher";
import { useMonthParam } from "../../lib/useMonthParam";
import { Page } from "../Page";
import { ExpenseBatch } from "./ExpenseBatch";
import { IncomeForm } from "./IncomeForm";

/**
 * Keyboard-first logging of expenses, refunds and income (web/AGENTS.md
 * "Add entries"). The month (`?month=YYYY-MM`, default the current one) sets
 * the default date for new entries and the income "so far" panel.
 */
export function AddEntriesPage() {
  const [month, setMonth] = useMonthParam();

  return (
    <Page title="Add entries" eyebrow="Log spending & income" actions={<MonthSwitcher month={month} onChange={setMonth} />}>
      <div className="grid items-start gap-6 min-[1181px]:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <ExpenseBatch month={month} />
        <IncomeForm month={month} />
      </div>
    </Page>
  );
}
