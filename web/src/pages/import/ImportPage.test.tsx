import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { ApiProvider, createApiClient, type ImportRecord, type ImportSummary } from "../../api";
import { ImportPage } from "./ImportPage";

const review: ImportRecord = {
  id: "7",
  file_name: "old.xlsx",
  status: "review",
  created_at: "2026-01-01T00:00:00Z",
  finished_at: null,
  first_month: "2023-01",
  last_month: "2024-12",
  rows_ready: 10,
  rows_with_problems: 8,
  entries_imported: 0,
  expense_rows: 15,
  income_rows: 3,
  years: [{ year: 2023, months: 12, expense_rows: 5, income_rows: 1, spent_cents: 12345, rows_with_problems: 8 }],
  months_with_existing_entries: [{ month: "2024-03", existing_entries: 4, file_entries: 2 }],
  issues: Array.from({ length: 7 }, (_, i) => ({
    sheet: "expenses" as const,
    row: i + 2,
    column: "Category",
    code: "unknown_category" as const,
    value: "Nope",
    message: "x",
  })),
  issues_truncated: false,
  failure_reason: null,
};
const summary = (over: Partial<ImportSummary>): ImportSummary => ({ ...review, ...over });

function sse(...frames: string[]) {
  const enc = new TextEncoder();
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

function setup(handler: (req: Request, path: string) => Response | undefined) {
  const calls: string[] = [];
  const fetch = (async (req: Request) => {
    const path = new URL(req.url).pathname;
    calls.push(`${req.method} ${path}`);
    return handler(req, path) ?? Response.json({ items: [] });
  }) as unknown as typeof globalThis.fetch;
  const api = createApiClient({ getToken: async () => "t", baseUrl: "http://api.test", fetch });
  render(
    <MemoryRouter>
      <ApiProvider client={api} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ImportPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return { calls, user: userEvent.setup() };
}

const xlsx = () => new File(["x"], "data.xlsx");

describe("ImportPage", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });

  it("starts on upload, shows steps and downloads the template", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { calls, user } = setup((_, p) => (p.endsWith("/template") ? new Response("x") : undefined));
    expect(await screen.findByRole("button", { name: "Choose file" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Import steps" })).toHaveTextContent("Get template");
    await user.click(screen.getByRole("button", { name: "Download template" }));
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(calls).toContain("GET /v1/imports/template");
  });

  it.each([
    ["invalid_import_file", 400, /isn't the import template/],
    ["file_too_large", 413, /over 10 MB/],
  ])("shows %s inline on upload", async (code, status, text) => {
    const { user } = setup((req) =>
      req.method === "POST" ? Response.json({ error: { code, message: "m" } }, { status }) : undefined,
    );
    await user.upload(await screen.findByLabelText("Import file"), xlsx());
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("reviews an upload: tiles, warning, years, grouped problems; then starts and shows progress", async () => {
    let started = false;
    const { calls, user } = setup((req, p) => {
      if (p === "/v1/imports/7" && req.method === "GET") return Response.json(started ? { ...review, status: "running" } : review);
      if (req.method === "POST" && p === "/v1/imports") return Response.json(review, { status: 201 });
      if (p.endsWith("/start")) {
        started = true;
        return Response.json({ ...review, status: "running" }, { status: 202 });
      }
      if (p.endsWith("/events"))
        return sse('event: progress\ndata: {"status":"running","rows_done":5,"rows_total":10,"current_month":"2023-03","eta_seconds":30,"years":[{"year":2023,"rows_done":5,"rows_total":10}]}\n\n');
      return undefined;
    });
    await user.upload(await screen.findByLabelText("Import file"), xlsx());
    expect(await screen.findByText("old.xlsx")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("March 2024");
    expect(screen.getByRole("cell", { name: "$123.45" })).toBeInTheDocument();
    expect(screen.getByText("Unknown category")).toBeInTheDocument();
    expect(screen.getByText("+ 2 more")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import 10 entries" }));
    const bar = await screen.findByRole("progressbar");
    await vi.waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));
    expect(bar).toHaveAttribute("aria-valuetext", expect.stringContaining("5 of 10"));
    expect(screen.getByText(/Months fill in as the import runs/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Summary while it runs" })).toHaveAttribute("href", "/summary");
    expect(calls).toContain("POST /v1/imports/7/start");
  });

  it("discards a review", async () => {
    const { calls, user } = setup((req, p) =>
      p === "/v1/imports" && req.method === "GET"
        ? Response.json({ items: [summary({})] })
        : p === "/v1/imports/7" && req.method === "GET"
          ? Response.json(review)
          : req.method === "DELETE"
            ? new Response(null, { status: 204 })
            : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "Choose a different file" }));
    expect(await screen.findByRole("button", { name: "Choose file" })).toBeInTheDocument();
    expect(calls).toContain("DELETE /v1/imports/7");
  });

  it("cancels a running import after confirming", async () => {
    let status: ImportRecord["status"] = "running";
    const { calls, user } = setup((req, p) => {
      if (p === "/v1/imports" && req.method === "GET") return Response.json({ items: [summary({ status })] });
      if (p === "/v1/imports/7" && req.method === "GET") return Response.json({ ...review, status });
      if (p.endsWith("/events")) return sse(": ping\n\n");
      if (p.endsWith("/cancel")) {
        status = "cancelled";
        return Response.json({ ...review, status });
      }
      return undefined;
    });
    await user.click(await screen.findByRole("button", { name: "Cancel import" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /Cancel import and remove/ }));
    expect(await screen.findByText("Import cancelled")).toBeInTheDocument();
    expect(calls).toContain("POST /v1/imports/7/cancel");
  });

  it("shows the finished stage when the stream finishes", async () => {
    const done = { ...review, status: "completed", entries_imported: 10 };
    let finished = false;
    const { user } = setup((req, p) => {
      const status = finished ? "completed" : "running";
      if (p === "/v1/imports" && req.method === "GET") return Response.json({ items: [summary({ status })] });
      if (p === "/v1/imports/7" && req.method === "GET") return Response.json(finished ? done : { ...review, status });
      if (p.endsWith("/events")) {
        finished = true;
        return sse(`event: finished\ndata: ${JSON.stringify(done)}\n\n`);
      }
      return undefined;
    });
    expect(await screen.findByText("Import finished")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Yearly" })).toHaveAttribute("href", "/yearly");
    expect(screen.getByRole("button", { name: "Download skipped rows" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import another file" }));
    expect(await screen.findByRole("button", { name: "Choose file" })).toBeInTheDocument();
  });

  it("lists history with chips and undoes a completed import", async () => {
    const { calls, user } = setup((req, p) => {
      if (p === "/v1/imports" && req.method === "GET")
        return Response.json({
          items: [
            summary({ id: "3", file_name: "a.xlsx", status: "completed", entries_imported: 4 }),
            summary({ id: "2", file_name: "b.xlsx", status: "failed" }),
          ],
        });
      if (p.endsWith("/undo")) return Response.json({ ...review, id: "3", status: "undone" });
      return undefined;
    });
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Undo/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Undo import and delete/ }));
    await vi.waitFor(() => expect(calls).toContain("POST /v1/imports/3/undo"));
  });

  it("shows an undo error in the dialog", async () => {
    const { user } = setup((req, p) => {
      if (p === "/v1/imports" && req.method === "GET")
        return Response.json({ items: [summary({ id: "3", status: "completed" })] });
      if (p.endsWith("/undo")) return Response.json({ error: { code: "import_wrong_status", message: "no" } }, { status: 409 });
      return undefined;
    });
    await user.click(await screen.findByRole("button", { name: /Undo/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Undo import and delete/ }));
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toBeInTheDocument();
  });
});
