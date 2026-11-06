import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { emptySummary } from "../../test/summary";
import { SummaryPage } from "./SummaryPage";

const MONTH = "2020-03";
const stamp = "2020-01-01T00:00:00Z";

type Summary = Schemas["MonthlySummary"];
type SummaryCategory = Summary["spending"]["categories"][number];

const cat = (id: string, name: string, total: number, previous: number, extra: Partial<SummaryCategory> = {}): SummaryCategory => ({
  category_id: id,
  name,
  color: null,
  is_saving: false,
  is_protected: false,
  total_cents: total,
  expense_count: total === 0 ? 0 : 1,
  refund_count: 0,
  previous_month_total_cents: previous,
  ...extra,
});

function filledSummary(): Summary {
  return {
    ...emptySummary(MONTH),
    is_empty: false,
    income: {
      sources: [
        { income_source_id: "s1", name: "Employer A", is_protected: false, gross_cents: 300000, gross_taxable_cents: 280000, net_cents: 210000, entry_count: 1 },
        { income_source_id: "s2", name: "Side job", is_protected: false, gross_cents: 50000, gross_taxable_cents: 0, net_cents: 50000, entry_count: 1 },
        { income_source_id: "s9", name: "Other", is_protected: true, gross_cents: 0, gross_taxable_cents: 0, net_cents: 0, entry_count: 0 },
      ],
      combined: { gross_cents: 350000, gross_taxable_cents: 280000, net_cents: 260000, entry_count: 2 },
    },
    spending: {
      categories: [
        cat("c1", "Saving", 30000, 20000, { is_saving: true }),
        cat("c2", "Food", 45000, 40000),
        cat("c3", "Housing", 100000, 120000),
        cat("c4", "Utilities", 0, 0),
        cat("c9", "Other", 0, 0, { is_protected: true }),
      ],
      total_cents: 175000,
      saving_cents: 30000,
      previous_month_total_cents: 180000,
    },
    left_over_cents: 85000,
  };
}

