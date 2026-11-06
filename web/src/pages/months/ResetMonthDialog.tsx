import { useMonthExpenses, useMonthIncome } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { formatMonth, monthName } from "../../lib/dates";
import { plural } from "./preview";

/** "Replace everything in <Month>?": the full-reset confirmation, with the counts that will be deleted. */
export function ResetMonthDialog({
  month,
  template,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  month: string;
  template: { name: string } | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Usually already cached by the screen; otherwise loaded when the dialog opens.
  const expenses = useMonthExpenses(month);
  const income = useMonthIncome(month);
  const name = monthName(month);
  const counts =
    expenses.data && income.data
      ? `${formatMonth(month)} already has ${plural(expenses.data.length, "expense", "expenses")} and ${plural(income.data.length, "income entry", "income entries")}.`
      : `${formatMonth(month)} already has entries.`;

  return (
    <DeleteDialog
      open={template !== null}
      title={`Replace everything in ${name}?`}
      body={`${counts} Copying “${template?.name ?? ""}” deletes all of them, confirmed or not, and replaces them with the template’s copies.`}
      extra="Undo afterwards removes only the new copies. It can’t bring back what was deleted. Refunds in other months that were linked to these expenses stay, unlinked."
      confirmLabel={`Delete all and copy template`}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
