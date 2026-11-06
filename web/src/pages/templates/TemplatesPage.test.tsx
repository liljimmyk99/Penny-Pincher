import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { TemplatesPage } from "./TemplatesPage";

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

type Tpl = Schemas["Template"];

/** An in-memory backend for the routes this screen uses. */
function fakeBackend(templates: Tpl[]) {
  const state = {
    templates,
    categories: [category("1", "Saving", { is_saving: true }), category("2", "Housing"), category("9", "Other", { is_protected: true })],
    sources: [source("1", "Job A"), source("9", "Other", { is_protected: true })],
    merchants: [] as Schemas["Merchant"][],
    nextId: 100,
  };
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const newId = () => String(state.nextId++);
  const find = (id: string) => state.templates.find((t) => t.id === id);
  const summary = (t: Tpl): Schemas["TemplateSummary"] => ({
    id: t.id,
    name: t.name,
    expense_item_count: t.expense_items.length,
    income_item_count: t.income_items.length,
    created_at: t.created_at,
    updated_at: t.updated_at,
  });
  const merchant = (name: string) => {
    let m = state.merchants.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!m) state.merchants.push((m = { id: newId(), name }));
    return m;
  };

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const body = req.method === "GET" || req.method === "DELETE" ? undefined : await req.json();
    calls.push({ method: req.method, path, body });
    const parts = path.split("/").slice(1); // v1, templates, id, kind, itemId
    const b = body as Record<string, unknown> & { name: string };

    if (req.method === "GET" && path === "/v1/categories") return Response.json({ items: state.categories });
    if (req.method === "GET" && path === "/v1/income-sources") return Response.json({ items: state.sources });
    if (req.method === "GET" && path === "/v1/merchants") return Response.json({ items: state.merchants });
    if (path === "/v1/templates" && req.method === "GET")
      return Response.json({ items: [...state.templates].sort((x, y) => x.name.localeCompare(y.name)).map(summary) });
    if (path === "/v1/templates" && req.method === "POST") {
      const t: Tpl = { id: newId(), name: b.name, expense_items: [], income_items: [], created_at: stamp, updated_at: stamp };
      state.templates.push(t);
      return Response.json(t, { status: 201 });
    }
    const tpl = parts[1] === "templates" ? find(parts[2]) : undefined;
    if (!tpl) return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
    if (parts.length === 3) {
      if (req.method === "GET") return Response.json(tpl);
      if (req.method === "PATCH") {
        tpl.name = b.name;
        return Response.json(tpl);
      }
      if (req.method === "DELETE") {
        state.templates = state.templates.filter((t) => t !== tpl);
        return new Response(null, { status: 204 });
      }
    }
    const kind = parts[3];
    const itemId = parts[4];
    if (kind === "expense-items") {
      if (req.method === "POST") {
        const { merchant_name, ...rest } = b as unknown as Schemas["TemplateExpenseItemCreate"];
        const item = { id: newId(), note: null, sort_order: 1000, ...rest, merchant: merchant(merchant_name) };
        tpl.expense_items.push(item);
        return Response.json(item, { status: 201 });
      }
      const item = tpl.expense_items.find((i) => i.id === itemId)!;
      if (req.method === "PATCH") {
        const { merchant_name, ...rest } = b as unknown as Schemas["TemplateExpenseItemUpdate"];
        Object.assign(item, rest, merchant_name ? { merchant: merchant(merchant_name) } : {});
        return Response.json(item);
      }
      tpl.expense_items = tpl.expense_items.filter((i) => i !== item);
      return new Response(null, { status: 204 });
    }
    if (kind === "income-items") {
      if (req.method === "POST") {
        const item = { id: newId(), note: null, sort_order: 1000, ...(b as unknown as Schemas["TemplateIncomeItemCreate"]) };
        tpl.income_items.push(item);
        return Response.json(item, { status: 201 });
      }
      const item = tpl.income_items.find((i) => i.id === itemId)!;
      if (req.method === "PATCH") {
        Object.assign(item, b);
        return Response.json(item);
      }
      tpl.income_items = tpl.income_items.filter((i) => i !== item);
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: { code: "not_implemented", message: "no" } }, { status: 501 });
  }

  return { state, calls, fetch: vi.fn((req: Request) => handle(req)) };
}

