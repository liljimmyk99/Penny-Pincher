import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useMe } from "../api";
import { Brand } from "../components/Brand";
import { SETTINGS_PATH } from "./navigation";
import { readSidebarCollapsed, writeSidebarCollapsed } from "./sidebarPreference";
import { ImportBanner } from "./importBanner/ImportBanner";
import { AppSidebar } from "./Sidebar";

/**
 * The frame every signed-in screen lives in: the sidebar (an icon rail when
 * collapsed, a sheet below 768px) plus fluid main content.
 */
export function AppShell() {
  const userId = useMe().data?.id ?? "";
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(userId));
  const mainRef = useMainFocusOnNavigation();
  useSettingsShortcut();

  const onOpenChange = (open: boolean) => {
    setCollapsed(!open);
    writeSidebarCollapsed(userId, !open);
  };

  return (
    <SidebarProvider open={!collapsed} onOpenChange={onOpenChange}>
      <a
        href="#main"
        className="absolute top-2 left-2 z-[100] -translate-y-[200%] rounded-md bg-card px-4 py-2 font-bold text-link focus:translate-y-0"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneTopBar />
        {/* min-w-0 lets wide cards scroll inside themselves, never the page. */}
        <main
          id="main"
          tabIndex={-1}
          ref={mainRef}
          className="min-w-0 flex-1 px-[clamp(1rem,4vw,2.5rem)] pt-8 pb-12 focus:outline-none"
        >
          <ImportBanner />
          <Outlet />
        </main>
      </div>
      <Toaster />
    </SidebarProvider>
  );
}

/** Below 768px: the brand and the button that opens the navigation sheet. */
function PhoneTopBar() {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;
  return (
    <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-2 text-sidebar-foreground">
      <SidebarTrigger
        aria-label="Open navigation"
        aria-haspopup="dialog"
        className="text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-sidebar-ring"
      >
        <Menu className="size-5" />
      </SidebarTrigger>
      <Brand size="sm" />
    </header>
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
