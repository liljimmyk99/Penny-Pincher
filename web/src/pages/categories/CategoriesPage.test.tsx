import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { CategoriesPage } from "./CategoriesPage";

const YEAR = 2026;
const stamp = "2026-01-01T00:00:00Z";

function category(id: string, name: string, extra: Partial<Schemas["Category"]> = {}): Schemas["Category"] {
  return {
    id,
    name,
    color: null,
    is_saving: false,
    is_protected: false,
    sort_order: Number(id) * 10,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

function source(id: string, name: string, extra: Partial<Schemas["IncomeSource"]> = {}): Schemas["IncomeSource"] {
  return {
    id,
    name,
    is_protected: false,
    has_entries: false,
    sort_order: Number(id) * 10,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

/** An in-memory backend for the routes this screen uses, with the delete rules applied. */
function fakeBackend() {
  const state = {
    categories: [
      category("1", "Saving", { is_saving: true }),
      category("2", "Food"),
      category("3", "Housing"),
      category("9", "Other", { is_protected: true }),
    ],
    categoryStats: new Map<string, Schemas["CategoryStats"]>([
      ["1", { category_id: "1", entry_count: 2, total_cents: 40000, year_total_cents: 40000 }],
      ["2", { category_id: "2", entry_count: 3, total_cents: 4500, year_total_cents: 3000 }],
      ["3", { category_id: "3", entry_count: 0, total_cents: 0, year_total_cents: 0 }],
      ["9", { category_id: "9", entry_count: 1, total_cents: 250, year_total_cents: 250 }],
    ]),
    sources: [source("1", "Job A", { has_entries: true }), source("2", "Side gig"), source("9", "Other", { is_protected: true })],
    sourceStats: new Map<string, Schemas["IncomeSourceStats"]>([
      ["1", { income_source_id: "1", entry_count: 2, year_gross_cents: 400000, year_gross_taxable_cents: 360000, year_net_cents: 270000 }],
      ["2", { income_source_id: "2", entry_count: 0, year_gross_cents: 0, year_gross_taxable_cents: 0, year_net_cents: 0 }],
      ["9", { income_source_id: "9", entry_count: 0, year_gross_cents: 0, year_gross_taxable_cents: 0, year_net_cents: 0 }],
    ]),
    nextId: 20,
  };
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const conflict = (code: string, message: string) => Response.json({ error: { code, message } }, { status: 409 });

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const body = req.method === "GET" || req.method === "DELETE" ? undefined : await req.json();
    calls.push({ method: req.method, path, body });
    const id = path.split("/").pop()!;

    if (req.method === "GET" && path === "/v1/categories") return Response.json({ items: state.categories });
    if (req.method === "GET" && path === "/v1/categories/stats") {
      expect(url.searchParams.get("year")).toBe(String(YEAR));
      return Response.json({ items: state.categories.map((c) => state.categoryStats.get(c.id)) });
    }
    if (req.method === "GET" && path === "/v1/income-sources") return Response.json({ items: state.sources });
    if (req.method === "GET" && path === "/v1/income-sources/stats")
      return Response.json({ items: state.sources.map((s) => state.sourceStats.get(s.id)) });

    if (req.method === "DELETE" && path.startsWith("/v1/categories/")) {
      const cat = state.categories.find((c) => c.id === id)!;
      if (cat.is_protected) return conflict("protected_resource", "Other can't be deleted.");
      // The backend moves every expense to Other in the same transaction.
      const moved = state.categoryStats.get(id)!;
      const other = state.categoryStats.get("9")!;
      state.categoryStats.set("9", {
        category_id: "9",
        entry_count: other.entry_count + moved.entry_count,
        total_cents: other.total_cents + moved.total_cents,
        year_total_cents: other.year_total_cents + moved.year_total_cents,
      });
      state.categoryStats.delete(id);
      state.categories = state.categories.filter((c) => c.id !== id);
      return new Response(null, { status: 204 });
    }
    if (req.method === "PATCH" && path.startsWith("/v1/categories/")) {
      const name = (body as { name: string }).name;
      if (state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase()))
        return conflict("name_taken", "A category with this name already exists.");
      state.categories = state.categories.map((c) => (c.id === id ? { ...c, name } : c));
      return Response.json(state.categories.find((c) => c.id === id));
    }
    if (req.method === "POST" && path === "/v1/categories") {
      const created = category(String(state.nextId++), (body as { name: string }).name);
      state.categories.splice(state.categories.length - 1, 0, created);
      state.categoryStats.set(created.id, { category_id: created.id, entry_count: 0, total_cents: 0, year_total_cents: 0 });
      return Response.json(created, { status: 201 });
    }
    if (req.method === "PUT" && path === "/v1/categories/order") {
      const ids = (body as { ids: string[] }).ids;
      state.categories = ids.map((i) => state.categories.find((c) => c.id === i)!);
      return Response.json({ items: state.categories });
    }
    if (req.method === "DELETE" && path.startsWith("/v1/income-sources/")) {
      state.sources = state.sources.filter((s) => s.id !== id);
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: { code: "not_implemented", message: "no" } }, { status: 501 });
  }

  return { state, calls, fetch: vi.fn((req: Request) => handle(req)) };
}

function renderPage() {
  const backend = fakeBackend();
  const client = createApiClient({
    baseUrl: "http://api.test",
    getToken: async () => "tok",
    fetch: backend.fetch as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <CategoriesPage year={YEAR} />
    </ApiProvider>,
  );
  return { backend, user: userEvent.setup() };
}

const categoriesTable = () => screen.getByRole("table", { name: "Expense categories" });
const sourcesTable = () => screen.getByRole("table", { name: "Income sources" });
const row = (table: HTMLElement, name: string) =>
  within(table).getByRole("rowheader", { name: new RegExp(`^${name}`) }).closest("tr")!;
const cells = (tr: HTMLElement) => within(tr).getAllByRole("cell").map((c) => c.textContent);
const rowNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole("rowheader")
    .map((th) => th.firstChild?.firstChild?.textContent ?? th.textContent);

async function loaded() {
  await within(await screen.findByRole("table", { name: "Expense categories" })).findByText("$432.50");
  await within(sourcesTable()).findByText("$2,700.00", { selector: "tbody td" });
}

describe("Categories & sources", () => {
  it("lists categories with entries and spent year to date, Saving badged and Other locked", async () => {
    renderPage();
    await loaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Categories & sources");
    expect(screen.getByText(`Manage · totals for ${YEAR}`)).toBeInTheDocument();

    expect(cells(row(categoriesTable(), "Food"))).toEqual(["", "3", "$30.00", ""]);
    expect(within(row(categoriesTable(), "Saving")).getByText("Counted as savings")).toBeInTheDocument();

    const other = row(categoriesTable(), "Other");
    expect(within(other).getByText("Default")).toBeInTheDocument();
    expect(within(other).getByText("Locked")).toBeInTheDocument();
    expect(within(other).queryByRole("button")).not.toBeInTheDocument();

    const food = row(categoriesTable(), "Food");
    for (const name of ["Reorder Food", "Rename Food", "Delete Food"]) {
      expect(within(food).getByRole("button", { name })).toBeInTheDocument();
    }
    const footer = within(categoriesTable()).getByRole("rowheader", { name: "All categories" }).closest("tr")!;
    expect(cells(footer)).toEqual(["", "6", "$432.50", ""]);
  });

  it("deleting a category confirms what moves, then shows it under Other", async () => {
    const { backend, user } = renderPage();
    await loaded();
    expect(cells(row(categoriesTable(), "Other"))).toEqual(["", "1", "$2.50", "Locked"]);

    await user.click(within(row(categoriesTable(), "Food")).getByRole("button", { name: "Delete Food" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete “Food”?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Its 3 expenses ($45.00 in total) will move to Other.");
    expect(within(dialog).getByText(/templates that use food will switch to other/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete and move to Other" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(backend.calls).toContainEqual({ method: "DELETE", path: "/v1/categories/2", body: undefined });

    await waitFor(() => expect(within(categoriesTable()).queryByText("Food")).not.toBeInTheDocument());
    await waitFor(() => expect(cells(row(categoriesTable(), "Other"))).toEqual(["", "4", "$32.50", "Locked"]));
  });

  it("cancelling the delete dialog keeps the category", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(within(row(categoriesTable(), "Housing")).getByRole("button", { name: "Delete Housing" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleDescription("It has no expenses yet.");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(backend.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(row(categoriesTable(), "Housing")).toBeInTheDocument();
  });

  it("renames inline, and shows the server's error when the name is taken", async () => {
    const { user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Rename Food" }));
    const input = screen.getByRole("textbox", { name: "Category name" });
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, "housing{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("A category with this name already exists.");
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.clear(input);
    await user.type(input, "Groceries{Enter}");
    await within(categoriesTable()).findByText("Groceries");
    expect(screen.queryByRole("textbox", { name: "Category name" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Groceries" })).toHaveFocus();
  });

  it("Escape cancels a rename", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Rename Food" }));
    await user.type(screen.getByRole("textbox", { name: "Category name" }), "zzz{Escape}");
    expect(screen.queryByRole("textbox", { name: "Category name" })).not.toBeInTheDocument();
    expect(backend.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("reorders with the keyboard and keeps Other in place", async () => {
    const { backend, user } = renderPage();
    await loaded();
    screen.getByRole("button", { name: "Reorder Saving" }).focus();
    await user.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(backend.calls).toContainEqual({
        method: "PUT",
        path: "/v1/categories/order",
        body: { ids: ["2", "1", "3", "9"] },
      }),
    );
    await waitFor(() => expect(rowNames(categoriesTable())).toEqual(["Food", "Saving", "Housing", "Other", "All categories"]));
    expect(screen.getByRole("button", { name: "Reorder Saving" })).toHaveFocus();
    expect(within(categoriesTable().parentElement!).getByRole("status")).toHaveTextContent(
      "Saving moved to position 2 of 3.",
    );

    // The last movable row can't go below Other.
    screen.getByRole("button", { name: "Reorder Housing" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(backend.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("adds a category from the field under the table", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.type(screen.getByRole("textbox", { name: "New category name" }), "  Pets  ");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await within(categoriesTable()).findByText("Pets");
    expect(backend.calls).toContainEqual({
      method: "POST",
      path: "/v1/categories",
      body: { name: "Pets", is_saving: false },
    });
    expect(screen.getByRole("textbox", { name: "New category name" })).toHaveValue("");
  });

  it("lists income sources with year totals and a calculated tax rate", async () => {
    renderPage();
    await loaded();
    expect(cells(row(sourcesTable(), "Job A"))).toEqual(["", "2", "$4,000.00", "$2,700.00", "25.0%", ""]);
    expect(cells(row(sourcesTable(), "Side gig"))).toEqual(["", "0", "$0.00", "$0.00", "—", ""]);
    const other = row(sourcesTable(), "Other");
    expect(within(other).getByText("Locked")).toBeInTheDocument();
    expect(within(other).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a source with entries can be renamed but offers no delete", async () => {
    renderPage();
    await loaded();
    const job = row(sourcesTable(), "Job A");
    expect(within(job).getByRole("button", { name: "Rename Job A" })).toBeInTheDocument();
    expect(within(job).queryByRole("button", { name: "Delete Job A" })).not.toBeInTheDocument();
    expect(within(job).getByRole("button", { name: "Why Job A can't be deleted" })).toBeInTheDocument();
  });

  it("deletes a source with no entries after confirming", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Delete Side gig" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete “Side gig”?" });
    expect(dialog).toHaveAccessibleDescription("It has no income entries.");
    await user.click(within(dialog).getByRole("button", { name: "Delete and move to Other" }));
    await waitFor(() => expect(within(sourcesTable()).queryByText("Side gig")).not.toBeInTheDocument());
    expect(backend.calls).toContainEqual({ method: "DELETE", path: "/v1/income-sources/2", body: undefined });
  });
});
