import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ApiProvider, createApiClient, followImport } from "../../api";
import { fakeAuth, testUser } from "../../test/fakeAuth";
import { ImportBanner } from "./ImportBanner";

const enc = new TextEncoder();
function sse(...frames: string[]) {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const f of frames) c.enqueue(enc.encode(f));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const summary = { id: "imp1", file_name: "old-years.xlsx", status: "running" };
const progress = { status: "running", rows_done: 250, rows_total: 1000, current_month: "2020-03", eta_seconds: 120, years: [] };
const record = (status: string) => ({ ...summary, status, entries_imported: 1000 });

function makeApi(handler: (path: string, calls: string[]) => Response) {
  const calls: string[] = [];
  const auth = fakeAuth(testUser);
  const fetchMock = vi.fn(async (input: Request | string) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(url.pathname + url.search);
    return handler(url.pathname, calls);
  });
  const api = createApiClient({
    baseUrl: "http://api.test",
    getToken: auth.getToken,
    onSessionError: () => undefined,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { api, calls };
}

function renderBanner(handler: (path: string, calls: string[]) => Response) {
  const { api, calls } = makeApi(handler);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={api} queryClient={queryClient}>
      <MemoryRouter>
        <ImportBanner />
      </MemoryRouter>
    </ApiProvider>,
  );
  return calls;
}

describe("ImportBanner", () => {
  it("renders nothing when no import is running", async () => {
    const calls = renderBanner(() => json({ items: [] }));
    await waitFor(() => expect(calls).toContain("/v1/imports?status=running"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resumes a running import on load and shows progress", async () => {
    renderBanner((path) => {
      if (path === "/v1/imports") return json({ items: [summary] });
      return sse(frame("progress", progress), "\n"); // stays unfinished; reconnect is slow
    });
    const banner = await screen.findByRole("status", { name: "Import progress" });
    await waitFor(() => expect(banner).toHaveTextContent("25%"));
    expect(banner).toHaveTextContent("old-years.xlsx");
    expect(banner).toHaveTextContent("about 2 min left");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("link", { name: "View progress" })).toHaveAttribute("href", "/import");
  });

  it("shows a finished banner that can be dismissed", async () => {
    let finished = false;
    renderBanner((path) => {
      if (path === "/v1/imports") return json({ items: finished ? [] : [summary] });
      finished = true;
      return sse(frame("finished", record("completed")));
    });
    const banner = await screen.findByRole("status", { name: "Import result" });
    expect(banner).toHaveTextContent("1,000 entries added");
    expect(screen.getByRole("link", { name: "View details" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status", { name: "Import result" })).toBeNull();
  });

  it("shows an alert when the import stopped", async () => {
    let finished = false;
    renderBanner((path) => {
      if (path === "/v1/imports") return json({ items: finished ? [] : [summary] });
      finished = true;
      return sse(frame("finished", record("failed")));
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nothing was saved");
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/import");
  });
});

describe("followImport", () => {
  it("refetches the import when the stream drops and finishes if it is no longer running", async () => {
    const { api, calls } = makeApi((path) =>
      path.endsWith("/events") ? sse(frame("progress", progress)) : json(record("completed")),
    );
    const onProgress = vi.fn();
    const onFinished = vi.fn();
    await followImport(api, "imp1", { onProgress, onFinished }, new AbortController().signal, 1);
    expect(onProgress).toHaveBeenCalledWith(progress);
    expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(calls).toEqual(["/v1/imports/imp1/events", "/v1/imports/imp1"]);
  });

  it("reconnects while the import is still running, and ignores pings", async () => {
    let streams = 0;
    const { api } = makeApi((path) => {
      if (!path.endsWith("/events")) return json(record("running"));
      streams += 1;
      return streams === 1 ? sse(": ping\n\n") : sse(frame("finished", record("completed")));
    });
    const onFinished = vi.fn();
    await followImport(api, "imp1", { onProgress: vi.fn(), onFinished }, new AbortController().signal, 1);
    expect(streams).toBe(2);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
