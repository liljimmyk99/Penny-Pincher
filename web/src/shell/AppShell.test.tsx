import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ApiProvider, createApiClient, meQueryKey, type Schemas } from "../api";
import { AppRoutes } from "../App";
import { createSession } from "../auth";
import { SessionProvider } from "../auth/SessionProvider";
import { fakeAuth, testUser } from "../test/fakeAuth";
import { shellFetch } from "../test/summary";
import { ThemeProvider } from "../theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "../theme/theme";

const member: Schemas["Me"] = { id: "1", email: testUser.email, display_name: null, role: "member" };
const admin: Schemas["Me"] = { id: "2", email: "admin@example.com", display_name: "Alex Admin", role: "admin" };

const NAV_ORDER = [
  "Summary",
  "Add entries",
  "Transactions",
  "Yearly",
  "Trends",
  "Templates",
  "Categories & sources",
];

function renderShell({ me = member, path = "/" }: { me?: Schemas["Me"]; path?: string } = {}) {
  const auth = fakeAuth(testUser);
  const session = createSession(auth);
  const api = createApiClient({
    baseUrl: "http://api.test",
    getToken: auth.getToken,
    onSessionError: session.end,
    fetch: vi.fn(shellFetch(me)) as unknown as typeof fetch,
  });
  // AuthGate has loaded /v1/me before the shell renders.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(meQueryKey, me);

  const ui = (
    <ThemeProvider>
      <SessionProvider session={session}>
        <ApiProvider client={api} queryClient={queryClient}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </ApiProvider>
      </SessionProvider>
    </ThemeProvider>
  );
  let result = render(ui);
  const remount = () => {
    result.unmount();
    result = render(ui);
  };
  return { auth, user: userEvent.setup(), remount, unmount: () => result.unmount() };
}

const nav = () => screen.getByRole("navigation", { name: "Main" });
const heading = () => screen.getByRole("heading", { level: 1 });
const accountButton = () => screen.getByRole("button", { name: /member|admin/i });

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  accountButton().focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menu", { name: "Account" });
}

describe("sidebar navigation", () => {
  it("lists the screens in order and lands on Summary", () => {
    renderShell();
    const links = within(nav()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(NAV_ORDER);
    expect(heading()).toHaveTextContent("Summary");
    expect(within(nav()).getByRole("link", { name: "Summary" })).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("Summary · Penny Pincher");
  });

  it("navigates by keyboard and moves aria-current and focus", async () => {
    const { user } = renderShell({ path: "/summary" });
    within(nav()).getByRole("link", { name: "Transactions" }).focus();
    await user.keyboard("{Enter}");

    expect(heading()).toHaveTextContent("Transactions");
    expect(heading()).toHaveFocus();
    expect(within(nav()).getByRole("link", { name: "Transactions" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Summary" })).not.toHaveAttribute("aria-current");
  });

  it("shows a not-found page for unknown addresses", () => {
    renderShell({ path: "/nowhere" });
    expect(heading()).toHaveTextContent("Page not found");
    expect(screen.getByRole("link", { name: "Go to Summary" })).toHaveAttribute("href", "/summary");
  });
});

describe("collapsing the sidebar", () => {
  it("collapses by keyboard, keeps link names, and remembers the choice", async () => {
    const { user, remount } = renderShell();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    toggle.focus();
    await user.keyboard("{Enter}");

    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).toHaveFocus();
    for (const name of NAV_ORDER) expect(within(nav()).getByRole("link", { name })).toBeInTheDocument();

    remount();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    remount();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("remembers the choice per user", async () => {
    const { user, unmount } = renderShell({ me: member });
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    unmount();

    // Another user on the same browser starts expanded.
    renderShell({ me: admin });
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});

describe("account menu", () => {
  it("shows who is signed in and the member's items", async () => {
    const { user } = renderShell();
    const menu = await openAccountMenu(user);

    expect(menu).toHaveTextContent("Signed in · user@example.com");
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      expect.stringContaining("Settings"),
      expect.stringContaining("Export data"),
      "Sign out",
    ]);
    expect(within(menu).queryByRole("menuitem", { name: /admin dashboard/i })).not.toBeInTheDocument();
  });

  it("offers the admin dashboard to admins", async () => {
    const { user } = renderShell({ me: admin });
    expect(accountButton()).toHaveTextContent("Alex Admin");
    const menu = await openAccountMenu(user);

    await user.click(within(menu).getByRole("menuitem", { name: "Admin dashboard" }));
    expect(heading()).toHaveTextContent("Admin dashboard");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("hides the admin dashboard from members who type its address", () => {
    renderShell({ path: "/admin" });
    expect(heading()).toHaveTextContent("Page not found");
  });

  it("switches the appearance and keeps the menu open", async () => {
    const { user } = renderShell();
    const menu = await openAccountMenu(user);
    const group = within(menu).getByRole("group", { name: "Appearance" });
    expect(within(group).getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(group).getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(within(group).getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  });

  it("opens Settings from the menu and with the keyboard shortcut", async () => {
    const { user } = renderShell();
    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Settings" }));
    expect(heading()).toHaveTextContent("Settings");

    await user.click(within(nav()).getByRole("link", { name: "Yearly" }));
    expect(heading()).toHaveTextContent("Yearly");
    await user.keyboard("{Control>},{/Control}");
    expect(heading()).toHaveTextContent("Settings");
  });

  it("closes with Escape and returns focus to the account button", async () => {
    const { user } = renderShell();
    await openAccountMenu(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(accountButton()).toHaveFocus();
  });

  it("signs out", async () => {
    const { user, auth } = renderShell();
    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
