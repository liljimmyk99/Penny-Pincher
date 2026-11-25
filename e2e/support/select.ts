import type { Locator, Page } from "@playwright/test";

/**
 * Pick an option in one of the app's Radix Selects (#175): open the trigger,
 * then click the option. `name` is the option's text (a string or pattern),
 * or its 0-based position in the list.
 */
export async function pickOption(page: Page, trigger: Locator, name: string | RegExp | { index: number }) {
  await trigger.click();
  const options = page.getByRole("listbox").getByRole("option");
  const option = typeof name === "object" && "index" in name ? options.nth(name.index) : options.filter({ hasText: name });
  await option.first().click();
}
