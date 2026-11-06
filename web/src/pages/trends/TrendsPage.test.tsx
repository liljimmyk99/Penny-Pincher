import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ApiProvider, createApiClient } from "../../api";
import { todayISO } from "../../lib/dates";
import { TrendsPage } from "./TrendsPage";

const month = todayISO().slice(0, 7);
const saved = { id: "s1", name: "Coffee", match_type: "merchant", merchant_id: "m1", category_id: null, match_text: null, measure: "amount", sort_order: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function renderPage(list = [saved]) {
  const posted: unknown[] = [];
  const fetchMock = vi.fn(async (req: Request) => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/v1/saved-trends" && req.method === "POST") {
      const body = await req.json();
      posted.push(body);
      return Response.json({ ...saved, id: "s2", ...body }, { status: 201 });
    }
    if (path === "/v1/saved-trends") return Response.json({ items: list });
    if (path === "/v1/trends/custom") {
      const buckets = Array.from({ length: 12 }, (_, i) => ({ period: i === 11 ? month : `1999-${String(i + 1).padStart(2, "0")}`, total_cents: i === 11 ? 1500 : 0, count: i === 11 ? 2 : 0 }));
      return Response.json({ group_by: "month", buckets });
    }
    if (path === "/v1/merchants") return Response.json({ items: [{ id: "m1", name: "Beans" }], next_cursor: null });
    if (path === "/v1/categories") return Response.json({ items: [{ id: "c1", name: "Food" }], next_cursor: null });
    if (path === "/v1/expenses")
      return Response.json({
        items: [
          { id: "e1", date: `${month}-02`, amount_cents: 1500, type: "expense", category_id: "c1", merchant: { id: "m1", name: "Beans" }, note: null },
          { id: "e2", date: `${month}-03`, amount_cents: 900, type: "expense", category_id: "c1", merchant: { id: "m2", name: "Other" }, note: null },
        ],
        next_cursor: null,
      });
    return Response.json({}, { status: 404 });
  });
  const client = createApiClient({ baseUrl: "http://api.test", getToken: async () => "tok", fetch: fetchMock as unknown as typeof fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={["/trends"]}>
        <Routes>
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/transactions" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  return { posted };
}

describe("TrendsPage custom trends", () => {
  it("lists saved trends and shows the selected trend's tiles and text alternatives", async () => {
    renderPage();
    const item = await screen.findByRole("button", { name: /Coffee/ });
    expect(await within(item).findByText(/Merchant: Beans · Amount/)).toBeInTheDocument();
    expect(within(item).getByText(/Last 12 months, amount/)).toBeInTheDocument();
    const tiles = await screen.findByRole("group", { name: "Trend totals" });
    expect(within(tiles).getByText("Year to date")).toBeInTheDocument();
    expect(within(tiles).getAllByText("$15.00").length).toBeGreaterThan(0);
    expect(within(tiles).getByText("$7.50")).toBeInTheDocument(); // per visit
    expect(screen.getByRole("list", { name: "Coffee, amount per month" })).toBeInTheDocument();
  });

  it("switches to Count", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Trend totals" });
    await userEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(screen.getByRole("list", { name: "Coffee, count per month" })).toBeInTheDocument();
  });

  it("lists a month's matching entries and links to Transactions", async () => {
    renderPage();
    const bars = await screen.findAllByRole("button", { name: /Show entries/ });
    await userEvent.click(bars[11]);
    expect(await screen.findByText("$15.00", { selector: ".trends__row-amount" })).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Open in Transactions" }));
    expect(screen.getByTestId("where")).toHaveTextContent(`/transactions?month=${month}&q=Beans`);
  });

  it("creates a trend by note text", async () => {
    const { posted } = renderPage([]);
    await userEvent.click(await screen.findByRole("button", { name: "New trend" }));
    await userEvent.type(screen.getByLabelText("Name"), "Gym");
    await userEvent.selectOptions(screen.getByLabelText("Match by"), "note");
    await userEvent.type(screen.getByLabelText("Note contains"), "membership");
    await userEvent.click(screen.getByRole("button", { name: "Save trend" }));
    await vi.waitFor(() => expect(posted).toEqual([{ name: "Gym", match_type: "note", match_text: "membership", measure: "amount" }]));
  });

  it("asks for a value before saving", async () => {
    const { posted } = renderPage([]);
    await userEvent.click(await screen.findByRole("button", { name: "New trend" }));
    await userEvent.type(screen.getByLabelText("Name"), "Gym");
    await userEvent.click(screen.getByRole("button", { name: "Save trend" }));
    expect(await screen.findByText("Choose a merchant.")).toBeInTheDocument();
    expect(posted).toEqual([]);
  });
});
