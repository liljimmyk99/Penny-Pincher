import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useMe } from "../api";
import { SETTINGS_PATH } from "./navigation";
import { readSidebarCollapsed, writeSidebarCollapsed } from "./sidebarPreference";
import { ImportBanner } from "./importBanner/ImportBanner";
import { Sidebar } from "./Sidebar";
import "./AppShell.css";

/** The frame every signed-in screen lives in: sidebar plus fluid main content. */
export function AppShell() {
  const userId = useMe().data?.id ?? "";
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(userId));
  const mainRef = useMainFocusOnNavigation();
  useSettingsShortcut();

  const toggle = () => {
    setCollapsed(!collapsed);
    writeSidebarCollapsed(userId, !collapsed);
  };

  return (
    <div className={collapsed ? "shell shell--collapsed" : "shell"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main id="main" className="shell__main" tabIndex={-1} ref={mainRef}>
        <ImportBanner />
        <Outlet />
      </main>
    </div>
  );
}

/**
 * After moving to another page, focus its heading so keyboard and screen
 * reader users land on the new content. Not on first load.
 */
function useMainFocusOnNavigation() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = mainRef.current;
    (main?.querySelector<HTMLElement>("h1[tabindex]") ?? main)?.focus();
  }, [pathname]);

  return mainRef;
}

/** ⌘, (Ctrl+, elsewhere) opens Settings, as the account menu advertises. */
function useSettingsShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "," || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      navigate(SETTINGS_PATH);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}