function standardMonth(): Tpl {
  return {
    id: "t1",
    name: "Standard month",
    created_at: stamp,
    updated_at: stamp,
    income_items: [
      {
        id: "i1",
        income_source_id: "1",
        day_of_month: 1,
        gross_cents: 300000,
        gross_taxable_cents: 280000,
        net_cents: 210000,
        note: "Paycheck",
        sort_order: 0,
      },
    ],
    expense_items: [
      { id: "e1", category_id: "2", merchant: { id: "m1", name: "Rent" }, day_of_month: 1, amount_cents: 120000, note: null, sort_order: 0 },
      { id: "e2", category_id: "1", merchant: { id: "m2", name: "Brokerage" }, day_of_month: 15, amount_cents: 30000, note: null, sort_order: 1 },
    ],
  };
}

function renderPage(templates: Tpl[] = [standardMonth()]) {
  const backend = fakeBackend(templates);
  const client = createApiClient({
    baseUrl: "http://api.test",
    getToken: async () => "tok",
    fetch: backend.fetch as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={["/templates"]}>
        <TemplatesPage />
      </MemoryRouter>
    </ApiProvider>,
  );
  return { backend, user: userEvent.setup() };
}

const tiles = () => screen.getByRole("group", { name: "Template totals" });
const tile = (label: string) => within(tiles()).getByText(label).parentElement!;
const group = (name: string) => screen.getByRole("group", { name });
const lastCall = (backend: ReturnType<typeof fakeBackend>, method: string) =>
  backend.calls.filter((c) => c.method === method).at(-1);

async function loaded() {
  await screen.findByRole("group", { name: "Template totals" });
}

/** Holds the next PATCH until `release()`, so a test can act while that save is in flight. */
function holdNextPatch(backend: ReturnType<typeof fakeBackend>) {
  const handle = backend.fetch.getMockImplementation()!;
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const state = { held: false, release: () => release() };
  backend.fetch.mockImplementation(async (req: Request) => {
    if (req.method === "PATCH" && !state.held) {
      state.held = true;
      await gate;
    }
    return handle(req);
  });
  return state;
}

const patches = (backend: ReturnType<typeof fakeBackend>) =>
  backend.calls.filter((c) => c.method === "PATCH").map((c) => c.body);

describe("Templates", () => {
  it("lists templates and shows the first one's items, grouped, with totals", async () => {
    renderPage();
    await loaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Standard month");
    const pick = screen.getByRole("button", { name: /Standard month/ });
    expect(pick).toHaveAttribute("aria-pressed", "true");
    expect(pick).toHaveTextContent("3 items");

    expect(tile("Net income")).toHaveTextContent("$2,100.00");
    expect(tile("Planned spending")).toHaveTextContent("$1,500.00");
    expect(tile("Planned spending")).toHaveTextContent("Includes $300.00 saved & invested");
    expect(tile("Left over")).toHaveTextContent("$600.00");

    expect(within(group("Saving")).getByText("Counted as savings")).toBeInTheDocument();
    expect(within(group("Saving")).getByRole("combobox", { name: "Name, Brokerage" })).toHaveValue("Brokerage");
    expect(within(group("Housing")).getByRole("textbox", { name: "Amount, Rent" })).toHaveValue("1200.00");
    expect(within(group("Other")).getByText(/No items/)).toBeInTheDocument();

    const income = group("Income");
    expect(within(income).getByRole("textbox", { name: "Label, Job A · Paycheck" })).toHaveValue("Paycheck");
    expect(within(income).getByRole("textbox", { name: "Gross taxable, Job A · Paycheck" })).toHaveValue("2800.00");
    expect(within(income).getByText(/tax rate 25\.0%/)).toBeInTheDocument();
  });

  it("starts with an empty state and creates a template", async () => {
    const { backend, user } = renderPage([]);
    expect(await screen.findByRole("heading", { name: "No templates yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create template" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");

    await user.type(screen.getByLabelText("New template name"), "Standard month");
    await user.click(screen.getByRole("button", { name: "Create template" }));
    expect(lastCall(backend, "POST")).toEqual({ method: "POST", path: "/v1/templates", body: { name: "Standard month" } });
    await loaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Standard month");
    expect(tile("Net income")).toHaveTextContent("$0.00");
  });

  it("adds expense items under a category; Enter saves and readies the next one", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Add item to Housing" }));
    const draft = within(group("Housing")).getByRole("group", { name: "New expense item" });
    const name = within(draft).getByRole("combobox", { name: "Name, new item" });
    expect(name).toHaveFocus();
    await user.type(name, "Internet");
    await user.clear(within(draft).getByRole("textbox", { name: "Day of month, new item" }));
    await user.type(within(draft).getByRole("textbox", { name: "Day of month, new item" }), "31");
    await user.type(within(draft).getByRole("textbox", { name: "Amount, new item" }), "60{Enter}");

    await waitFor(() =>
      expect(lastCall(backend, "POST")).toEqual({
        method: "POST",
        path: "/v1/templates/t1/expense-items",
        body: { merchant_name: "Internet", category_id: "2", day_of_month: 31, amount_cents: 6000, note: null },
      }),
    );
    expect(await within(group("Housing")).findByRole("textbox", { name: "Amount, Internet" })).toHaveValue("60.00");
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,560.00"));
    // The draft is cleared for the next item, keeping its day.
    expect(name).toHaveValue("");
    expect(name).toHaveFocus();
    expect(within(draft).getByRole("textbox", { name: "Day of month, new item" })).toHaveValue("31");
  });

  it("shows what's missing when a draft is saved incomplete, and discards it", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Add item to Other" }));
    await user.click(screen.getByRole("button", { name: "Save new item" }));
    const draft = group("New expense item");
    expect(within(draft).getByRole("alert")).toHaveTextContent("Enter a name.");
    expect(within(draft).getByRole("alert")).toHaveTextContent("Enter an amount above $0.00.");
    expect(within(draft).getByRole("textbox", { name: "Amount, new item" })).toBeInvalid();

    await user.click(screen.getByRole("button", { name: "Discard new item" }));
    expect(screen.queryByRole("group", { name: "New expense item" })).not.toBeInTheDocument();
    expect(backend.calls.some((c) => c.path.includes("expense-items"))).toBe(false);
  });

  it("edits an item when focus leaves its row, sending only the change", async () => {
    const { backend, user } = renderPage();
    await loaded();
    const amount = within(group("Housing")).getByRole("textbox", { name: "Amount, Rent" });
    await user.clear(amount);
    await user.type(amount, "1250");
    await user.selectOptions(within(group("Housing")).getByRole("combobox", { name: "Category, Rent" }), "Housing");
    await user.click(document.body);
    await waitFor(() =>
      expect(lastCall(backend, "PATCH")).toEqual({
        method: "PATCH",
        path: "/v1/templates/t1/expense-items/e1",
        body: { amount_cents: 125000 },
      }),
    );
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,550.00"));
  });

  it("saves an edit made while the row's previous save is still in flight", async () => {
    const { backend, user } = renderPage();
    await loaded();
    const hold = holdNextPatch(backend);
    const amount = within(group("Housing")).getByRole("textbox", { name: "Amount, Rent" });
    await user.clear(amount);
    await user.type(amount, "1250{Enter}");
    await waitFor(() => expect(hold.held).toBe(true));
    await user.clear(amount);
    await user.type(amount, "1300{Enter}");
    hold.release();
    await waitFor(() => expect(patches(backend)).toEqual([{ amount_cents: 125000 }, { amount_cents: 130000 }]));
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,600.00"));
  });

  it("compares an edit made mid-save with what that save stored, not the stale row", async () => {
    const { backend, user } = renderPage();
    await loaded();
    const amount = within(group("Housing")).getByRole("textbox", { name: "Amount, Rent" });
    // Enter again with nothing new sends nothing more.
    let hold = holdNextPatch(backend);
    await user.clear(amount);
    await user.type(amount, "1250{Enter}");
    await waitFor(() => expect(hold.held).toBe(true));
    await user.type(amount, "{Enter}");
    hold.release();
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,550.00"));

    // Changing it back mid-save still saves, though it matches what the row last showed.
    hold = holdNextPatch(backend);
    await user.clear(amount);
    await user.type(amount, "1300{Enter}");
    await waitFor(() => expect(hold.held).toBe(true));
    await user.clear(amount);
    await user.type(amount, "1250{Enter}");
    hold.release();
    await waitFor(() =>
      expect(patches(backend)).toEqual([{ amount_cents: 125000 }, { amount_cents: 130000 }, { amount_cents: 125000 }]),
    );
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,550.00"));
  });

  it("keeps text typed back to the old value while a save is in flight, and saves it", async () => {
    const { backend, user } = renderPage();
    await loaded();
    const hold = holdNextPatch(backend);
    const amount = within(group("Housing")).getByRole("textbox", { name: "Amount, Rent" });
    await user.clear(amount);
    await user.type(amount, "1250{Enter}");
    await waitFor(() => expect(hold.held).toBe(true));
    await user.clear(amount);
    await user.type(amount, "1200.00");
    hold.release();
    // The save's result arrives without overwriting what was typed since.
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,550.00"));
    expect(amount).toHaveValue("1200.00");
    await user.type(amount, "{Enter}");
    await waitFor(() => expect(patches(backend)).toEqual([{ amount_cents: 125000 }, { amount_cents: 120000 }]));
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,500.00"));
  });

  it("saves an income edit made while the row's previous save is still in flight", async () => {
    const { backend, user } = renderPage();
    await loaded();
    const hold = holdNextPatch(backend);
    const net = within(group("Income")).getByRole("textbox", { name: "Net, Job A · Paycheck" });
    await user.clear(net);
    await user.type(net, "2000{Enter}");
    await waitFor(() => expect(hold.held).toBe(true));
    await user.clear(net);
    await user.type(net, "1900{Enter}");
    hold.release();
    await waitFor(() => expect(patches(backend)).toEqual([{ net_cents: 200000 }, { net_cents: 190000 }]));
    await waitFor(() => expect(tile("Net income")).toHaveTextContent("$1,900.00"));
  });

  it("moves an item to another category", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.selectOptions(within(group("Housing")).getByRole("combobox", { name: "Category, Rent" }), "Other");
    await user.tab();
    await user.click(document.body);
    await waitFor(() => expect(lastCall(backend, "PATCH")?.body).toEqual({ category_id: "9" }));
    expect(await within(group("Other")).findByRole("textbox", { name: "Amount, Rent" })).toBeInTheDocument();
    expect(within(group("Housing")).getByText(/No items/)).toBeInTheDocument();
  });

  it("removes an item", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Remove Brokerage" }));
    await waitFor(() =>
      expect(lastCall(backend, "DELETE")).toEqual({
        method: "DELETE",
        path: "/v1/templates/t1/expense-items/e2",
        body: undefined,
      }),
    );
    await waitFor(() => expect(tile("Planned spending")).toHaveTextContent("$1,200.00"));
    expect(tile("Planned spending")).not.toHaveTextContent("saved & invested");
  });

  it("adds an income item, keeping taxable and net within gross", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Add income" }));
    const draft = group("New income item");
    expect(within(draft).getByRole("combobox", { name: "Source, new income" })).toHaveFocus();
    await user.type(within(draft).getByRole("textbox", { name: "Label, new income" }), "Bonus");
    await user.type(within(draft).getByRole("textbox", { name: "Gross, new income" }), "500");
    await user.type(within(draft).getByRole("textbox", { name: "Gross taxable, new income" }), "600");
    await user.type(within(draft).getByRole("textbox", { name: "Net, new income" }), "400{Enter}");
    expect(within(draft).getByRole("alert")).toHaveTextContent("Gross taxable can’t be more than gross.");
    expect(backend.calls.some((c) => c.method === "POST")).toBe(false);

    const taxable = within(draft).getByRole("textbox", { name: "Gross taxable, new income" });
    await user.clear(taxable);
    await user.type(taxable, "500");
    await user.click(within(draft).getByRole("button", { name: "Save new income" }));
    await waitFor(() =>
      expect(lastCall(backend, "POST")).toEqual({
        method: "POST",
        path: "/v1/templates/t1/income-items",
        body: {
          income_source_id: "1",
          note: "Bonus",
          day_of_month: 1,
          gross_cents: 50000,
          gross_taxable_cents: 50000,
          net_cents: 40000,
        },
      }),
    );
    await waitFor(() => expect(tile("Net income")).toHaveTextContent("$2,500.00"));
    expect(screen.queryByRole("group", { name: "New income item" })).not.toBeInTheDocument();
  });

  it("renames and deletes the template", async () => {
    const { backend, user } = renderPage([standardMonth(), { ...standardMonth(), id: "t2", name: "Holiday month" }]);
    await loaded();
    // Sorted by name: Holiday month is first, so it is open by default.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Holiday month");
    await user.click(screen.getByRole("button", { name: /Standard month/ }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Standard month"));

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename template" });
    const field = within(dialog).getByLabelText("Template name");
    await user.clear(field);
    await user.type(field, "Usual month");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(lastCall(backend, "PATCH")).toEqual({ method: "PATCH", path: "/v1/templates/t1", body: { name: "Usual month" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Usual month"));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete “Usual month”?" });
    expect(confirm).toHaveAccessibleDescription("Its 3 items will be deleted with it.");
    await user.click(within(confirm).getByRole("button", { name: "Delete template" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(lastCall(backend, "DELETE")).toEqual({ method: "DELETE", path: "/v1/templates/t1", body: undefined });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Holiday month"));
    expect(screen.queryByRole("button", { name: /Usual month/ })).not.toBeInTheDocument();
  });

  it("adds several income items, one after another or side by side", async () => {
    const { backend, user } = renderPage();
    await loaded();
    for (const [label, amount] of [["One", "100"], ["Two", "200"]]) {
      await user.click(screen.getByRole("button", { name: "Add income" }));
      const draft = group("New income item");
      await user.type(within(draft).getByRole("textbox", { name: "Label, new income" }), label);
      await user.type(within(draft).getByRole("textbox", { name: "Gross, new income" }), amount);
      await user.type(within(draft).getByRole("textbox", { name: "Gross taxable, new income" }), amount);
      await user.type(within(draft).getByRole("textbox", { name: "Net, new income" }), amount);
      await user.click(within(draft).getByRole("button", { name: "Save new income" }));
      await waitFor(() => expect(screen.queryByRole("group", { name: "New income item" })).not.toBeInTheDocument());
    }
    await user.click(screen.getByRole("button", { name: "Add income" }));
    await user.click(screen.getByRole("button", { name: "Add income" }));
    expect(screen.getAllByRole("group", { name: "New income item" })).toHaveLength(2);
    expect(backend.calls.filter((c) => c.method === "POST")).toHaveLength(2);
    await waitFor(() => expect(tile("Net income")).toHaveTextContent("$2,400.00"));
  });

  it("keeps two items from one merchant apart by their notes", async () => {
    const { backend, user } = renderPage();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Add item to Other" }));
    const draft = group("New expense item");
    for (const [note, amount] of [["Apple Music", "10.99"], ["iCloud+", "2.99"]]) {
      await user.type(within(draft).getByRole("combobox", { name: "Name, new item" }), "Apple");
      await user.type(within(draft).getByRole("textbox", { name: "Note, new item" }), note);
      await user.type(within(draft).getByRole("textbox", { name: "Amount, new item" }), `${amount}{Enter}`);
      await waitFor(() => expect(within(draft).getByRole("textbox", { name: "Note, new item" })).toHaveValue(""));
    }
    const posts = backend.calls.filter((c) => c.method === "POST").map((c) => c.body);
    expect(posts).toEqual([
      { merchant_name: "Apple", category_id: "9", day_of_month: 1, amount_cents: 1099, note: "Apple Music" },
      { merchant_name: "Apple", category_id: "9", day_of_month: 1, amount_cents: 299, note: "iCloud+" },
    ]);
    const other = group("Other");
    expect(await within(other).findByRole("group", { name: "Apple · Apple Music" })).toBeInTheDocument();
    expect(within(other).getByRole("group", { name: "Apple · iCloud+" })).toBeInTheDocument();

    // Editing a note sends just the note; clearing it sends null.
    const note = within(other).getByRole("textbox", { name: "Note, Apple · iCloud+" });
    await user.clear(note);
    await user.click(document.body);
    await waitFor(() => expect(lastCall(backend, "PATCH")?.body).toEqual({ note: null }));
  });
});

