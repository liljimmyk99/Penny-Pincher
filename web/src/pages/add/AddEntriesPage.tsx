import { MonthSwitcher } from "../../components/MonthSwitcher";
import { useMonthParam } from "../../lib/useMonthParam";
import { Page } from "../Page";
import { ExpenseBatch } from "./ExpenseBatch";
import { IncomeForm } from "./IncomeForm";
import "./AddEntriesPage.css";

/**
 * Keyboard-first logging of expenses, refunds and income (web/AGENTS.md
 * "Add entries"). The month (`?month=YYYY-MM`, default the current one) sets
 * the default date for new entries and the income "so far" panel.
 */
export function AddEntriesPage() {
  const [month, setMonth] = useMonthParam();

  return (
    <Page title="Add entries" eyebrow="Log spending & income" actions={<MonthSwitcher month={month} onChange={setMonth} />}>
      <div className="add-entries">
        <ExpenseBatch month={month} />
        <IncomeForm month={month} />
      </div>
    </Page>
  );
}
