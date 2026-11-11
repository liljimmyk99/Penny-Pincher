/**
 * M8 import acceptance tests (#100): the Excel import flow on the real stack.
 * Fixture workbooks are built in the test from generic data (support/workbooks.ts).
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import type { Api } from "../support/stack";
import { shiftMonth, todayIn } from "../support/dates";
import { asFile, cleanMultiYear, large, oneOfEachIssue, overlapping, readSheets, workbook } from "../support/workbooks";

const FILE = "past-years.xlsx";

/** The value of a review tile, e.g. tile(page, "Ready to import"). */
const tile = (page: Page, label: string) => page.locator(".tile", { has: page.locator(".tile__label", { hasText: label }) }).locator(".tile__value");

async function openImport(page: Page) {
  await page.getByRole("link", { name: "Import" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Import" })).toBeVisible();
}

async function upload(page: Page, buffer: Buffer, name = FILE) {
  await page.getByLabel("Import file").setInputFiles(asFile(name, buffer));
}

/** The month key of each month, "YYYY-MM", that has any expense or income entry for the user. */
async function entryCount(api: Api, months: string[]) {
  let n = 0;
  for (const m of months) n += (await api.expenses(m)).length + (await api.income(m)).length;
  return n;
}

test.describe("M8 import", () => {
  test("IM-1 template download, then upload: counts, every problem code and the existing-months warning", async ({ signedIn: page, api }) => {
    const source = (await api.createSource("Salary")).name;
    await api.createExpense({ date: "2024-03-01", amount_cents: 1000, category: "Food", merchant: "Hand Market" });
    await openImport(page);

    // The template: a real workbook with both sheets and the documented columns.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download template" }).click()]);
    expect(download.suggestedFilename()).toBe("penny-pincher-import.xlsx");
    const sheets = await readSheets(readFileSync((await download.path())!));
    expect(sheets["Expenses"]).toEqual(["Date", "Category", "Merchant", "Amount", "Note"]);
    expect(sheets["Income"]).toEqual(["Date", "Source", "Gross", "Gross taxable", "Net", "Note"]);

    // Upload a file with one of each problem; nothing is saved by the review.
    const f = oneOfEachIssue(source);
    await upload(page, await workbook(f.expenses, f.income));
    await expect(page.getByText("Nothing is saved yet.")).toBeVisible();
    await expect(tile(page, "Entries found")).toHaveText(String(f.ready + f.problems));
    await expect(tile(page, "Ready to import")).toHaveText(String(f.ready));
    await expect(tile(page, "Need fixing")).toHaveText(String(f.problems));
    await expect(tile(page, "Date range")).toHaveText("March 2024 – April 2024");

    for (const heading of [
      "Unknown category",
      "Unknown income source",
      "Date not recognised",
      "Missing value",
      "Not a number",
      "Too many decimals",
      "Amount is zero",
      "Negative income",
      "Gross taxable is more than gross",
      "Net is more than gross",
      "Text too long",
    ]) {
      await expect(page.getByRole("heading", { level: 3, name: new RegExp(`^${heading}`) }), heading).toBeVisible();
    }
    // A problem names its sheet and row (the header is row 1, so the first bad expense is row 5).
    await expect(page.getByText(/Expenses · row 5/)).toBeVisible();

    // March already has the hand-added expense.
    await expect(page.getByRole("note")).toContainText("March 2024 (1 existing)");
    expect(await api.expenses("2024-03")).toHaveLength(1);
    expect(await api.expenses("2024-04")).toHaveLength(0);
  });

  test("IM-2 import valid rows only: skipped rows are absent; Yearly and Summary show the months", async ({ signedIn: page, api }) => {
    const source = (await api.createSource("Salary")).name;
    const f = oneOfEachIssue(source);
    await openImport(page);
    await upload(page, await workbook(f.expenses, f.income));
    await page.getByRole("button", { name: `Import ${f.ready} entries` }).click();
    await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible();
    await expect(page.getByText(`${f.ready} entries imported from ${FILE}`)).toBeVisible();
    await expect(page.getByText(`${f.problems} rows with problems were skipped`)).toBeVisible();

    // Only the good rows exist, and they are confirmed (not flagged like template copies).
    const march = await api.expenses("2024-03");
    expect(march.map((e) => e.merchant.name).sort()).toEqual(["Corner Market", "Landlord Co"]);
    expect(march.every((e) => e.confirmed !== false && e.import_id)).toBe(true);
    expect(await api.expenses("2024-04")).toHaveLength(1);
    expect(await api.income("2024-03")).toHaveLength(1);

    await page.getByRole("link", { name: "Open Yearly" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Yearly" })).toBeVisible();
    await page.goto("/yearly?year=2024");
    const mar = page.locator(".yearly__table tbody tr", { has: page.getByRole("link", { name: "March" }) });
    await expect(mar).not.toContainText("—");
    await expect(mar).toContainText("$812.00"); // spent: 12 + 800
    await expect(mar).toContainText("$2,300.00"); // net income

    await page.goto("/summary?month=2024-03");
    await expect(page.getByRole("button", { name: /^Salary, \$2,300\.00 net, 1 entry/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Spending by category" }).getByRole("button", { name: /^Housing, \$800\.00/ })).toBeVisible();
  });

  test("IM-3 the banner follows you to other screens while running, then shows the result", async ({ signedIn: page, api }) => {
    const f = large(49000, shiftMonth(todayIn(undefined).slice(0, 7), -1));
    await openImport(page);
    await upload(page, await workbook(f.expenses, f.income), "bulk.xlsx");
    await page.getByRole("button", { name: /^Import \d+ entries$/ }).click();
    await expect(page.getByRole("progressbar", { name: "Import progress" }).first()).toBeVisible();

    // Leave the Import screen: the banner stays on top of the next one.
    await page.getByRole("link", { name: "Summary", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Summary" })).toBeVisible();
    const banner = page.getByRole("status", { name: "Import progress" });
    const result = page.getByRole("status", { name: "Import result" });
    await expect(banner.or(result)).toBeVisible();
    await expect(result).toContainText("Import finished", { timeout: 55_000 });
    await expect(result).toContainText("49,000 entries added from bulk.xlsx");

    await result.getByRole("button", { name: "Dismiss" }).click();
    await expect(result).toBeHidden();
    expect((await api.imports()).map((i) => i.status)).toContain("completed");
  });

  test("IM-4 cancel mid-run removes everything the import added", async ({ signedIn: page, api }) => {
    const f = large(49000, shiftMonth(todayIn(undefined).slice(0, 7), -1));
    await openImport(page);
    await upload(page, await workbook(f.expenses, f.income), "bulk.xlsx");
    await page.getByRole("button", { name: /^Import \d+ entries$/ }).click();
    await expect(page.getByRole("progressbar", { name: "Import progress" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel import", exact: true }).click();
    await page.getByRole("button", { name: "Cancel import and remove entries" }).click();
    await expect(page.getByRole("heading", { name: "Import cancelled" })).toBeVisible();
    await expect(page.getByText("Nothing from bulk.xlsx was saved.")).toBeVisible();

    expect(await entryCount(api, f.months)).toBe(0);
    expect((await api.imports()).find((i) => i.file_name === "bulk.xlsx")?.status).toBe("cancelled");
  });

  test("IM-5 undo removes the batch but keeps a hand-added entry in the same month", async ({ signedIn: page, api }) => {
    const source = (await api.createSource("Salary")).name;
    const month = "2024-05";
    const hand = await api.createExpense({ date: `${month}-09`, amount_cents: 777, category: "Food", merchant: "Hand Market" });
    const f = overlapping(month, source);

    await openImport(page);
    await upload(page, await workbook(f.expenses, f.income));
    await expect(page.getByRole("note")).toContainText("May 2024 (1 existing)");
    await page.getByRole("button", { name: `Import ${f.expenseCount + f.incomeCount} entries` }).click();
    await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible();
    // Added alongside, not replacing.
    expect(await api.expenses(month)).toHaveLength(1 + f.expenseCount);
    expect(await api.income(month)).toHaveLength(f.incomeCount);

    await page.getByRole("button", { name: `Undo import ${FILE}` }).click();
    await page.getByRole("button", { name: "Undo import and delete entries" }).click();
    await expect(page.getByRole("row", { name: new RegExp(FILE) }).getByText("Undone")).toBeVisible();

    const left = await api.expenses(month);
    expect(left.map((e) => e.id)).toEqual([hand.id]);
    expect(await api.income(month)).toHaveLength(0);
  });

  test.describe("IM-6 dark mode", () => {
    test.use({ colorScheme: "dark" });

    test("IM-6 the Import page, review and history are readable in dark mode", async ({ signedIn: page, api }, testInfo) => {
      const source = (await api.createSource("Salary")).name;
      const clean = cleanMultiYear(source);
      const contrast = async () =>
        (await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze()).violations.flatMap((v) =>
          v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary}`),
        );

      // One finished import, so the history table renders; then a review with problems.
      await openImport(page);
      await upload(page, await workbook(clean.expenses, clean.income), "first.xlsx");
      await page.getByRole("button", { name: /^Import \d+ entries$/ }).click();
      await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible();
      await page.getByRole("button", { name: "Import another file" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.getByRole("heading", { name: "Import history" })).toBeVisible();
      await testInfo.attach("dark import", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      expect(await contrast(), "colour-contrast on the Import page").toEqual([]);

      const bad = oneOfEachIssue(source);
      await upload(page, await workbook(bad.expenses, bad.income), "second.xlsx");
      await expect(page.getByText("Nothing is saved yet.")).toBeVisible();
      await testInfo.attach("dark import review", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      expect(await contrast(), "colour-contrast on the review").toEqual([]);
    });
  });
});
