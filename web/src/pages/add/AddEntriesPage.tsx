import { useSearchParams } from "react-router";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { isMonth, monthOf, todayISO } from "../../lib/dates";
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
  const [params, setParams] = useSearchParams();
  const requested = params.get("month");
  const month = isMonth(requested) ? requested : monthOf(todayISO());

  return (
    <Page
      title="Add entries"
      eyebrow="Log spending & income"
      actions={
        <MonthSwitcher
          month={month}
          onChange={(next) =>
            setParams((p) => {
              p.set("month", next);
              return p;
            })
          }
        />
      }
    >
      <div className="add-entries">
        <ExpenseBatch month={month} />
        <IncomeForm month={month} />
      </div>
    </Page>
  );
}
