import { fieldErrors } from "../../api";

/** Props that mark an input invalid and point it at its error (see `FormField`). */
export function invalidProps(id: string, error?: string) {
  return error ? { "aria-invalid": true as const, "aria-describedby": `${id}-err` } : {};
}

/**
 * Splits a 400's `details` into errors for this form's fields (by the API's
 * field name) and messages for anything else.
 */
export function serverErrors<F extends string>(err: unknown, fields: Record<string, F>) {
  const byField: Partial<Record<F, string>> = {};
  const other: string[] = [];
  for (const [field, issue] of Object.entries(fieldErrors(err))) {
    const f = fields[field];
    if (f) byField[f] ??= issue;
    else other.push(issue);
  }
  return { byField, other };
}
