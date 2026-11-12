import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { AdminPage } from "./AdminPage";
import { formatBytes, formatUptime } from "./format";

const stamp = "2026-11-01T10:00:00Z";

function backup(id: string, kind: Schemas["Backup"]["kind"], extra: Partial<Schemas["Backup"]> = {}): Schemas["Backup"] {
  return {
    id,
    kind,
    status: "succeeded",
    started_at: stamp,
    finished_at: stamp,
    size_bytes: 2048,
    error_message: null,
    ...extra,
  };
}

const status: Schemas["AdminStatus"] = {
  version: "1.2.3",
  started_at: stamp,
  uptime_seconds: 90061,
  database: { size_bytes: 1536, last_write_at: stamp },
  backups: {
    schedule: "Weekly on Sundays, monthly on the 1st",
    retention: { weekly: 8, monthly: 12 },
    last_run: backup("1", "weekly"),
    next_weekly_at: "2026-11-08T03:00:00Z",
    next_monthly_at: "2026-12-01T03:00:00Z",
  },
  auth_provider: { status: "ok", checked_at: stamp },
};

function renderPage(items: Schemas["Backup"][], overrides: { status?: Schemas["AdminStatus"]; download?: Response } = {}) {
  const calls: string[] = [];
  const fetch = (async (req: Request) => {
    const { pathname } = new URL(req.url);
    calls.push(`${req.method} ${pathname}`);
    if (pathname === "/v1/admin/status") return Response.json(overrides.status ?? status);
    if (req.method === "POST" && pathname === "/v1/admin/backups") {
      const started = backup("9", "manual", { status: "running", finished_at: null, size_bytes: null });
      items = [started, ...items];
      return Response.json(started, { status: 202 });
    }
    if (pathname === "/v1/admin/backups") return Response.json({ items });
    if (pathname.endsWith("/download")) return overrides.download ?? new Response("x", { status: 200 });
    return Response.json({ error: { code: "not_found", message: "no" } }, { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  const api = createApiClient({ getToken: async () => "t", baseUrl: "http://api.test", fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={api} queryClient={queryClient}>
      <AdminPage />
    </ApiProvider>,
  );
  return { calls, user: userEvent.setup() };
}

describe("AdminPage", () => {
  it("shows the four status tiles", async () => {
    renderPage([backup("1", "weekly")]);
    const tiles = await screen.findByRole("region", { name: "App status" });
    expect(within(tiles).getByText("1.2.3")).toBeInTheDocument();
    expect(within(tiles).getByText("1d 1h")).toBeInTheDocument();
    expect(within(tiles).getByText("1.5 KB")).toBeInTheDocument();
    expect(within(tiles).getByText("Weekly · Succeeded")).toBeInTheDocument();
    expect(within(tiles).getByText("Firebase connected")).toBeInTheDocument();
  });

  it("flags an unreachable sign-in provider", async () => {
    renderPage([], { status: { ...status, auth_provider: { status: "unreachable", checked_at: stamp } } });
    expect(await screen.findByText("Firebase unreachable")).toBeInTheDocument();
  });

  it("lists backups with Download only for succeeded ones", async () => {
    renderPage([
      backup("3", "manual", { status: "failed", size_bytes: null, error_message: "bucket unreachable" }),
      backup("2", "monthly"),
      backup("1", "weekly"),
    ]);
    const table = await screen.findByRole("table", { name: /backup snapshots/i });
    expect(within(table).getAllByRole("button", { name: /download/i })).toHaveLength(2);
    expect(within(table).getByText("bucket unreachable")).toBeInTheDocument();
  });

  it("starts a backup and confirms with a toast", async () => {
    const { calls, user } = renderPage([backup("1", "weekly")]);
    await user.click(await screen.findByRole("button", { name: "Back up now" }));
    await waitFor(() => expect(calls).toContain("POST /v1/admin/backups"));
    expect(await screen.findByText("Backup started")).toBeInTheDocument();
  });

  it("links to the Firebase console and builds no account management", async () => {
    renderPage([]);
    expect(screen.getByRole("link", { name: /firebase console/i })).toHaveAttribute("href", expect.stringContaining("console.firebase.google.com"));
    expect(screen.queryByText(/create account|reset password|invite/i)).not.toBeInTheDocument();
  });
});

describe("format", () => {
  it("formats sizes and uptime", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatUptime(42)).toBe("42s");
    expect(formatUptime(3700)).toBe("1h 1m");
  });
});

describe("Users tab", () => {
  const user = (id: string, uid: string, role: Schemas["AdminUser"]["role"] = "member"): Schemas["AdminUser"] => ({
    id,
    firebase_uid: uid,
    email: `${uid}@example.com`,
    display_name: null,
    role,
    created_at: stamp,
  });

  function renderUsers(post: (body: unknown) => Response) {
    let items = [user("1", "uid-admin", "admin")];
    const bodies: unknown[] = [];
    const fetch = (async (req: Request) => {
      const { pathname } = new URL(req.url);
      if (pathname === "/v1/admin/status") return Response.json(status);
      if (pathname === "/v1/admin/backups") return Response.json({ items: [] });
      if (pathname === "/v1/admin/users" && req.method === "POST") {
        const body = await req.json();
        bodies.push(body);
        const res = post(body);
        if (res.ok) items = [...items, user("2", body.firebase_uid)];
        return res;
      }
      if (pathname === "/v1/admin/users") return Response.json({ items });
      return Response.json({ error: { code: "not_found", message: "no" } }, { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const api = createApiClient({ getToken: async () => "t", baseUrl: "http://api.test", fetch });
    render(
      <ApiProvider client={api} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AdminPage />
      </ApiProvider>,
    );
    return { bodies, user: userEvent.setup() };
  }

  it("lists users and adds one by Firebase uid", async () => {
    const { bodies, user: u } = renderUsers((body) => Response.json(body, { status: 201 }));
    await u.click(screen.getByRole("tab", { name: "Users" }));
    expect(await screen.findByText("uid-admin")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    expect(dialog).toHaveTextContent("nothing is changed in Firebase");
    await u.type(within(dialog).getByLabelText("Firebase uid"), " uid-new ");
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await screen.findByText("uid-new")).toBeInTheDocument();
    expect(screen.getByText("User added")).toBeInTheDocument();
    expect(bodies).toEqual([{ firebase_uid: "uid-new", email: null, display_name: null, role: "member" }]);
  });

  it("requires a uid and shows a duplicate as an error", async () => {
    const { bodies, user: u } = renderUsers(() =>
      Response.json({ error: { code: "user_exists", message: "A user with this Firebase uid has already been added." } }, { status: 409 }),
    );
    await u.click(screen.getByRole("tab", { name: "Users" }));
    await u.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(within(dialog).getByText("Paste the Firebase uid.")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await u.type(within(dialog).getByLabelText("Firebase uid"), "uid-admin");
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already been added");
  });
});
