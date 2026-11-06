import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { TransactionsPage } from "./TransactionsPage";

const MONTH = "2020-03";
const stamp = "2020-01-01T00:00:00Z";

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

const source = (id: string, name: string): Schemas["IncomeSource"] => ({
  id,
  name,
  is_protected: id === "9",
  has_entries: true,
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
});

const coffee = { id: "m1", name: "Corner Coffee" };
const store = { id: "m2", name: "Corner Store" };
const bank = { id: "m3", name: "Brokerage" };

function expense(id: string, merchant: Schemas["Merchant"], extra: Partial<Schemas["Expense"]>): Schemas["Expense"] {
  const amount = extra.amount_cents ?? 1000;
  return {
    id,
    date: "2020-03-10",
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
    import_id: null,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

function income(id: string, extra: Partial<Schemas["IncomeEntry"]>): Schemas["IncomeEntry"] {
  return {
    id,
    date: "2020-03-15",
    income_source_id: "1",
    gross_cents: 300000,
    gross_taxable_cents: 280000,
    net_cents: 210000,
    note: "Paycheck",
    confirmed: true,
    template_apply_id: null,
    import_id: null,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

type State = ReturnType<typeof fakeBackend>["state"];

function fakeBackend(setup?: (state: State) => void) {
  const state = {
    categories: [category("1", "Saving", { is_saving: true }), category("2", "Food"), category("3", "Household"), category("9", "Other", { is_protected: true })],
    sources: [source("1", "Employer A"), source("2", "Side job"), source("9", "Other")],
    expenses: [
      expense("e1", coffee, { date: "2020-03-20", amount_cents: 450, note: "Latte" }),
      expense("e2", store, { date: "2020-03-12", category_id: "3", amount_cents: 5000, note: "Lamp", refunded_total_cents: -2000 }),
      expense("e3", store, { date: "2020-03-14", category_id: "3", amount_cents: -2000, refunded_expense_id: "e2" }),
      expense("e4", bank, { date: "2020-03-01", category_id: "1", amount_cents: 30000, confirmed: false }),
      expense("e5", coffee, { date: "2020-02-11", amount_cents: 700 }),
    ],
    income: [
      income("i1", {}),
      income("i2", { date: "2020-03-05", income_source_id: "2", gross_cents: 50000, gross_taxable_cents: 0, net_cents: 50000, note: null, confirmed: false }),
      income("i3", { date: "2020-02-15" }),
    ],
    patchError: null as null | { status: number; body: unknown },
  };
  setup?.(state as State);
  const calls: { method: string; path: string; body?: unknown }[] = [];

  /** Like the API: an expense's refund total and latest refund date are computed when read. */
  function view(e: Schemas["Expense"]): Schemas["Expense"] {
    if (e.amount_cents < 0) return { ...e, refunded_total_cents: 0, last_refund_date: null };
    const refunds = state.expenses.filter((r) => r.refunded_expense_id === e.id);
    return {
      ...e,
      refunded_total_cents: refunds.reduce((sum, r) => sum + r.amount_cents, 0),
      last_refund_date: refunds.map((r) => r.date).sort().at(-1) ?? null,
    };
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const q = url.searchParams;
    const body = req.method === "PATCH" ? await req.json() : undefined;
    if (req.method !== "GET") calls.push({ method: req.method, path, body });

    if (req.method === "GET" && path === "/v1/categories") return Response.json({ items: state.categories });
    if (req.method === "GET" && path === "/v1/income-sources") return Response.json({ items: state.sources });
    if (req.method === "GET" && path === "/v1/merchants") return Response.json({ items: [], next_cursor: null });
    if (req.method === "GET" && path === "/v1/expenses") {
      const month = q.get("month");
      const from = q.get("from") ?? "";
      const to = q.get("to") ?? "9999";
      const type = q.get("type");
      const items = state.expenses
        .filter((e) => (month ? e.date.startsWith(month) : e.date >= from && e.date <= to))
        .filter((e) => !type || (type === "refund") === e.amount_cents < 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(view);
      return Response.json({ items, next_cursor: null });
    }
    if (req.method === "GET" && path === "/v1/income-entries") {
      const items = state.income.filter((e) => e.date.startsWith(q.get("month")!)).sort((a, b) => b.date.localeCompare(a.date));
      return Response.json({ items, next_cursor: null });
    }
    const m = /^\/v1\/(expenses|income-entries)\/(\w+)$/.exec(path);
    if (m) {
      const list = (m[1] === "expenses" ? state.expenses : state.income) as { id: string }[];
      const index = list.findIndex((e) => e.id === m[2]);
      if (index < 0) return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
      if (req.method === "GET") return Response.json(view(state.expenses[index]));
      if (req.method === "DELETE") {
        list.splice(index, 1);
        for (const e of state.expenses) if (e.refunded_expense_id === m[2]) e.refunded_expense_id = null;
        return new Response(null, { status: 204 });
      }
      if (req.method === "PATCH") {
        if (state.patchError) return Response.json(state.patchError.body, { status: state.patchError.status });
        const patch = body as Record<string, unknown>;
        if ("merchant_name" in patch) patch.merchant = { id: "mx", name: patch.merchant_name };
        list[index] = { ...list[index], confirmed: true, ...patch } as { id: string };
        return Response.json(m[1] === "expenses" ? view(list[index] as Schemas["Expense"]) : list[index]);
      }
    }
    return Response.json({ error: { code: "not_found", message: `No route ${req.method} ${path}` } }, { status: 404 });
  }

  return { state, calls, fetch: vi.fn((req: Request) => handle(req)) };
}

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname + loc.search + loc.hash}</p>;
}

function renderPage(path = `/transactions?month=${MONTH}`, setup?: (state: State) => void) {
  const backend = fakeBackend(setup);
  const client = createApiClient({
    baseUrl: "http://api.test",
    getToken: async () => "tok",
    fetch: backend.fetch as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/transactions"
            element={
              <>
                <TransactionsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  return { backend, user: userEvent.setup() };
}

const incomeTable = () => within(screen.getByRole("region", { name: /^Income/ })).getByRole("table");
const expenseTable = () => within(screen.getByRole("region", { name: /^Expenses/ })).getByRole("table");
const expenseRows = () => within(expenseTable()).getAllByRole("row").slice(1);
const merchantsShown = () => expenseRows().map((r) => within(r).getAllByRole("cell")[1].textContent);
const categoryButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}, `) });
const footer = () => within(screen.getByRole("region", { name: /^Expenses/ })).getByRole("status");

async function ready() {
  await screen.findAllByRole("cell", { name: /Corner Coffee/ });
  await screen.findByRole("cell", { name: "Paycheck" });
}

describe("TransactionsPage: income", () => {
  it("lists the month's income with tax rates and a total row", async () => {
    renderPage();
    await ready();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Transactions");
    expect(screen.getByRole("group", { name: "Month" })).toHaveTextContent("March 2020");
    const rows = within(incomeTable()).getAllByRole("row");
    expect(rows).toHaveLength(4); // header, two entries, total
    expect(rows[1]).toHaveTextContent("Mar 15Employer APaycheck$3,000.00$2,800.00$2,100.0025.0%");
    // No taxable income: no tax rate.
    expect(rows[2]).toHaveTextContent("Mar 5Side job—Unconfirmed · from template$500.00$0.00$500.00—");
    expect(rows[2]).toHaveClass("is-unconfirmed");
    expect(rows[3]).toHaveTextContent("Total$3,500.00$2,800.00$2,600.007.1%");
  });
});

describe("TransactionsPage: spending", () => {
  it("totals each category, with refunds lowering their own category", async () => {
    renderPage();
    await ready();

    expect(categoryButton("Saving")).toHaveAccessibleName("Saving, $300.00, 90% of spending");
    expect(categoryButton("Food")).toHaveAccessibleName("Food, $4.50, 1% of spending");
    expect(categoryButton("Household")).toHaveAccessibleName("Household, $30.00, 9% of spending");
    expect(screen.queryByRole("button", { name: /^Other, / })).not.toBeInTheDocument();
    expect(screen.getByText("Total spent").parentElement).toHaveTextContent("$334.50");
  });

  it("styles refunds and flags unconfirmed template copies", async () => {
    renderPage();
    await ready();

    expect(merchantsShown()).toEqual([
      "Corner Coffee",
      "Corner StorePartial refundRefund for Corner Store · Mar 12 · $50.00",
      "Corner StorePartly refunded · −$20.00 on Mar 14 · net $30.00",
      "BrokerageUnconfirmed · from template",
    ]);
    const [, refund, original, unconfirmed] = expenseRows();
    expect(refund).toHaveClass("is-refund");
    expect(within(refund).getByText("−$20.00")).toHaveClass("is-refund");
    expect(within(refund).getByText("Partial refund")).toHaveClass("pill--partial");
    expect(original).not.toHaveClass("is-refund");
    // Partly refunded: the amount stays as logged; the net is display-only.
    expect(within(original).getByText("$50.00")).not.toHaveClass("is-struck");
    expect(unconfirmed).toHaveClass("is-unconfirmed");
  });

  it("filters the expense list from a category row or chip, and clears it again", async () => {
    const { user } = renderPage();
    await ready();

    const chips = within(screen.getByRole("group", { name: "Filter by category" }));
    expect(chips.getAllByRole("button").map((b) => b.textContent)).toEqual(["All categories 4", "Saving 1", "Food 1", "Household 2"]);

    await user.click(categoryButton("Household"));
    expect(categoryButton("Household")).toHaveAttribute("aria-pressed", "true");
    expect(chips.getByRole("button", { name: "Household 2" })).toHaveAttribute("aria-pressed", "true");
    expect(merchantsShown()).toEqual([
      "Corner StorePartial refundRefund for Corner Store · Mar 12 · $50.00",
      "Corner StorePartly refunded · −$20.00 on Mar 14 · net $30.00",
    ]);
    expect(footer()).toHaveTextContent("Showing 2 of 4 expenses · $30.00");
    expect(screen.getByTestId("location")).toHaveTextContent("category=3");

    await user.click(categoryButton("Household"));
    expect(merchantsShown()).toHaveLength(4);

    await user.click(chips.getByRole("button", { name: "Saving 1" }));
    expect(merchantsShown()).toEqual(["BrokerageUnconfirmed · from template"]);
    await user.click(chips.getByRole("button", { name: "All categories 4" }));
    expect(merchantsShown()).toHaveLength(4);
    expect(footer()).toHaveTextContent("4 expenses · $334.50");
  });

  it("searches merchants and notes", async () => {
    const { user } = renderPage();
    await ready();

    await user.type(screen.getByRole("searchbox", { name: "Search merchants and notes" }), "lamp");
    expect(merchantsShown()).toEqual(["Corner StorePartly refunded · −$20.00 on Mar 14 · net $30.00"]);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "COFFEE");
    expect(merchantsShown()).toEqual(["Corner Coffee"]);
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No expenses match. Try another filter or search.")).toBeInTheDocument();
  });
});

describe("TransactionsPage: months", () => {
  it("browses a past month with the month switcher", async () => {
    const { user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Previous month, February 2020" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Month" })).toHaveTextContent("February 2020"));
    await waitFor(() => expect(merchantsShown()).toEqual(["Corner Coffee"]));
    expect(within(incomeTable()).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByTestId("location")).toHaveTextContent("month=2020-02");
  });

  it("shows empty months plainly, with a link to add entries", async () => {
    renderPage("/transactions?month=2019-01");
    expect(await screen.findByText(/No income logged in January/)).toBeInTheDocument();
    expect(await screen.findByText(/No expenses logged in January/)).toBeInTheDocument();
    expect(screen.getByText("Nothing spent this month yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add entries" })).toHaveAttribute("href", "/add?month=2019-01");
  });
});

describe("TransactionsPage: edit and delete", () => {
  it("edits an expense, sending only what changed, and refreshes the totals", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Edit expense Corner Coffee, Mar 20" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit expense" });
    const amount = within(dialog).getByLabelText("Amount");
    expect(amount).toHaveValue("4.50");
    await user.clear(amount);
    await user.type(amount, "12.05");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Household");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backend.calls).toEqual([{ method: "PATCH", path: "/v1/expenses/e1", body: { amount_cents: 1205, category_id: "3" } }]);
    await waitFor(() => expect(categoryButton("Household")).toHaveAccessibleName(/^Household, \$42\.05,/));
    expect(screen.queryByRole("button", { name: /^Food, / })).not.toBeInTheDocument();
  });

  it("validates before saving and shows the server's refusal", async () => {
    const { backend, user } = renderPage();
    await ready();
    backend.state.patchError = {
      status: 409,
      body: { error: { code: "has_linked_refunds", message: "Refunds point at this expense." } },
    };

    await user.click(screen.getByRole("button", { name: "Edit expense Corner Store, Mar 12" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit expense" });
    const amount = within(dialog).getByLabelText("Amount");
    await user.clear(amount);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAccessibleDescription("Enter an amount.");
    expect(backend.calls).toEqual([]);

    await user.type(amount, "-50");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nothing was saved. Refunds point at this expense.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("deletes an expense after confirming", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Delete expense Corner Store, Mar 12" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete this expense?" });
    expect(dialog).toHaveTextContent("Corner Store · Mar 12 · $50.00. This can’t be undone.");
    expect(dialog).toHaveTextContent("Its refunds stay, but they will no longer be linked to it.");
    await user.click(within(dialog).getByRole("button", { name: "Delete expense" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(backend.calls).toEqual([{ method: "DELETE", path: "/v1/expenses/e2", body: undefined }]);
    await waitFor(() => expect(merchantsShown()).toHaveLength(3));
    expect(categoryButton("Household")).toHaveAccessibleName(/^Household, −\$20\.00,/);
  });

  it("cancels a delete without calling the API", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Delete refund Corner Store, Mar 14" }));
    await screen.findByRole("alertdialog", { name: "Delete this refund?" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(backend.calls).toEqual([]);
  });

  it("edits an income entry, keeping net within gross", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Edit income Employer A Paycheck, Mar 15" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit income entry" });
    const net = within(dialog).getByLabelText("Net");
    await user.clear(net);
    await user.type(net, "4000");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(net).toHaveAccessibleDescription("Net can’t be more than gross.");
    expect(backend.calls).toEqual([]);

    await user.clear(net);
    await user.type(net, "2240");
    expect(within(dialog).getByText("20.0%")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backend.calls).toEqual([{ method: "PATCH", path: "/v1/income-entries/i1", body: { net_cents: 224000 } }]);
    await waitFor(() => expect(within(incomeTable()).getAllByRole("row")[3]).toHaveTextContent("Total$3,500.00$2,800.00$2,740.00"));
  });

  it("deletes an income entry after confirming", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Delete income Side job, Mar 5" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete this income entry?" });
    expect(dialog).toHaveTextContent("Side job · Mar 5 · $500.00 net.");
    await user.click(within(dialog).getByRole("button", { name: "Delete income entry" }));

    await waitFor(() => expect(within(incomeTable()).getAllByRole("row")).toHaveLength(3));
    expect(backend.calls).toEqual([{ method: "DELETE", path: "/v1/income-entries/i2", body: undefined }]);
  });
});

describe("TransactionsPage: refunds", () => {
  /** A full refund in March of February's coffee, and an unlinked refund. */
  const withMoreRefunds = (state: State) => {
    state.expenses.push(
      expense("e6", coffee, { date: "2020-03-08", amount_cents: -700, refunded_expense_id: "e5", note: "Wrong order" }),
      expense("e7", store, { date: "2020-03-25", category_id: "3", amount_cents: -1000, note: "Price match" }),
    );
  };
  const rowFor = (text: string) => expenseRows().find((r) => r.textContent?.includes(text))!;

  it("tags refunds and links each to its original, even in an earlier month", async () => {
    renderPage(undefined, withMoreRefunds);
    await ready();

    const fromEarlier = rowFor("Wrong order");
    expect(fromEarlier).toHaveClass("is-refund");
    expect(await within(fromEarlier).findByText("From February")).toHaveClass("pill--earlier");
    const link = within(fromEarlier).getByRole("link", { name: "Corner Coffee · Feb 11 · $7.00" });
    expect(link).toHaveAttribute("href", "/transactions?month=2020-02#expense-e5");
    expect(within(fromEarlier).getByText("−$7.00")).toHaveClass("is-refund");

    const unlinked = rowFor("Price match");
    expect(within(unlinked).getByText("Not linked")).toHaveClass("pill--unlinked");
    expect(within(unlinked).queryByRole("link")).not.toBeInTheDocument();
    expect(within(unlinked).getByRole("button", { name: "Link refund Corner Store, Mar 25" })).toBeInTheDocument();
    // Linked refunds and expenses have no Link… button.
    expect(screen.getAllByRole("button", { name: /^Link / })).toHaveLength(1);
  });

  it("strikes through an original refunded in full and shows its net", async () => {
    const { user } = renderPage(undefined, withMoreRefunds);
    await ready();

    await user.click(await within(rowFor("Wrong order")).findByRole("link", { name: /Corner Coffee/ }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Month" })).toHaveTextContent("February 2020"));
    expect(screen.getByTestId("location")).toHaveTextContent("/transactions?month=2020-02#expense-e5");
    const original = await screen.findByText("Refunded in full on Mar 8 · net $0.00");
    const row = original.closest("tr")!;
    expect(row).toHaveClass("is-target");
    await waitFor(() => expect(row).toHaveFocus());
    const amount = within(row).getByText("$7.00");
    expect(amount.tagName).toBe("S");
    expect(amount.closest("td")).toHaveClass("is-struck");
    expect(amount.closest("td")).toHaveTextContent("$7.00 (refunded in full)");
  });

  it("shows a full refund of an expense in the same month", async () => {
    renderPage(undefined, (state) => {
      state.expenses.push(expense("e8", coffee, { date: "2020-03-21", amount_cents: -450, refunded_expense_id: "e1" }));
    });
    await ready();

    expect(await screen.findByText("Full refund")).toHaveClass("pill--full");
    expect(screen.getByText("Refunded in full on Mar 21 · net $0.00")).toBeInTheDocument();
  });

  it("totals refunds and spending before and after them", async () => {
    renderPage(undefined, withMoreRefunds);
    await ready();

    const tiles = within(screen.getByRole("region", { name: "Refunds this month" }));
    expect(tiles.getByText("Refunds this month").parentElement).toHaveTextContent("−$37.003 refunds · 2 linked to an expense");
    expect(tiles.getByText("Spent before refunds").parentElement).toHaveTextContent("$354.50Every expense logged in March");
    expect(tiles.getByText("Spent after refunds").parentElement).toHaveTextContent("$317.50What Summary and Trends show");
  });

  it("filters to refunds or to unlinked refunds", async () => {
    const { user } = renderPage(undefined, withMoreRefunds);
    await ready();

    const chips = within(screen.getByRole("group", { name: "Filter by refund" }));
    expect(chips.getAllByRole("button").map((b) => b.textContent)).toEqual(["All 6", "Refunds 3", "Not linked 1"]);
    expect(chips.getByRole("button", { name: "All 6" })).toHaveAttribute("aria-pressed", "true");

    await user.click(chips.getByRole("button", { name: "Refunds 3" }));
    expect(expenseRows()).toHaveLength(3);
    expect(expenseRows().every((r) => r.classList.contains("is-refund"))).toBe(true);
    expect(screen.getByTestId("location")).toHaveTextContent("show=refunds");
    expect(footer()).toHaveTextContent("Showing 3 of 6 expenses · −$37.00");

    await user.click(chips.getByRole("button", { name: "Not linked 1" }));
    expect(merchantsShown()).toEqual(["Corner StoreNot linked"]);

    await user.click(chips.getByRole("button", { name: "All 6" }));
    expect(expenseRows()).toHaveLength(6);
    expect(screen.getByTestId("location")).not.toHaveTextContent("show=");
  });

  it("links a refund to the suggested expense and confirms with a toast", async () => {
    const { backend, user } = renderPage(undefined, withMoreRefunds);
    await ready();

    await user.click(screen.getByRole("button", { name: "Link refund Corner Store, Mar 25" }));
    const dialog = await screen.findByRole("dialog", { name: "Link refund to an expense" });
    expect(dialog).toHaveAccessibleDescription("Corner Store · Mar 25 · −$10.00 · Household · Price match");
    expect(dialog).toHaveTextContent("An unlinked refund still lowers Household spending for March.");

    // Same category, closest before the refund, with enough left to cover it.
    const options = await within(dialog).findAllByRole("radio");
    expect(options[0]).toBeChecked();
    expect(options[0].closest("label")).toHaveTextContent("Corner StoreSuggestedMar 12 · Household · Lamp · net $30.00$50.00");
    expect(options.map((o) => o.closest("label")!.querySelector("strong")!.textContent)).toEqual([
      "Corner Store",
      "Corner Coffee",
      "Brokerage",
      "Corner Coffee",
    ]);

    await user.click(within(dialog).getByRole("button", { name: "Link refund" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backend.calls).toEqual([{ method: "PATCH", path: "/v1/expenses/e7", body: { refunded_expense_id: "e2" } }]);
    expect(screen.getByText("Refund linked to Corner Store · Mar 12")).toBeInTheDocument();
    await waitFor(() => expect(rowFor("Price match")).toHaveTextContent("Refund for Corner Store · Mar 12 · $50.00"));
    expect(screen.getByText("Partly refunded · −$30.00 on Mar 25 · net $20.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Refund linked/)).not.toBeInTheDocument();
  });

  it("searches the linking dialog and lets the user pick another expense", async () => {
    const { backend, user } = renderPage(undefined, withMoreRefunds);
    await ready();

    await user.click(screen.getByRole("button", { name: "Link refund Corner Store, Mar 25" }));
    const dialog = await screen.findByRole("dialog", { name: "Link refund to an expense" });
    await within(dialog).findAllByRole("radio");
    await user.type(within(dialog).getByRole("searchbox", { name: "Search expenses" }), "coffee");
    const options = within(dialog).getAllByRole("radio");
    expect(options).toHaveLength(2);
    await user.click(options[1]);
    expect(options[1]).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Link refund" }));

    await waitFor(() => expect(backend.calls).toHaveLength(1));
    expect(backend.calls[0]).toEqual({ method: "PATCH", path: "/v1/expenses/e7", body: { refunded_expense_id: "e5" } });
  });

  it("keeps the dialog open and explains when linking fails", async () => {
    const { backend, user } = renderPage(undefined, withMoreRefunds);
    await ready();
    backend.state.patchError = {
      status: 400,
      body: { error: { code: "invalid_refund_link", message: "That expense can’t take a refund." } },
    };

    await user.click(screen.getByRole("button", { name: "Link refund Corner Store, Mar 25" }));
    const dialog = await screen.findByRole("dialog", { name: "Link refund to an expense" });
    await within(dialog).findAllByRole("radio");
    await user.click(within(dialog).getByRole("button", { name: "Link refund" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/^Not linked\./);
    expect(screen.queryByText(/Refund linked/)).not.toBeInTheDocument();
  });
});
