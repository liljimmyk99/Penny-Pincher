import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { YearlyPage } from "./YearlyPage";

type Yearly = Schemas["YearlySummary"];

function summary(year: number, filled: boolean): Yearly {
  const months = Array.from({ length: 12 }, (_, i) => {
    const has = filled && i < 2;
    return {
      month: `${year}-${String(i + 1).padStart(2, "0")}`,
      gross_cents: has ? 400000 : 0,
      gross_taxable_cents: has ? 380000 : 0,
      net_cents: has ? 300000 : 0,
      spent_cents: has ? 200000 : 0,
      saving_cents: has ? 50000 : 0,
      left_over_cents: has ? 100000 : 0,
      has_entries: has,
    };
  });
  const cat = (id: string, name: string, total: number, extra: Partial<Yearly["categories"][number]> = {}) => ({
    category_id: id, name, color: null, is_saving: false, is_protected: false,
    total_cents: total, monthly_average_cents: filled ? Math.round(total / 2) : 0, ...extra,
  });
  return {
    year,
    months,
    categories: filled
      ? [cat("c1", "Saving", 100000, { is_saving: true }), cat("c2", "Housing", 300000), cat("c3", "Food", 0)]
      : [cat("c2", "Housing", 0)],
    totals: filled
      ? { gross_cents: 800000, gross_taxable_cents: 760000, net_cents: 600000, spent_cents: 400000, saving_cents: 100000, left_over_cents: 200000 }
      : { gross_cents: 0, gross_taxable_cents: 0, net_cents: 0, spent_cents: 0, saving_cents: 0, left_over_cents: 0 },
    average_month_count: filled ? 2 : 0,
  };
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function renderPage(filled = true, path = "/yearly?year=2020") {
  const fetchMock = vi.fn(async (req: Request) => {
    const year = Number(/\/v1\/summaries\/yearly\/(\d+)$/.exec(new URL(req.url).pathname)?.[1]);
    return Response.json(summary(year, filled));
  });
  const client = createApiClient({ baseUrl: "http://api.test", getToken: async () => "tok", fetch: fetchMock as unknown as typeof fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/yearly" element={<YearlyPage />} />
          <Route path="/summary" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  return { user: userEvent.setup(), fetchMock };
}

const tile = (label: string) => screen.getByText(label, { selector: ".tile__label" }).closest(".tile") as HTMLElement;

describe("YearlyPage", () => {
  it("shows tiles with monthly averages", async () => {
    renderPage();
    await screen.findByRole("group", { name: "2020 totals" });
    expect(tile("Net income")).toHaveTextContent("$6,000.00");
    expect(tile("Net income")).toHaveTextContent("$3,000.00 / month average");
    expect(tile("Spent")).toHaveTextContent("$4,000.00");
    expect(tile("Saved & invested")).toHaveTextContent("$1,000.00");
    expect(tile("Left over")).toHaveTextContent("$2,000.00");
  });

  it("switches year", async () => {
    const { user, fetchMock } = renderPage();
    await screen.findByRole("group", { name: "2020 totals" });
    await user.click(screen.getByRole("button", { name: /^Previous year/ }));
    await screen.findByRole("group", { name: "2019 totals" });
    expect(fetchMock.mock.calls.some(([r]) => new URL(r.url).pathname === "/v1/summaries/yearly/2019")).toBe(true);
  });

  it("charts have text alternatives and a month opens its summary", async () => {
    const { user } = renderPage();
    const chart = await screen.findByRole("list", { name: "Net income and spent per month" });
    const jan = within(chart).getByRole("button", { name: /^January: net income \$3,000.00, spent \$2,000.00/ });
    await user.click(jan);
    expect(screen.getByTestId("where")).toHaveTextContent("/summary?month=2020-01");
  });

  it("ranks monthly category averages, leaving out zeros", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Monthly average spending by category" });
    const names = within(list).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Housing, $1,500.00, $3,000.00 for the year", "Saving, $500.00, $1,000.00 for the year"]);
  });

  it("has a month table with total and average rows; a row opens that month", async () => {
    const { user } = renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 12 + 2);
    const total = within(table).getByRole("row", { name: /^Total/ });
    expect(total).toHaveTextContent("$6,000.00$4,000.00$2,000.00");
    expect(within(table).getByRole("row", { name: /^Monthly average/ })).toHaveTextContent("$3,000.00$2,000.00$1,000.00");
    await user.click(within(table).getByRole("row", { name: /^February/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/summary?month=2020-02");
  });

  it("explains an empty year", async () => {
    renderPage(false);
    await screen.findByText(/Nothing logged in 2020 yet/);
    expect(tile("Spent")).toHaveTextContent("$0.00");
    expect(screen.getByText("No spending logged in 2020.")).toBeInTheDocument();
  });
});
