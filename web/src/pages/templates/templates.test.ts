import type { Schemas } from "../../api";
import { expensePatch, incomePatch, parseDay, validateExpense, validateIncome } from "./itemForms";
import { groupByCategory, templateTotals } from "./totals";

const stamp = "2026-01-01T00:00:00Z";

const category = (id: string, name: string, extra: Partial<Schemas["Category"]> = {}): Schemas["Category"] => ({
  id,
  name,
  color: null,
  is_saving: false,
  is_protected: false,
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

const expense = (id: string, categoryId: string, amount: number, sort = Number(id)): Schemas["TemplateExpenseItem"] => ({
  id,
  category_id: categoryId,
  merchant: { id: `m${id}`, name: `Merchant ${id}` },
  day_of_month: 1,
  amount_cents: amount,
  note: null,
  sort_order: sort,
});

const income = (id: string, gross: number, taxable: number, net: number): Schemas["TemplateIncomeItem"] => ({
  id,
  income_source_id: "s1",
  day_of_month: 15,
  gross_cents: gross,
  gross_taxable_cents: taxable,
  net_cents: net,
  note: null,
  sort_order: Number(id),
});

const categories = [category("1", "Saving", { is_saving: true }), category("2", "Housing"), category("9", "Other", { is_protected: true })];

describe("templateTotals", () => {
  it("sums income and spending in cents, counting Saving as spending", () => {
    const tpl: Schemas["Template"] = {
      id: "t",
      name: "T",
      created_at: stamp,
      updated_at: stamp,
      income_items: [income("1", 300000, 280000, 210010), income("2", 5000, 5000, 4990)],
      expense_items: [expense("1", "1", 50000), expense("2", "2", 120001)],
    };
    expect(templateTotals(tpl, categories)).toEqual({
      grossCents: 305000,
      grossTaxableCents: 285000,
      netCents: 215000,
      spentCents: 170001,
      savingCents: 50000,
      leftOverCents: 44999,
    });
  });
});

describe("groupByCategory", () => {
  it("lists every category in order, items by sort order, unknown categories under Other", () => {
    const groups = groupByCategory(
      [expense("1", "2", 100, 20), expense("2", "2", 200, 10), expense("3", "gone", 50)],
      categories,
    );
    expect(groups.map((g) => [g.category.name, g.items.map((i) => i.id), g.subtotalCents])).toEqual([
      ["Saving", [], 0],
      ["Housing", ["2", "1"], 300],
      ["Other", ["3"], 50],
    ]);
  });
});

describe("item forms", () => {
  it("accepts days 1–31 only", () => {
    expect(["1", "31", " 9 "].map(parseDay)).toEqual([1, 31, 9]);
    expect(["0", "32", "1.5", "", "x"].map(parseDay)).toEqual([null, null, null, null, null]);
  });

  it("validates an expense item into a create body", () => {
    expect(validateExpense({ merchant: " Rent ", categoryId: "2", day: "1", amount: "1,450.00", note: " " })).toEqual({
      ok: true,
      value: { merchant_name: "Rent", category_id: "2", day_of_month: 1, amount_cents: 145000, note: null },
    });
    const bad = validateExpense({ merchant: "", categoryId: "2", day: "40", amount: "-5", note: "" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && Object.keys(bad.errors)).toEqual(["merchant", "day", "amount"]);
  });

  it("validates an income item, keeping taxable and net within gross", () => {
    expect(
      validateIncome({ sourceId: "s1", label: "", day: "15", gross: "100", taxable: "90", net: "75.5" }),
    ).toEqual({
      ok: true,
      value: {
        income_source_id: "s1",
        note: null,
        day_of_month: 15,
        gross_cents: 10000,
        gross_taxable_cents: 9000,
        net_cents: 7550,
      },
    });
    const bad = validateIncome({ sourceId: "s1", label: "x", day: "1", gross: "100", taxable: "101", net: "200" });
    expect(!bad.ok && bad.errors).toEqual({
      taxable: "Gross taxable can’t be more than gross.",
      net: "Net can’t be more than gross.",
    });
  });

  it("patches only what changed", () => {
    const item = expense("1", "2", 1000);
    expect(
      expensePatch(item, {
        merchant_name: "Merchant 1",
        category_id: "1",
        day_of_month: 1,
        amount_cents: 1000,
        note: "Music",
      }),
    ).toEqual({ category_id: "1", note: "Music" });
    const inc = income("1", 100, 90, 80);
    expect(
      incomePatch(inc, {
        income_source_id: "s1",
        note: "Paycheck",
        day_of_month: 15,
        gross_cents: 100,
        gross_taxable_cents: 90,
        net_cents: 80,
      }),
    ).toEqual({ note: "Paycheck" });
  });
});
