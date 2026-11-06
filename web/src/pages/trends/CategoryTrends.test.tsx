import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ApiProvider, createApiClient } from "../../api";
import { todayISO } from "../../lib/dates";
import { TrendsPage } from "./TrendsPage";

const year = Number(todayISO().slice(0, 4));
const pad = (v: number[]) => [...v, ...Array(12 - v.length).fill(0)];
const series = (id: string | null, name: string, is_saving: boolean, t: number[], l: number[]) => ({ category_id: id, name, color: null, is_saving, this_year_cents: pad(t), last_year_cents: pad(l) });

function renderTab() {
  const data = {
    year,
    all_spending: series(null, "All spending", false, Array(12).fill(1000), Array(12).fill(800)),
    categories: [
      series("c1", "Food", false, Array(12).fill(600), Array(12).fill(400)),
      series("c2", "Saving", true, Array(12).fill(400), Array(12).fill(500)),
    ],
  };
  const fetchMock = vi.fn(async (req: Request) =>
    new URL(req.url).pathname === "/v1/trends/by-category" ? Response.json(data) : Response.json({}, { status: 404 }));
  const client = createApiClient({ baseUrl: "http://api.test", getToken: async () => "tok", fetch: fetchMock as unknown as typeof fetch });
  render(
    <ApiProvider client={client} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/trends?tab=category"]}><TrendsPage /></MemoryRouter>
    </ApiProvider>,
  );
}

describe("TrendsPage by category", () => {
  it("shows chips, tiles and movers; Saving's change colours are flipped", async () => {
    renderTab();
    expect(await screen.findByRole("button", { name: "All spending" })).toHaveAttribute("aria-pressed", "true");
    const tiles = screen.getByRole("group", { name: /^All spending,/ });
    // All spending went up vs. last year: worse (orange), with arrow and sign.
    const yoy = within(tiles).getByText(/Worse: \+\$2\.00/);
    expect(yoy.closest(".change")).toHaveClass("change--worse");
    expect(within(tiles).getAllByText(/▲ \+\$2\.00/).length).toBeGreaterThan(0);

    const movers = screen.getByRole("list", { name: /Biggest movers/ });
    const food = within(movers).getByRole("button", { name: /^Food, worse \+\$2\.00/ });
    expect(food).toBeInTheDocument();
    // Saving fell: shown as worse (orange) with a down arrow and minus.
    expect(within(movers).getByRole("button", { name: /^Saving, worse −\$1\.00/ })).toBeInTheDocument();
  });

  it("charts a category when its mover is clicked, and flips Saving's tone in the tiles", async () => {
    renderTab();
    const user = userEvent.setup();
    const movers = await screen.findByRole("list", { name: /Biggest movers/ });
    await user.click(within(movers).getByRole("button", { name: /^Saving/ }));
    expect(within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: /^Saving/ })).toHaveAttribute("aria-pressed", "true");
    const tiles = screen.getByRole("group", { name: /^Saving,/ });
    expect(within(tiles).getByText(/Worse: −\$1\.00/).closest(".change")).toHaveClass("change--worse");
  });

  it("clicking a month in the paired bars selects it", async () => {
    renderTab();
    const user = userEvent.setup();
    const pairs = await screen.findByRole("list", { name: /per month, \d+ and \d+/ });
    const jan = within(pairs).getByRole("button", { name: /^January:/ });
    await user.click(jan);
    expect(jan).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("January spend")).toBeInTheDocument();
  });
});
