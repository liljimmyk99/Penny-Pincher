import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ApiProvider, createApiClient } from "../../api";
import { ExportPage } from "./ExportPage";

function setup(response: Response) {
  const urls: string[] = [];
  const fetch = (async (req: Request) => {
    urls.push(req.url);
    return response;
  }) as unknown as typeof globalThis.fetch;
  const api = createApiClient({ getToken: async () => "t", baseUrl: "http://api.test", fetch });
  render(
    <ApiProvider client={api} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ExportPage />
    </ApiProvider>,
  );
  return { urls, user: userEvent.setup() };
}

describe("ExportPage", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });

  it("downloads the chosen format and range", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { urls, user } = setup(
      new Response("zip", { headers: { "Content-Disposition": 'attachment; filename="export.zip"' } }),
    );
    await user.click(screen.getByLabelText(/CSV/));
    await user.type(screen.getByLabelText(/From/), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("Downloaded export.zip")).toBeInTheDocument();
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe("/v1/export");
    expect(url.searchParams.get("format")).toBe("csv");
    expect(url.searchParams.get("from")).toBe("2026-01-01");
    expect(url.searchParams.has("to")).toBe(false);
    expect(click).toHaveBeenCalled();
  });

  it("shows the server's error", async () => {
    const { user } = setup(Response.json({ error: { code: "rate_limited", message: "Slow down" } }, { status: 429 }));
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
