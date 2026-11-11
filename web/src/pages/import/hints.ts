import { ApiError, errorMessage, type Schemas } from "../../api";

type Code = Schemas["ImportIssue"]["code"];

/** Heading and fix hint for each problem code (clients word issues by `code`). */
export const ISSUE_TEXT: Record<Code, { title: string; hint: string }> = {
  unknown_category: {
    title: "Unknown category",
    hint: "Pick one of your categories from the dropdown, or add the category first. Categories are never created for you.",
  },
  unknown_income_source: {
    title: "Unknown income source",
    hint: "Pick one of your income sources from the dropdown, or add the source first.",
  },
  invalid_date: { title: "Date not recognised", hint: "Use a real date such as 2024-03-15." },
  missing_value: { title: "Missing value", hint: "Fill in every required column." },
  invalid_number: { title: "Not a number", hint: "Amounts are plain numbers in dollars, for example 12.50." },
  too_many_decimals: { title: "Too many decimals", hint: "Amounts have at most two decimal places." },
  zero_amount: { title: "Amount is zero", hint: "Remove the row or enter an amount. Refunds are negative." },
  negative_income: { title: "Negative income", hint: "Income amounts can't be negative." },
  taxable_exceeds_gross: { title: "Gross taxable is more than gross", hint: "Gross taxable can't exceed gross." },
  net_exceeds_gross: { title: "Net is more than gross", hint: "Net can't exceed gross." },
  text_too_long: { title: "Text too long", hint: "Shorten the merchant or note." },
};

export const MAX_SHOWN = 5;

/** "m:ss" or "about N min" for the time left. */
export function timeLeft(seconds: number | null | undefined): string {
  if (seconds == null) return "Estimating…";
  if (seconds < 5) return "A few seconds left";
  if (seconds < 90) return `${Math.round(seconds)} s left`;
  return `About ${Math.round(seconds / 60)} min left`;
}

/** Inline message for the two upload failures the spec names; anything else uses the server's text. */
export function uploadErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_import_file")
      return "That file isn't the import template. Download the template, fill it in and upload it again.";
    if (err.code === "file_too_large") return "That file is over 10 MB. Split it into smaller files and upload them one at a time.";
  }
  return errorMessage(err);
}

