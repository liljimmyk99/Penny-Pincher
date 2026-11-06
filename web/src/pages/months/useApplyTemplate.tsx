import { useState } from "react";
import { ApiError, errorMessage, useMonthMutations, type Schemas } from "../../api";
import { ResetMonthDialog } from "./ResetMonthDialog";

type Result = Schemas["TemplateApplyResult"];

/**
 * Applying a template to a month (root AGENTS.md §6.9). An empty month is
 * copied into at once. A month with data comes back `month_not_empty`; the
 * user must then confirm that **all** of its entries are deleted, and the
 * apply is retried with `reset_month: true`.
 *
 * Returns `apply(template)`, its state, and the reset confirmation to render
 * (`confirmingReset` is true while it is open, so a caller's own dialog can step aside).
 */
export function useApplyTemplate(month: string, onApplied: (result: Result) => void) {
  const { applyTemplate } = useMonthMutations();
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<{ id: string; name: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  async function apply(template: { id: string; name: string }) {
    setError(null);
    try {
      onApplied(await applyTemplate.mutateAsync({ month, templateId: template.id }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "month_not_empty") {
        setResetError(null);
        setResetting(template);
      } else setError(errorMessage(err));
    }
  }

  async function confirmReset() {
    if (!resetting) return;
    setResetError(null);
    try {
      const result = await applyTemplate.mutateAsync({ month, templateId: resetting.id, resetMonth: true });
      setResetting(null);
      onApplied(result);
    } catch (err) {
      setResetError(errorMessage(err));
    }
  }

  const dialog = (
    <ResetMonthDialog
      month={month}
      template={resetting}
      pending={applyTemplate.isPending}
      error={resetError}
      onConfirm={() => void confirmReset()}
      onCancel={() => setResetting(null)}
    />
  );
  return { apply, pending: applyTemplate.isPending, error, dialog, confirmingReset: resetting !== null };
}
