import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { TransactionsPage } from "../transactions/TransactionsPage";

/**
 * The template-copy flow on Transactions (root AGENTS.md §6.9, web/AGENTS.md
 * "Empty states → New month"): offer, copy, unconfirmed styling, per-row and
 * bulk confirm, undo, the full-reset confirmation, and save as template.
 */

const MONTH = "2020-04";
const PREVIOUS = "2020-03";
const stamp = "2020-01-01T00:00:00Z";

const category = (id: string, name: string, is_saving = false): Schemas["Category"] => ({
  id,
  name,
  color: null,
  is_saving,
  is_protected: id === "9",
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
});
const source = (id: string, name: string): Schemas["IncomeSource"] => ({
  id,
  name,
  is_protected: id === "9",
  has_entries: false,
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
});

function standardMonth(): Schemas["Template"] {
  return {
    id: "t1",
    name: "Standard month",
    created_at: stamp,
    updated_at: stamp,
    income_items: [
      { id: "ti1", income_source_id: "1", day_of_month: 15, gross_cents: 300000, gross_taxable_cents: 280000, net_cents: 210000, note: "Paycheck", sort_order: 0 },
    ],
    expense_items: [
      { id: "te1", category_id: "2", merchant: { id: "m1", name: "Rent" }, day_of_month: 1, amount_cents: 120000, note: null, sort_order: 0 },
      { id: "te2", category_id: "1", merchant: { id: "m2", name: "Brokerage" }, day_of_month: 31, amount_cents: 30000, note: null, sort_order: 1 },
    ],
  };
}

