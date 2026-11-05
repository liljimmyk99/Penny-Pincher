import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ThemeProvider } from "./ThemeProvider";
import { useTheme } from "./context";
import type { ThemePreference } from "./theme";
import { THEME_STORAGE_KEY, readPreference, resolveTheme } from "./theme";

function mockSystemDark(isDark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: isDark,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** A bare picker over the provider; the real one is in the account menu (see AppShell.test). */
function Picker() {
  const { preference, setPreference } = useTheme();
  return (
    <>
      {(["light", "dark", "system"] as ThemePreference[]).map((value) => (
        <button key={value} aria-pressed={preference === value} onClick={() => setPreference(value)}>
          {value[0].toUpperCase() + value.slice(1)}
        </button>
      ))}
    </>
  );
}

function renderSwitch() {
  return render(
    <ThemeProvider>
      <Picker />
    </ThemeProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("resolveTheme", () => {
  it("follows the system when preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("ignores the system for explicit choices", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("readPreference", () => {
  it("defaults to system", () => {
    expect(readPreference()).toBe("system");
  });
  it("ignores junk in storage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readPreference()).toBe("system");
  });
});

describe("ThemeProvider", () => {
  it("defaults to System and applies the system theme", () => {
    mockSystemDark(true);
    renderSwitch();
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies and stores an explicit choice", async () => {
    mockSystemDark(false);
    renderSwitch();
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "false");
  });

  it("restores the stored preference", () => {
    mockSystemDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderSwitch();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  });
});
