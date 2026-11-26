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
      {/* Side by side only when the batch table fits beside the income card, so its Note
          column is never cut off (#179). A container query, as the sidebar may be collapsed. */}
      <div className="@container">
        <div className="grid items-start gap-6 @[1080px]:grid-cols-[minmax(720px,2.2fr)_minmax(320px,1fr)]">
          <ExpenseBatch month={month} />
          <IncomeForm month={month} />
        </div>
      </div>
    </Page>
  );
}
