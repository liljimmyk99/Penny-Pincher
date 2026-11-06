import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { AddEntriesPage } from "./AddEntriesPage";

// A month far from "today", so default dates are always the 1st.
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

const source = (id: string, name: string, extra: Partial<Schemas["IncomeSource"]> = {}): Schemas["IncomeSource"] => ({
  id,
  name,
  is_protected: false,
  has_entries: false,
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

function expense(id: string, merchant: Schemas["Merchant"], extra: Partial<Schemas["Expense"]>): Schemas["Expense"] {
  return {
    id,
    date: "2020-02-10",
    amount_cents: 1000,
    type: "expense",
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

const coffee = { id: "m1", name: "Corner Coffee" };
const store = { id: "m2", name: "Corner Store" };
const shop = { id: "m3", name: "Online Shop" };

function fakeBackend() {
  const state = {
    categories: [category("1", "Saving", { is_saving: true }), category("2", "Food"), category("3", "Household"), category("9", "Other", { is_protected: true })],
    sources: [source("1", "Employer A", { has_entries: true }), source("2", "Side job"), source("9", "Other", { is_protected: true })],
    merchants: [coffee, store, shop],
    expenses: [
      expense("e1", coffee, { category_id: "2", date: "2020-02-20" }),
      expense("e2", shop, { category_id: "3", date: "2020-02-03", amount_cents: 4999 }),
    ],
    income: [] as Schemas["IncomeEntry"][],
    batchError: null as null | { status: number; body: unknown },
    nextId: 100,
  };
  const posts: { path: string; body: unknown }[] = [];

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const q = url.searchParams;

    if (req.method === "GET" && path === "/v1/categories") return Response.json({ items: state.categories });
    if (req.method === "GET" && path === "/v1/income-sources") return Response.json({ items: state.sources });
    if (req.method === "GET" && path === "/v1/merchants") {
      const prefix = (q.get("q") ?? "").toLowerCase();
      const items = state.merchants.filter((m) => m.name.toLowerCase().startsWith(prefix));
      return Response.json({ items, next_cursor: null });
    }
    if (req.method === "GET" && path === "/v1/expenses") {
      const items = state.expenses.filter(
        (e) => e.merchant.id === q.get("merchant_id") && (!q.get("type") || e.type === q.get("type")),
      );
      return Response.json({ items, next_cursor: null });
    }
    if (req.method === "GET" && path === "/v1/income-entries") {
      const items = state.income.filter((e) => e.date.startsWith(q.get("month")!));
      return Response.json({ items, next_cursor: null });
    }
    if (req.method === "POST" && path === "/v1/expenses/batch") {
      const body = (await req.json()) as { items: Schemas["ExpenseCreate"][] };
      posts.push({ path, body });
      if (state.batchError) return Response.json(state.batchError.body, { status: state.batchError.status });
      const items = body.items.map((it) =>
        expense(String(state.nextId++), { id: "mx", name: it.merchant_name }, {
          ...it,
          type: it.amount_cents < 0 ? "refund" : "expense",
          note: it.note ?? null,
          refunded_expense_id: it.refunded_expense_id ?? null,
        }),
      );
      return Response.json({ items }, { status: 201 });
    }
    if (req.method === "POST" && path === "/v1/income-entries") {
      const body = (await req.json()) as Schemas["IncomeEntryCreate"];
      posts.push({ path, body });
      const entry: Schemas["IncomeEntry"] = {
        id: String(state.nextId++),
        ...body,
        note: body.note ?? null,
        confirmed: true,
        template_apply_id: null,
        import_id: null,
        created_at: stamp,
        updated_at: stamp,
      };
      state.income.push(entry);
      return Response.json(entry, { status: 201 });
    }
    return Response.json({ error: { code: "not_found", message: `No route ${req.method} ${path}` } }, { status: 404 });
  }

  return { state, posts, fetch: vi.fn((req: Request) => handle(req)) };
}

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname + loc.search}</p>;
}

function renderPage(path = `/add?month=${MONTH}`) {
  const backend = fakeBackend();
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
            path="/add"
            element={
              <>
                <AddEntriesPage />
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

const field = (name: string, row = 1) => screen.getByRole("textbox", { name: `${name}, row ${row}` });
const merchant = (row = 1) => screen.getByRole("combobox", { name: `Merchant, row ${row}` });
const categorySelect = (row = 1) => screen.getByRole("combobox", { name: `Category, row ${row}` });
const dateInput = (row = 1) => screen.getByLabelText(`Date, row ${row}`) as HTMLInputElement;
const batchPosts = (backend: ReturnType<typeof fakeBackend>) =>
  backend.posts.filter((p) => p.path === "/v1/expenses/batch").map((p) => (p.body as { items: unknown[] }).items);

async function ready() {
  await screen.findByRole("option", { name: "Food" });
  await screen.findByRole("radio", { name: "Employer A" });
}

describe("AddEntriesPage: expenses", () => {
  it("saves a quick single entry from the keyboard, as integer cents", async () => {
    const { backend, user } = renderPage();
    await ready();

    expect(dateInput().value).toBe("2020-03-01");
    await user.click(merchant());
    await user.keyboard("New Bakery");
    await user.tab();
    await user.selectOptions(categorySelect(), "Food");
    await user.tab();
    await user.keyboard("4.35");
    await user.tab();
    await user.keyboard("Bread");
    expect(screen.getByText(/1 row ready/)).toHaveTextContent("1 row ready · $4.35 net");

    await user.keyboard("{Control>}{Enter}{/Control}");

    await screen.findByText("Saved 1 entry · $4.35 net.");
    expect(batchPosts(backend)).toEqual([
      [
        {
          date: "2020-03-01",
          amount_cents: 435,
          category_id: "2",
          merchant_name: "New Bakery",
          note: "Bread",
          confirmed: true,
        },
      ],
    ]);
    // The table resets to one empty row, focused for the next entry.
    expect(merchant()).toHaveValue("");
    expect(merchant()).toHaveFocus();
    expect(screen.queryByRole("combobox", { name: "Merchant, row 2" })).not.toBeInTheDocument();
  });

  it("Enter moves to a new row; rows can be removed; Save sends one batch", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(merchant());
    await user.keyboard("Shop One");
    await user.selectOptions(categorySelect(), "Household");
    await user.click(field("Amount"));
    await user.keyboard("12{Enter}");
    expect(merchant(2)).toHaveFocus();

    await user.keyboard("Shop Two");
    await user.selectOptions(categorySelect(2), "Food");
    await user.click(field("Amount", 2));
    await user.keyboard("1,000.10{Enter}");
    expect(merchant(3)).toHaveFocus();
    await user.keyboard("Shop Three");

    await user.click(screen.getByRole("button", { name: "Remove row 3" }));
    expect(screen.queryByRole("combobox", { name: "Merchant, row 3" })).not.toBeInTheDocument();
    expect(screen.getByText(/2 rows ready/)).toHaveTextContent("2 rows ready · $1,012.10 net");

    await user.click(screen.getByRole("button", { name: "Save 2 entries" }));
    await screen.findByText("Saved 2 entries · $1,012.10 net.");
    expect(batchPosts(backend)).toHaveLength(1);
    expect(batchPosts(backend)[0]).toMatchObject([
      { merchant_name: "Shop One", amount_cents: 1200, category_id: "3", note: null },
      { merchant_name: "Shop Two", amount_cents: 100010, category_id: "2" },
    ]);
  });

  it("autocompletes merchants and prefills the category from their last expense", async () => {
    const { user } = renderPage();
    await ready();

    await user.click(merchant());
    await user.keyboard("cor");
    const list = await screen.findByRole("listbox", { name: "Past merchants" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Corner Coffee", "Corner Store"]);

    await user.keyboard("{ArrowDown}");
    expect(merchant()).toHaveAttribute("aria-activedescendant", within(list).getAllByRole("option")[0].id);
    await user.keyboard("{Enter}");

    expect(merchant()).toHaveValue("Corner Coffee");
    expect(screen.queryByRole("listbox", { name: "Past merchants" })).not.toBeInTheDocument();
    await waitFor(() => expect(categorySelect()).toHaveValue("2"));
    // Enter that picked the suggestion didn't also add a row.
    expect(screen.queryByRole("combobox", { name: "Merchant, row 2" })).not.toBeInTheDocument();
  });

  it("does not overwrite a category the user already chose", async () => {
    const { user } = renderPage();
    await ready();

    await user.selectOptions(categorySelect(), "Other");
    await user.click(merchant());
    await user.keyboard("Corner C");
    await screen.findByRole("option", { name: "Corner Coffee" });
    await user.keyboard("{ArrowDown}{Enter}");
    await user.tab();
    expect(categorySelect()).toHaveValue("9");
  });

  it("adds a refund linked to an original expense, saved as a negative amount", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: "Add refund" }));
    // The empty first row is skipped; the refund is row 2.
    expect(merchant(2)).toHaveFocus();
    await user.keyboard("Online Shop");
    await user.tab();

    const link = await screen.findByRole("combobox", { name: "Refund for, row 2" });
    await waitFor(() => expect(link).toBeEnabled());
    await user.selectOptions(link, "e2");
    expect(categorySelect(2)).toHaveValue("3");
    await user.click(field("Refund amount", 2));
    await user.keyboard("20");

    expect(merchant(2).closest("tr")).toHaveClass("batch__row--refund");
    expect(screen.getByText(/1 row ready/)).toHaveTextContent("1 row ready · −$20.00 net");

    await user.click(screen.getByRole("button", { name: "Save entry" }));
    await screen.findByText("Saved 1 entry · −$20.00 net.");
    expect(batchPosts(backend)[0]).toEqual([
      {
        date: "2020-03-01",
        amount_cents: -2000,
        category_id: "3",
        merchant_name: "Online Shop",
        note: null,
        confirmed: true,
        refunded_expense_id: "e2",
      },
    ]);
  });

  it("treats a negative amount as an unlinked refund", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(merchant());
    await user.keyboard("Brand New Place");
    await user.selectOptions(categorySelect(), "Food");
    await user.click(field("Amount"));
    await user.keyboard("-5.5");

    expect(merchant().closest("tr")).toHaveClass("batch__row--refund");
    expect(screen.getByText("New merchant: nothing to link this refund to.")).toBeInTheDocument();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await screen.findByText(/Saved 1 entry/);
    expect(batchPosts(backend)[0]).toMatchObject([{ amount_cents: -550 }]);
    expect(batchPosts(backend)[0][0]).not.toHaveProperty("refunded_expense_id");
  });

  it("validates before sending and focuses the first problem", async () => {
    const { backend, user } = renderPage();
    await ready();

    await user.click(merchant());
    await user.keyboard("Somewhere");
    await user.click(field("Amount"));
    await user.keyboard("12.345");
    await user.click(screen.getByRole("button", { name: "Save entry" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted row. Nothing was saved.");
    expect(categorySelect()).toHaveAttribute("aria-invalid", "true");
    expect(categorySelect()).toHaveFocus();
    expect(field("Amount")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter an amount like 12.34.")).toBeInTheDocument();
    expect(batchPosts(backend)).toHaveLength(0);
  });

  it("maps the batch endpoint's item errors back onto rows and keeps them", async () => {
    const { backend, user } = renderPage();
    backend.state.batchError = {
      status: 400,
      body: {
        error: {
          code: "validation_failed",
          message: "Invalid request.",
          details: [{ field: "items[1].category_id", issue: "Category not found." }],
        },
      },
    };
    await ready();

    for (const [row, name] of [[1, "First"], [2, "Second"]] as const) {
      if (row === 2) await user.click(screen.getByRole("button", { name: "Add row" }));
      await user.click(merchant(row));
      await user.keyboard(name);
      await user.selectOptions(categorySelect(row), "Food");
      await user.click(field("Amount", row));
      await user.keyboard("3");
    }
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was saved.");
    expect(categorySelect(2)).toHaveAttribute("aria-invalid", "true");
    expect(categorySelect(1)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Category not found.")).toBeInTheDocument();
    expect(merchant(1)).toHaveValue("First");
    expect(merchant(2)).toHaveValue("Second");
  });

  it("Discard clears every row", async () => {
    const { user } = renderPage();
    await ready();
    await user.click(merchant());
    await user.keyboard("Anything{Enter}");
    await user.keyboard("More");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(merchant()).toHaveValue("");
    expect(screen.queryByRole("combobox", { name: "Merchant, row 2" })).not.toBeInTheDocument();
    expect(screen.getByText(/0 rows ready/)).toBeInTheDocument();
  });
});

describe("AddEntriesPage: income", () => {
  it("saves an income entry from the keyboard and shows the month so far", async () => {
    const { backend, user } = renderPage();
    await ready();
    expect(screen.getByText("No income logged in March yet.")).toBeInTheDocument();

    const employer = screen.getByRole("radio", { name: "Employer A" });
    expect(employer).toHaveAttribute("aria-checked", "true");
    await user.click(employer);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Side job" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Side job" })).toHaveFocus();

    await user.click(screen.getByLabelText(/^Label/));
    await user.keyboard("Weekend gig");
    await user.type(screen.getByLabelText("Gross"), "1,000.00");
    await user.type(screen.getByLabelText("Gross taxable"), "900");
    await user.type(screen.getByLabelText("Net"), "720.00");
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await screen.findByText("Saved $720.00 net from Side job.");
    expect(backend.posts.find((p) => p.path === "/v1/income-entries")?.body).toEqual({
      income_source_id: "2",
      date: "2020-03-01",
      gross_cents: 100000,
      gross_taxable_cents: 90000,
      net_cents: 72000,
      note: "Weekend gig",
      confirmed: true,
    });
    expect(screen.getByLabelText("Gross")).toHaveValue("");
    expect(screen.getByLabelText("Gross")).toHaveFocus();

    const soFar = await screen.findByText("Total");
    expect(soFar.closest("dl")).toHaveTextContent("Side job · 1 entry$720.00Total$720.00");
  });

  it("refuses net or taxable above gross", async () => {
    const { backend, user } = renderPage();
    await ready();
    await user.type(screen.getByLabelText("Gross"), "100");
    await user.type(screen.getByLabelText("Gross taxable"), "100.01");
    await user.type(screen.getByLabelText("Net"), "120");
    await user.click(screen.getByRole("button", { name: "Save income" }));

    expect(screen.getByText("Gross taxable can’t be more than gross.")).toBeInTheDocument();
    expect(screen.getByText("Net can’t be more than gross.")).toBeInTheDocument();
    expect(screen.getByLabelText("Gross taxable")).toHaveFocus();
    expect(backend.posts).toHaveLength(0);
  });
});

describe("AddEntriesPage: month", () => {
  it("switches month, moving default dates of untouched rows with it", async () => {
    const { user } = renderPage();
    await ready();
    await user.click(screen.getByRole("button", { name: "Next month, April 2020" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/add?month=2020-04");
    expect(screen.getByText("April 2020")).toBeInTheDocument();
    expect(dateInput().value).toBe("2020-04-01");
    expect(screen.getByLabelText("Date")).toHaveValue("2020-04-01");
    expect(await screen.findByText("No income logged in April yet.")).toBeInTheDocument();
  });
});
