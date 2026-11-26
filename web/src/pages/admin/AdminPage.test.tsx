import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider, createApiClient, type Schemas } from "../../api";
import { AdminPage } from "./AdminPage";
import { formatBytes, formatUptime } from "./format";
import { Toaster } from "../../components/ui/sonner";

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
  const api = createApiClient({ getToken: () => "t", baseUrl: "http://api.test", fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={api} queryClient={queryClient}>
      <AdminPage />
      <Toaster />
    </ApiProvider>,
  );
  return { calls, user: userEvent.setup() };
}

describe("AdminPage", () => {
  it("shows the status tiles", async () => {
    renderPage([backup("1", "weekly")]);
    const tiles = await screen.findByRole("region", { name: "App status" });
    expect(within(tiles).getByText("1.2.3")).toBeInTheDocument();
    expect(within(tiles).getByText("1d 1h")).toBeInTheDocument();
    expect(within(tiles).getByText("1.5 KB")).toBeInTheDocument();
    expect(within(tiles).getByText("Weekly · Succeeded")).toBeInTheDocument();
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

  it("has no Firebase link or sign-in provider tile", async () => {
    renderPage([]);
    await screen.findByRole("region", { name: "App status" });
    expect(screen.queryByText(/firebase/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /console/i })).not.toBeInTheDocument();
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
  const user = (id: string, username: string, role: Schemas["AdminUser"]["role"] = "member"): Schemas["AdminUser"] => ({
    id,
    username,
    email: `${username}@example.com`,
    display_name: null,
    role,
    must_change_password: id !== "1",
    created_at: stamp,
  });

  function renderUsers(
    post: (body: unknown) => Response,
    reset: (body: unknown) => Response = () => new Response(null, { status: 204 }),
  ) {
    const resets: { path: string; body: unknown }[] = [];
    let items = [user("1", "root", "admin")];
    const bodies: unknown[] = [];
    const fetch = (async (req: Request) => {
      const { pathname } = new URL(req.url);
      if (pathname === "/v1/admin/status") return Response.json(status);
      if (pathname === "/v1/admin/backups") return Response.json({ items: [] });
      if (pathname === "/v1/admin/users" && req.method === "POST") {
        const body = await req.json();
        bodies.push(body);
        const res = post(body);
        if (res.ok) items = [...items, user("2", body.username)];
        return res;
      }
      if (/^\/v1\/admin\/users\/[^/]+\/password$/.test(pathname) && req.method === "POST") {
        const body = await req.json();
        resets.push({ path: pathname, body });
        return reset(body);
      }
      if (pathname === "/v1/admin/users") return Response.json({ items });
      return Response.json({ error: { code: "not_found", message: "no" } }, { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const api = createApiClient({ getToken: () => "t", baseUrl: "http://api.test", fetch });
    render(
      <ApiProvider client={api} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AdminPage />
        <Toaster />
      </ApiProvider>,
    );
    return { bodies, resets, user: userEvent.setup() };
  }

  it("lists users and adds one with an initial password", async () => {
    const { bodies, user: u } = renderUsers((body) => Response.json(body, { status: 201 }));
    await u.click(screen.getByRole("tab", { name: "Users" }));
    expect(await screen.findByText("root")).toBeInTheDocument();
    expect(screen.getByText("Set by user")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await u.type(within(dialog).getByLabelText("Username"), " newbie ");
    await u.type(within(dialog).getByLabelText("Initial password"), "a-long-initial-password");
    expect(within(dialog).getByRole("checkbox", { name: "Ask them to choose their own password" })).toBeChecked();
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));

    const details = await screen.findByRole("dialog", { name: "Sign-in details" });
    expect(within(details).getByText("a-long-initial-password")).toBeInTheDocument();
    expect(within(details).getByText("They choose a new password")).toBeInTheDocument();
    await u.click(within(details).getByRole("button", { name: "Done" }));

    expect(screen.queryByText("a-long-initial-password")).not.toBeInTheDocument();
    expect(await screen.findByText("newbie")).toBeInTheDocument();
    expect(screen.getByText("User added")).toBeInTheDocument();
    expect(screen.getByText("Must change at sign-in")).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        username: "newbie",
        password: "a-long-initial-password",
        must_change_password: true,
        email: null,
        display_name: null,
        role: "member",
      },
    ]);
  });

  it("requires a username and a long password, and shows a taken username", async () => {
    const { bodies, user: u } = renderUsers(() =>
      Response.json({ error: { code: "user_exists", message: "That username is already taken." } }, { status: 409 }),
    );
    await u.click(screen.getByRole("tab", { name: "Users" }));
    await u.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(within(dialog).getByText(/Use 3–32 letters/, { selector: "[data-slot=field-error]" })).toBeInTheDocument();
    await u.type(within(dialog).getByLabelText("Username"), "root");
    await u.type(within(dialog).getByLabelText("Initial password"), "short");
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(within(dialog).getByText("Use at least 12 characters.")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await u.type(within(dialog).getByLabelText("Initial password"), "-now-long-enough");
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(await within(dialog).findByText("That username is already taken.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
  });

  it("generates a password of at least 12 characters", async () => {
    const { user: u } = renderUsers(() => Response.json({}, { status: 201 }));
    await u.click(screen.getByRole("tab", { name: "Users" }));
    await u.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await u.click(within(dialog).getByRole("button", { name: "Generate" }));
    expect((within(dialog).getByLabelText("Initial password") as HTMLInputElement).value.length).toBeGreaterThanOrEqual(12);
  });

  it("shows a weak_password error on the password field", async () => {
    const { user: u } = renderUsers(() =>
      Response.json(
        { error: { code: "weak_password", message: "Too weak.", details: [{ field: "password", issue: "Too weak." }] } },
        { status: 400 },
      ),
    );
    await u.click(screen.getByRole("tab", { name: "Users" }));
    await u.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await u.type(within(dialog).getByLabelText("Username"), "newbie");
    await u.type(within(dialog).getByLabelText("Initial password"), "a-long-initial-password");
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(await within(dialog).findByText("Too weak.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Initial password")).toHaveAttribute("aria-invalid", "true");
  });

  it("copies the sign-in details", async () => {
    const { user: u } = renderUsers((body) => Response.json(body, { status: 201 }));
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await u.click(screen.getByRole("tab", { name: "Users" }));
    await u.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await u.type(within(dialog).getByLabelText("Username"), "newbie");
    await u.type(within(dialog).getByLabelText("Initial password"), "a-long-initial-password");
    await u.click(within(dialog).getByRole("button", { name: "Add user" }));
    const details = await screen.findByRole("dialog", { name: "Sign-in details" });
    await u.click(within(details).getByRole("button", { name: "Copy sign-in details" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Password: a-long-initial-password"));
  });

  it("resets a password and shows the details once", async () => {
    const { resets, user: u } = renderUsers(() => Response.json({}, { status: 201 }));
    await u.click(screen.getByRole("tab", { name: "Users" }));
    await u.click(await screen.findByRole("button", { name: "Reset password for root" }));
    const dialog = await screen.findByRole("dialog", { name: /Set a new password for root/ });
    expect(within(dialog).getByText(/signed out on every device/)).toBeInTheDocument();
    await u.type(within(dialog).getByLabelText("New password"), "short");
    await u.click(within(dialog).getByRole("button", { name: "Reset password" }));
    expect(within(dialog).getByText("Use at least 12 characters.")).toBeInTheDocument();
    expect(resets).toHaveLength(0);

    await u.type(within(dialog).getByLabelText("New password"), "-now-long-enough");
    await u.click(within(dialog).getByRole("button", { name: "Reset password" }));
    const details = await screen.findByRole("dialog", { name: "Sign-in details" });
    expect(within(details).getByText("Password reset. root was signed out everywhere.")).toBeInTheDocument();
    expect(within(details).getByText("short-now-long-enough")).toBeInTheDocument();
    expect(resets).toEqual([
      { path: "/v1/admin/users/1/password", body: { password: "short-now-long-enough", must_change_password: true } },
    ]);
    await u.click(within(details).getByRole("button", { name: "Done" }));
    expect(screen.queryByText("short-now-long-enough")).not.toBeInTheDocument();
  });
});
