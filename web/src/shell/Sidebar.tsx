import { ChevronsLeft, X } from "lucide-react";
import { NavLink, useMatch } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Brand } from "../components/Brand";
import { AccountMenu } from "./AccountMenu";
import { NAV_ITEMS, type NavItem } from "./navigation";

/** The toggle's target: the main navigation. */
export const MAIN_NAV_ID = "main-nav";

/**
 * The dark left sidebar on shadcn's Sidebar (#172): brand, collapse toggle, the
 * main navigation and the account menu. Collapsed, it is a 76px icon rail whose
 * links keep their names (the label is visually hidden) and show a tooltip.
 * Below 768px the same content is a sheet opened from the shell's top bar.
 */
export function AppSidebar() {
  const { state, isMobile, toggleSidebar, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader
        className={cn(
          "flex-row items-center gap-1 pt-6 pr-3.5 pb-0 pl-5",
          "group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-3.5 group-data-[collapsible=icon]:px-4",
        )}
      >
        <Brand size="sm" hideName={collapsed} />
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            className="ml-auto text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
            onClick={() => setOpenMobile(false)}
          >
            <X />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls={MAIN_NAV_ID}
            className="ml-auto text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:w-11"
            onClick={toggleSidebar}
          >
            <ChevronsLeft
              className={cn("size-[18px] transition-transform motion-reduce:transition-none", collapsed && "rotate-180")}
            />
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3.5 pt-7 group-data-[collapsible=icon]:px-4">
        <nav id={MAIN_NAV_ID} aria-label="Main">
          <SidebarMenu>
            {NAV_ITEMS.map((item) => (
              <NavItemLink key={item.path} item={item} />
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>

      <SidebarFooter className="mx-3.5 mb-3.5 border-t border-sidebar-border p-0 pt-2.5 group-data-[collapsible=icon]:mx-4">
        <AccountMenu collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}

function NavItemLink({ item: { path, label, Icon } }: { item: NavItem }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const active = useMatch({ path, end: false }) !== null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        {/* NavLink sets aria-current="page" on the active item. */}
        <NavLink to={path} onClick={() => isMobile && setOpenMobile(false)}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
