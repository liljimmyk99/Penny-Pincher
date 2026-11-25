import { useId, type ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** The props a FormField hands its control so the label, hint and error are wired to it. */
export interface FieldControlProps {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/**
 * A labelled form control with an optional hint and error (#169). The control
 * gets the id the label points at, `aria-invalid` when there is an error, and
 * `aria-describedby` naming the hint, the error and any `describedBy` ids (an
 * alert above the form, say). Feed `error` from `fieldErrors(err)[field]`.
 *
 *   <FormField label="Note" error={errors.note}>
 *     {(control) => <Input {...control} value={note} onChange={…} />}
 *   </FormField>
 */
export function FormField({
  label,
  description,
  error,
  invalid,
  describedBy,
  className,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** The message shown under the control; it also marks the control invalid. */
  error?: string;
  /** Marks the control invalid without a message of its own (the message is elsewhere). */
  invalid?: boolean;
  /** Ids of other elements that describe the control. */
  describedBy?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const isInvalid = Boolean(error) || Boolean(invalid);
  const describedByIds = [descriptionId, errorId, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <Field data-invalid={isInvalid || undefined} className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({ id, "aria-invalid": isInvalid || undefined, "aria-describedby": describedByIds })}
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