const incomeEntry = (id: string, source: string, extra: Partial<Schemas["IncomeEntry"]> = {}): Schemas["IncomeEntry"] => ({
  id,
  date: "2020-03-15",
  income_source_id: source,
  gross_cents: 300000,
  gross_taxable_cents: 280000,
  net_cents: 210000,
  note: "Paycheck",
  confirmed: true,
  template_apply_id: null,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

function renderPage(summary: Summary, { path = `/summary?month=${MONTH}`, unconfirmed = false } = {}) {
  const incomeEntries = [
    incomeEntry("i1", "s1"),
    incomeEntry("i2", "s2", { date: "2020-03-05", gross_cents: 50000, gross_taxable_cents: 0, net_cents: 50000, note: null }),
  ];
  const fetchMock = vi.fn(async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/v1/summaries/monthly/")) return Response.json(summary);
    if (url.pathname === "/v1/income-entries") {
      const items = incomeEntries.map((e) => (unconfirmed ? { ...e, confirmed: false } : e));
      return Response.json({ items, next_cursor: null });
    }
    return Response.json({ items: [], next_cursor: null });
  });
  const client = createApiClient({ baseUrl: "http://api.test", getToken: async () => "tok", fetch: fetchMock as unknown as typeof fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/summary" element={<SummaryPage />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  return { user: userEvent.setup(), fetchMock };
}

const tiles = () => screen.getByRole("group", { name: /totals$/ });
const tile = (label: string) => within(tiles()).getByText(label).closest(".tile") as HTMLElement;
const row = (name: RegExp) => screen.getByRole("button", { name });

describe("SummaryPage", () => {
  it("shows the four tiles with formatted money", async () => {
    renderPage(filledSummary());
    await screen.findByRole("group", { name: "March 2020 totals" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Summary");
    expect(screen.getByRole("group", { name: "Month" })).toHaveTextContent("March 2020");
    expect(tile("Net income")).toHaveTextContent("$2,600.00");
    expect(tile("Spent")).toHaveTextContent("$1,750.00");
    expect(tile("Saved & invested")).toHaveTextContent("$300.00");
    expect(tile("Saved & invested")).toHaveTextContent("Counted in Spent");
    expect(tile("Left over")).toHaveTextContent("$850.00");
  });

  it("changes month from the switcher", async () => {
    const { user, fetchMock } = renderPage(filledSummary());
    await screen.findByRole("group", { name: "March 2020 totals" });
    await user.click(screen.getByRole("button", { name: /^Previous month/ }));
    await screen.findByRole("group", { name: "February 2020 totals" });
    expect(fetchMock.mock.calls.some(([r]) => new URL(r.url).pathname === "/v1/summaries/monthly/2020-02")).toBe(true);
  });

  it("ranks categories with percent of net income and change vs. last month", async () => {
    renderPage(filledSummary());
    await screen.findByRole("list", { name: "Spending by category" });

    const names = within(screen.getByRole("list", { name: "Spending by category" }))
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Housing, $1,000.00, 38% of income, better −$200.00 (−17%) vs. last month",
      "Food, $450.00, 17% of income, worse +$50.00 (+13%) vs. last month",
      "Saving, $300.00, 12% of income, better +$100.00 (+50%) vs. last month",
    ]);
    // Categories with nothing spent have no bar.
    expect(screen.queryByRole("button", { name: /^Utilities/ })).not.toBeInTheDocument();
  });

  it("colours change by meaning: orange is worse, blue is better, and Saving flips", async () => {
    renderPage(filledSummary());
    await screen.findByRole("list", { name: "Spending by category" });

    const change = (name: RegExp) => within(row(name)).getByText(/[▲▼]/).closest(".change");
    expect(change(/^Food/)).toHaveClass("change--worse"); // spent more
    expect(change(/^Housing/)).toHaveClass("change--better"); // spent less
    expect(change(/^Saving/)).toHaveClass("change--better"); // saved more: the flip
    expect(within(row(/^Food/)).getByText(/▲/)).toHaveTextContent("▲ +$50.00 (+13%)");
    expect(within(row(/^Housing/)).getByText(/▼/)).toHaveTextContent("▼ −$200.00 (−17%)");
    // Overall spending went down vs. last month.
    expect(within(tile("Spent")).getByText(/▼/).closest(".change")).toHaveClass("change--better");
    // Saved more than last month: better, with an up arrow.
    expect(within(tile("Saved & invested")).getByText(/▲/).closest(".change")).toHaveClass("change--better");
  });

  it("gives Saving its own treatment", async () => {
    renderPage(filledSummary());
    await screen.findByRole("list", { name: "Spending by category" });
    expect(within(row(/^Saving/)).getByText("Saving", { selector: ".badge" })).toHaveClass("badge--saving");
  });

  it("only highlights a category when its row is clicked", async () => {
    const { user, fetchMock } = renderPage(filledSummary());
    await screen.findByRole("list", { name: "Spending by category" });
    const calls = fetchMock.mock.calls.length;

    await user.click(row(/^Food/));
    expect(row(/^Food/)).toHaveAttribute("aria-pressed", "true");
    expect(row(/^Food/)).toHaveClass("is-highlighted");
    expect(row(/^Housing/)).toHaveClass("is-dimmed");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(calls); // no extra information is loaded

    await user.click(row(/^Food/));
    expect(row(/^Food/)).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles between Bars and Donut for the same month's data", async () => {
    const { user } = renderPage(filledSummary());
    await screen.findByRole("list", { name: "Spending by category" });
    expect(screen.getByRole("button", { name: "Bars" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Donut" }));
    expect(screen.getByRole("button", { name: "Donut" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Spending by category, $1,750.00 in total" })).toBeInTheDocument();
    const legend = within(screen.getByRole("list", { name: "Spending by category" })).getAllByRole("button");
    expect(legend).toHaveLength(3);
    // The legend rows still only highlight.
    await user.click(legend[1]);
    expect(legend[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a source's entries in a modal, with tax rate and all sources combined", async () => {
    const { user } = renderPage(filledSummary());
    await user.click(await screen.findByRole("button", { name: /^Employer A, \$2,100.00 net/ }));

    const dialog = await screen.findByRole("dialog", { name: "Employer A" });
    await within(dialog).findByRole("cell", { name: "Paycheck" });
    const rows = within(dialog).getAllByRole("row");
    expect(rows).toHaveLength(4); // header, one entry, source total, combined
    expect(rows[1]).toHaveTextContent("Mar 15Paycheck$3,000.00$2,800.00$2,100.0025.0%");
    expect(rows[2]).toHaveTextContent("Employer A$3,000.00$2,800.00$2,100.0025.0%");
    expect(rows[3]).toHaveTextContent("All sources combined$3,500.00$2,800.00$2,600.007.1%");
    // The other source's entry is not listed here.
    expect(within(dialog).queryByText("Mar 5")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no tax rate for a source without taxable income", async () => {
    const { user } = renderPage(filledSummary());
    await user.click(await screen.findByRole("button", { name: /^Side job/ }));
    const dialog = await screen.findByRole("dialog", { name: "Side job" });
    await within(dialog).findAllByRole("cell", { name: "$500.00" });
    expect(within(dialog).getAllByRole("row")[2]).toHaveTextContent("Side job$500.00$0.00$500.00—");
  });

  it("flags unconfirmed template copies with a count", async () => {
    const summary = { ...filledSummary(), unconfirmed: { expense_count: 0, income_entry_count: 2 } };
    renderPage(summary, { unconfirmed: true });
    const banner = await screen.findByRole("region", { name: "Unconfirmed items" });
    expect(banner).toHaveTextContent("2 items");
    expect(within(banner).getByRole("link", { name: "Review in Transactions" })).toHaveAttribute("href", "/transactions?month=2020-03");
  });
});

describe("SummaryPage: empty states", () => {
  it("shows muted $0.00 tiles and dashed panels with Add buttons for an empty month", async () => {
    renderPage(emptySummary(MONTH), { path: "/summary?month=2020-03" });
    await screen.findByRole("group", { name: "March 2020 totals" });

    for (const label of ["Net income", "Spent", "Saved & invested", "Left over"]) {
      expect(tile(label)).toHaveTextContent("$0.00");
      expect(within(tile(label)).getByText("$0.00")).toHaveClass("tile__value--muted");
    }
    expect(screen.getByRole("link", { name: "Add income" })).toHaveAttribute("href", "/add?month=2020-03");
    expect(screen.getByRole("link", { name: "Add expenses" })).toHaveAttribute("href", "/add?month=2020-03");
    expect(screen.queryByRole("button", { name: "Bars" })).not.toBeInTheDocument();
    // The new-month offer is there, since the month has nothing.
    expect(await screen.findByRole("heading", { name: "Start March from your template?" })).toBeInTheDocument();
  });

  it("welcomes a new account on the current month, and the card can be hidden", async () => {
    localStorage.clear();
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { user } = renderPage(emptySummary(month), { path: "/summary" });

    const welcome = await screen.findByRole("region", { name: "Let’s get you set up" });
    expect(within(welcome).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Check your categories & sources",
      "Build a template month",
      "Log your first entry",
    ]);
    expect(within(welcome).getByRole("progressbar", { name: "Setup progress" })).toHaveAttribute("aria-valuenow", "0");
    expect(welcome).toHaveTextContent("Yearly and Trends fill in");

    await user.click(within(welcome).getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region", { name: "Let’s get you set up" })).not.toBeInTheDocument();
    localStorage.clear();
  });

  it("does not welcome anyone on a past month", async () => {
    renderPage(emptySummary(MONTH));
    await screen.findByRole("group", { name: "March 2020 totals" });
    expect(screen.queryByRole("region", { name: "Let’s get you set up" })).not.toBeInTheDocument();
  });
});