function expense(id: string, date: string, merchant: Schemas["Merchant"], amount: number, extra: Partial<Schemas["Expense"]> = {}): Schemas["Expense"] {
  return {
    id,
    date,
    amount_cents: amount,
    type: amount < 0 ? "refund" : "expense",
    category_id: "2",
    merchant,
    note: null,
    refunded_expense_id: null,
    refunded_total_cents: 0,
    last_refund_date: null,
    confirmed: true,
    template_apply_id: null,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

function income(id: string, date: string, net: number, extra: Partial<Schemas["IncomeEntry"]> = {}): Schemas["IncomeEntry"] {
  return {
    id,
    date,
    income_source_id: "1",
    gross_cents: 300000,
    gross_taxable_cents: 280000,
    net_cents: net,
    note: "Paycheck",
    confirmed: true,
    template_apply_id: null,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

type State = ReturnType<typeof fakeBackend>["state"];

/** Enough of the API for the flow; template copies are made the way the backend makes them. */
function fakeBackend(setup?: (state: State) => void) {
  const state = {
    categories: [category("1", "Saving", true), category("2", "Housing"), category("9", "Other")],
    sources: [source("1", "Employer A"), source("9", "Other")],
    templates: [standardMonth()],
    expenses: [expense("p1", `${PREVIOUS}-01`, { id: "m1", name: "Rent" }, 118000)] as Schemas["Expense"][],
    income: [income("p2", `${PREVIOUS}-15`, 205000)] as Schemas["IncomeEntry"][],
    applies: [] as Schemas["TemplateApply"][],
    saveError: null as null | { status: number; body: unknown },
  };
  setup?.(state as State);
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 1;

  const inMonth = (date: string, month: string) => date.startsWith(month);
  const lastDay = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };
  const onDay = (month: string, day: number) => `${month}-${String(Math.min(day, lastDay(month))).padStart(2, "0")}`;
  const unconfirmedOf = (applyId: string) =>
    state.expenses.filter((e) => e.template_apply_id === applyId && !e.confirmed).length +
    state.income.filter((e) => e.template_apply_id === applyId && !e.confirmed).length;
  const applyView = (a: Schemas["TemplateApply"]) => ({ ...a, unconfirmed_count: unconfirmedOf(a.id) });
  const summary = (t: Schemas["Template"]): Schemas["TemplateSummary"] => ({
    id: t.id,
    name: t.name,
    expense_item_count: t.expense_items.length,
    income_item_count: t.income_items.length,
    created_at: stamp,
    updated_at: stamp,
  });
  const err = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const q = url.searchParams;
    const body = req.method === "POST" || req.method === "PATCH" ? await req.json().catch(() => undefined) : undefined;
    if (req.method !== "GET") calls.push({ method: req.method, path, body });

    if (req.method === "GET") {
      if (path === "/v1/categories") return Response.json({ items: state.categories });
      if (path === "/v1/income-sources") return Response.json({ items: state.sources });
      if (path === "/v1/templates") return Response.json({ items: state.templates.map(summary) });
      const t = /^\/v1\/templates\/(\w+)$/.exec(path);
      if (t) {
        const found = state.templates.find((x) => x.id === t[1]);
        return found ? Response.json(found) : err(404, "not_found", "Not found.");
      }
      if (path === "/v1/template-applies")
        return Response.json({ items: state.applies.filter((a) => a.month === q.get("month")).map(applyView) });
      if (path === "/v1/expenses") {
        const items = state.expenses.filter((e) => inMonth(e.date, q.get("month") ?? "")).sort((a, b) => b.date.localeCompare(a.date));
        return Response.json({ items, next_cursor: null });
      }
      if (path === "/v1/income-entries") {
        const items = state.income.filter((e) => inMonth(e.date, q.get("month") ?? "")).sort((a, b) => b.date.localeCompare(a.date));
        return Response.json({ items, next_cursor: null });
      }
      if (path === "/v1/merchants") return Response.json({ items: [], next_cursor: null });
    }

    const apply = /^\/v1\/months\/([\d-]+)\/apply-template$/.exec(path);
    if (req.method === "POST" && apply) {
      const month = apply[1];
      const { template_id, reset_month } = body as { template_id: string; reset_month?: boolean };
      const template = state.templates.find((t) => t.id === template_id)!;
      const hasData = state.expenses.some((e) => inMonth(e.date, month)) || state.income.some((e) => inMonth(e.date, month));
      if (hasData && !reset_month) return err(409, "month_not_empty", "This month already has entries.");
      const removedExpenses = state.expenses.filter((e) => inMonth(e.date, month)).length;
      const removedIncome = state.income.filter((e) => inMonth(e.date, month)).length;
      state.expenses = state.expenses.filter((e) => !inMonth(e.date, month));
      state.income = state.income.filter((e) => !inMonth(e.date, month));
      state.applies = state.applies.filter((a) => a.month !== month);
      const id = `a${nextId++}`;
      for (const i of template.expense_items)
        state.expenses.push(
          expense(`c${nextId++}`, onDay(month, i.day_of_month), i.merchant, i.amount_cents, {
            category_id: i.category_id,
            confirmed: false,
            template_apply_id: id,
          }),
        );
      for (const i of template.income_items)
        state.income.push(
          income(`c${nextId++}`, onDay(month, i.day_of_month), i.net_cents, {
            income_source_id: i.income_source_id,
            note: i.note,
            confirmed: false,
            template_apply_id: id,
          }),
        );
      const a: Schemas["TemplateApply"] = {
        id,
        template_id,
        template_name: template.name,
        month,
        applied_at: stamp,
        created_expense_count: template.expense_items.length,
        created_income_entry_count: template.income_items.length,
        unconfirmed_count: 0,
      };
      state.applies.unshift(a);
      return Response.json(
        { ...applyView(a), removed_expense_count: removedExpenses, removed_income_entry_count: removedIncome },
        { status: 201 },
      );
    }
    const undo = /^\/v1\/template-applies\/(\w+)\/undo$/.exec(path);
    if (req.method === "POST" && undo) {
      const gone = (e: { template_apply_id: string | null; confirmed: boolean }) => e.template_apply_id === undo[1] && !e.confirmed;
      const removed = { removed_expense_count: state.expenses.filter(gone).length, removed_income_entry_count: state.income.filter(gone).length };
      state.expenses = state.expenses.filter((e) => !gone(e));
      state.income = state.income.filter((e) => !gone(e));
      return Response.json(removed);
    }
    const confirmAll = /^\/v1\/months\/([\d-]+)\/confirm-all$/.exec(path);
    if (req.method === "POST" && confirmAll) {
      let ce = 0;
      let ci = 0;
      for (const e of state.expenses)
        if (inMonth(e.date, confirmAll[1]) && !e.confirmed) {
          e.confirmed = true;
          ce++;
        }
      for (const e of state.income)
        if (inMonth(e.date, confirmAll[1]) && !e.confirmed) {
          e.confirmed = true;
          ci++;
        }
      return Response.json({ confirmed_expense_count: ce, confirmed_income_entry_count: ci });
    }
    const save = /^\/v1\/months\/([\d-]+)\/save-as-template$/.exec(path);
    if (req.method === "POST" && save) {
      if (state.saveError) return Response.json(state.saveError.body, { status: state.saveError.status });
      const t = { ...standardMonth(), id: `t${nextId++}`, name: (body as { name: string }).name };
      state.templates.push(t);
      return Response.json(t, { status: 201 });
    }
    const entry = /^\/v1\/(expenses|income-entries)\/(\w+)$/.exec(path);
    if (req.method === "PATCH" && entry) {
      const list = (entry[1] === "expenses" ? state.expenses : state.income) as { id: string; confirmed: boolean }[];
      const index = list.findIndex((e) => e.id === entry[2]);
      list[index] = { ...list[index], confirmed: true, ...(body as object) };
      return Response.json(list[index]);
    }
    return err(404, "not_found", `No route ${req.method} ${path}`);
  }

  return { state, calls, fetch: vi.fn((req: Request) => handle(req)) };
}

function renderPage(setup?: (state: State) => void, month = MONTH) {
  const backend = fakeBackend(setup);
  const client = createApiClient({
    baseUrl: "http://api.test",
    getToken: async () => "tok",
    fetch: backend.fetch as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[`/transactions?month=${month}`]}>
        <Routes>
          <Route path="/transactions" element={<TransactionsPage />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  return { backend, user: userEvent.setup() };
}

const posts = (backend: ReturnType<typeof fakeBackend>, re: RegExp) => backend.calls.filter((c) => c.method === "POST" && re.test(c.path));
const offer = () => screen.findByRole("region", { name: "Start April from your template?" });
const banner = () => screen.findByRole("region", { name: "Unconfirmed items" });
const expenseRows = () => within(within(screen.getByRole("region", { name: /^Expenses/ })).getByRole("table")).getAllByRole("row").slice(1);
const incomeRows = () => within(within(screen.getByRole("region", { name: /^Income/ })).getByRole("table")).getAllByRole("row").slice(1, -1);

async function copyTemplate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(await offer()).getByRole("button", { name: "Copy into April" }));
  await banner();
}

describe("new month: start from a template", () => {
  it("offers the template with a preview of its paychecks and bills, beside last month", async () => {
    renderPage();
    const card = await offer();

    const paychecks = await within(card).findByRole("table", { name: /^Paychecks/ });
    expect(within(paychecks).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "DayItemNetMarch",
      "15Employer APaycheck$2,100.00$2,050.00",
      "Total$2,100.00",
    ]);
    const bills = within(card).getByRole("table", { name: /^Bills/ });
    expect(within(bills).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "DayItemAmountMarch",
      "1RentHousing$1,200.00$1,180.00",
      "31BrokerageSaving$300.00—",
      "Total$1,500.00",
    ]);
    expect(within(card).getByRole("group", { name: "Standard month totals" })).toHaveTextContent(
      "Planned net income$2,100.00March: $2,050.00Planned spending$1,500.00March: $1,180.00Left over$600.00March: $870.00",
    );
    expect(within(card).getByRole("link", { name: "Edit template" })).toHaveAttribute("href", "/templates?template=t1");
  });

  it("copies the template as unconfirmed entries, flagged until checked", async () => {
    const { backend, user } = renderPage();
    await copyTemplate(user);

    expect(posts(backend, /apply-template$/)).toEqual([
      { method: "POST", path: `/v1/months/${MONTH}/apply-template`, body: { template_id: "t1", reset_month: false } },
    ]);
    expect(await banner()).toHaveTextContent("3 items copied from “Standard month” · unconfirmed until you check each one.");
    expect(screen.getByText("Copied 3 items into April")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /from your template/ })).not.toBeInTheDocument();

    // Day 31 lands on April 30 (the backend clamps; the client shows its date).
    await waitFor(() => expect(expenseRows()).toHaveLength(2));
    for (const row of [...expenseRows(), ...incomeRows()]) {
      expect(row).toHaveClass("is-unconfirmed");
      expect(row).toHaveTextContent("Unconfirmed · from template");
    }
    expect(expenseRows()[0]).toHaveTextContent("Apr 30Brokerage");
  });

  it("confirms one row, then the rest with Confirm all as-is", async () => {
    const { backend, user } = renderPage();
    await copyTemplate(user);
    await waitFor(() => expect(expenseRows()).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: /^Confirm expense Rent/ }));
    expect(backend.calls.at(-1)).toMatchObject({ method: "PATCH", body: { confirmed: true } });
    await waitFor(() => expect(expenseRows()[1]).not.toHaveClass("is-unconfirmed"));
    expect(within(expenseRows()[1]).queryByRole("button", { name: /^Confirm/ })).not.toBeInTheDocument();
    expect(await banner()).toHaveTextContent(/^2 items copied/);

    await user.click(within(await banner()).getByRole("button", { name: "Confirm all as-is" }));
    expect(posts(backend, /confirm-all$/)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unconfirmed items" })).not.toBeInTheDocument());
    for (const row of [...expenseRows(), ...incomeRows()]) expect(row).not.toHaveClass("is-unconfirmed");
    expect(screen.getByText("Confirmed 2 items in April")).toBeInTheDocument();
  });

  it("undoes the copy, removing what is still unconfirmed", async () => {
    const { backend, user } = renderPage();
    await copyTemplate(user);

    await user.click(within(await banner()).getByRole("button", { name: "Undo copying Standard month" }));
    expect(posts(backend, /\/undo$/)).toEqual([{ method: "POST", path: "/v1/template-applies/a1/undo", body: undefined }]);
    expect(await offer()).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unconfirmed items" })).not.toBeInTheDocument();
    expect(screen.getByText("Undone · removed 3 copied items")).toBeInTheDocument();
  });

  it("starts blank without copying anything", async () => {
    const { backend, user } = renderPage();
    await user.click(within(await offer()).getByRole("button", { name: "Start blank" }));

    expect(screen.queryByRole("region", { name: /from your template/ })).not.toBeInTheDocument();
    expect(backend.calls).toEqual([]);
  });

  it("points to the Templates screen when there is no template", async () => {
    renderPage((s) => (s.templates = []));
    const card = await offer();
    expect(await within(card).findByRole("link", { name: "Build a template month" })).toHaveAttribute("href", "/templates");
    expect(within(card).queryByRole("button", { name: /^Copy into/ })).not.toBeInTheDocument();
  });
});

