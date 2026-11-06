import { useId, useState } from "react";
import { ApiError, errorMessage, useMonthMutations, type Schemas } from "../../api";
import { formatMonth, monthName } from "../../lib/dates";
import { EditDialog, FormField } from "../transactions/EditDialog";
import { invalidProps } from "../transactions/form";

/**
 * "Save this month as a template" (root AGENTS.md §6.9): copies the month's
 * expenses and income entries into a new template, each on its day of the
 * month. Refunds are skipped (the API does that).
 */
export function SaveAsTemplateDialog({
  month,
  open,
  onClose,
  onSaved,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  onSaved: (template: Schemas["Template"]) => void;
}) {
  const id = useId();
  const { saveAsTemplate } = useMonthMutations();
  const [name, setName] = useState(formatMonth(month));
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [alert, setAlert] = useState<string | null>(null);

  async function submit() {
    setFieldError(undefined);
    setAlert(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError("Enter a name for the template.");
      return;
    }
    try {
      onSaved(await saveAsTemplate.mutateAsync({ month, name: trimmed }));
    } catch (err) {
      if (err instanceof ApiError && (err.code === "name_taken" || err.details.some((d) => d.field === "name")))
        setFieldError(err.code === "name_taken" ? "You already have a template with this name." : errorMessage(err));
      else setAlert(errorMessage(err));
    }
  }

  return (
    <EditDialog
      open={open}
      title={`Save ${monthName(month)} as a template`}
      description={`Copies ${monthName(month)}’s expenses and income entries into a new template, each on its day of the month. Refunds are left out. This month doesn’t change.`}
      pending={saveAsTemplate.isPending}
      alert={alert}
      onSubmit={() => void submit()}
      onClose={onClose}
      submitLabel="Save template"
    >
      <FormField id={id} label="Template name" error={fieldError} wide>
        <input
          id={id}
          className="field"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          {...invalidProps(id, fieldError)}
        />
      </FormField>
    </EditDialog>
  );
}
