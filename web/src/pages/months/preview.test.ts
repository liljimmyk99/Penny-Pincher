import type { Schemas } from "../../api";
import { defaultTemplate, templatePreview, undoableApply, unconfirmedCount } from "./preview";

const stamp = "2020-01-01T00:00:00Z";
const category = (id: string, name: string, is_saving = false): Schemas["Category"] => ({
  id,
  name,
  color: null,
  is_saving,
  is_protected: false,
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
});
const categories = [category("1", "Saving", true), category("2", "Housing")];
const sources: Schemas["IncomeSource"][] = [
  { id: "s1", name: "Employer A", is_protected: false, has_entries: true, sort_order: 0, created_at: stamp, updated_at: stamp },
];

const template: Schemas["Template"] = {
  id: "t1",
  name: "Standard month",
  created_at: stamp,
  updated_at: stamp,
  income_items: [
    { id: "i2", income_source_id: "s1", day_of_month: 30, gross_cents: 200000, gross_taxable_cents: 180000, net_cents: 140000, note: "Second paycheck", sort_order: 1 },
    { id: "i1", income_source_id: "s1", day_of_month: 15, gross_cents: 200000, gross_taxable_cents: 180000, net_cents: 140000, note: "Paycheck", sort_order: 0 },
  ],
  expense_items: [
    { id: "e2", category_id: "1", merchant: { id: "m2", name: "Brokerage" }, day_of_month: 15, amount_cents: 30000, note: null, sort_order: 1 },
    { id: "e1", category_id: "2", merchant: { id: "m1", name: "Rent" }, day_of_month: 1, amount_cents: 120000, note: null, sort_order: 0 },
  ],
};

function expense(id: string, merchantId: string, amount: number, confirmed = true): Schemas["Expense"] {
  return {
    id,
    date: "2020-02-01",
    amount_cents: amount,
    type: amount < 0 ? "refund" : "expense",
    category_id: "2",
    merchant: { id: merchantId, name: merchantId },
    note: null,
    refunded_expense_id: null,
    refunded_total_cents: 0,
    last_refund_date: null,
    confirmed,
    template_apply_id: null,
    import_id: null,
    created_at: stamp,
    updated_at: stamp,
  };
}

function income(id: string, note: string | null, net: number, confirmed = true): Schemas["IncomeEntry"] {
  return {
    id,
    date: "2020-02-15",
    income_source_id: "s1",
    gross_cents: net,
    gross_taxable_cents: net,
    net_cents: net,
    note,
    confirmed,
    template_apply_id: null,
    import_id: null,
    created_at: stamp,
    updated_at: stamp,
  };
}

describe("templatePreview", () => {
  it("lists paychecks and bills in day order with last month's matching figures", () => {
    const p = templatePreview(
      template,
      categories,
      sources,
      [expense("x1", "m1", 115000), expense("x2", "m3", 2000), expense("x3", "m1", -5000)],
      [income("y1", "paycheck", 139000)],
    );

    expect(p.paychecks.map((i) => [i.day, i.label, i.netCents, i.previousCents])).toEqual([
      [15, "Paycheck", 140000, 139000], // label matched case-insensitively
      [30, "Second paycheck", 140000, null],
    ]);
    expect(p.bills.map((i) => [i.day, i.merchant, i.categoryName, i.isSaving, i.previousCents])).toEqual([
      [1, "Rent", "Housing", false, 110000], // refunds at the same merchant count
      [15, "Brokerage", "Saving", true, null],
    ]);
    expect(p.totals).toMatchObject({ netCents: 280000, spentCents: 150000, savingCents: 30000, leftOverCents: 130000 });
    expect(p.previous).toEqual({ netCents: 139000, spentCents: 112000, leftOverCents: 27000 });
  });
});

describe("unconfirmedCount and undoableApply", () => {
  it("counts unconfirmed expenses and income entries", () => {
    expect(unconfirmedCount([expense("a", "m", 1, false), expense("b", "m", 1)], [income("c", null, 1, false)])).toBe(2);
  });

  it("picks the newest apply that still has copies to remove", () => {
    const apply = (id: string, unconfirmed: number): Schemas["TemplateApply"] => ({
      id,
      template_id: "t1",
      template_name: "Standard month",
      month: "2020-03",
      applied_at: stamp,
      created_expense_count: 2,
      created_income_entry_count: 1,
      unconfirmed_count: unconfirmed,
    });
    expect(undoableApply([apply("new", 0), apply("old", 2)])?.id).toBe("old");
    expect(undoableApply([apply("new", 0)])).toBeNull();
  });
});

describe("defaultTemplate", () => {
  it("prefers the first template with items", () => {
    const t = (id: string, n: number): Schemas["TemplateSummary"] => ({
      id,
      name: id,
      expense_item_count: n,
      income_item_count: 0,
      created_at: stamp,
      updated_at: stamp,
    });
    expect(defaultTemplate([t("empty", 0), t("full", 3)])?.id).toBe("full");
    expect(defaultTemplate([t("empty", 0)])?.id).toBe("empty");
    expect(defaultTemplate([])).toBeNull();
  });
});