describe("applying to a month that has data", () => {
  const withData = (s: State) => {
    s.expenses.push(expense("x1", `${MONTH}-03`, { id: "m3", name: "Grocer" }, 4500));
    s.expenses.push(expense("x2", `${MONTH}-04`, { id: "m3", name: "Grocer" }, 2500));
    s.income.push(income("x3", `${MONTH}-15`, 200000));
  };

  async function openApply(user: ReturnType<typeof userEvent.setup>) {
    await screen.findAllByText("Grocer");
    await user.click(screen.getByRole("button", { name: "Apply template…" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply a template to April" });
    await within(dialog).findByRole("radio", { name: /Standard month/, checked: true });
    await user.click(within(dialog).getByRole("button", { name: "Copy into April" }));
  }

  it("asks to confirm deleting all of the month's entries, then resets and copies", async () => {
    const { backend, user } = renderPage(withData);
    await openApply(user);

    const confirm = await screen.findByRole("alertdialog", { name: "Replace everything in April?" });
    expect(confirm).toHaveTextContent("April 2020 already has 2 expenses and 1 income entry.");
    expect(confirm).toHaveTextContent("deletes all of them, confirmed or not");
    expect(confirm).toHaveTextContent("Undo afterwards removes only the new copies. It can’t bring back what was deleted.");
    expect(screen.queryByRole("dialog", { name: "Apply a template to April" })).not.toBeInTheDocument();

    await user.click(within(confirm).getByRole("button", { name: "Delete all and copy template" }));
    expect(posts(backend, /apply-template$/).map((c) => c.body)).toEqual([
      { template_id: "t1", reset_month: false },
      { template_id: "t1", reset_month: true },
    ]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await banner()).toHaveTextContent(/^3 items copied/);
    expect(screen.queryAllByText("Grocer")).toHaveLength(0);
  });

  it("keeps the month as it is when the reset is cancelled", async () => {
    const { backend, user } = renderPage(withData);
    await openApply(user);

    const confirm = await screen.findByRole("alertdialog", { name: "Replace everything in April?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(posts(backend, /apply-template$/)).toHaveLength(1);
    expect(backend.state.expenses.filter((e) => e.date.startsWith(MONTH))).toHaveLength(2);
  });
});

describe("save this month as a template", () => {
  it("saves the month under the chosen name", async () => {
    const { backend, user } = renderPage(undefined, PREVIOUS);
    await screen.findAllByText("Rent");
    await user.click(screen.getByRole("button", { name: "Save as template…" }));

    const dialog = await screen.findByRole("dialog", { name: "Save March as a template" });
    expect(dialog).toHaveTextContent("Refunds are left out.");
    const name = within(dialog).getByLabelText("Template name");
    expect(name).toHaveValue("March 2020");
    await user.clear(name);
    await user.type(name, "Spring month");
    await user.click(within(dialog).getByRole("button", { name: "Save template" }));

    expect(posts(backend, /save-as-template$/)).toEqual([
      { method: "POST", path: `/v1/months/${PREVIOUS}/save-as-template`, body: { name: "Spring month" } },
    ]);
    expect(await screen.findByText("Saved March as the template “Spring month”")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a taken name next to the field", async () => {
    const { user } = renderPage(
      (s) => (s.saveError = { status: 409, body: { error: { code: "name_taken", message: "Name taken." } } }),
      PREVIOUS,
    );
    await screen.findAllByText("Rent");
    await user.click(screen.getByRole("button", { name: "Save as template…" }));
    const dialog = await screen.findByRole("dialog", { name: "Save March as a template" });
    await user.click(within(dialog).getByRole("button", { name: "Save template" }));

    const field = within(dialog).getByLabelText("Template name");
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(within(dialog).getByText("You already have a template with this name.")).toBeInTheDocument();
  });

  it("is unavailable for an empty month", async () => {
    renderPage();
    await offer();
    expect(screen.getByRole("button", { name: "Save as template…" })).toBeDisabled();
  });
});
