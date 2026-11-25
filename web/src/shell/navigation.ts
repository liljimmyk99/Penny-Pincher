import {
  Calendar,
  ChartColumn,
  CirclePlus,
  Copy,
  LayoutDashboard,
  List,
  Tag,
  Upload,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  Icon: LucideIcon;
}

/** The sidebar, in the order web/AGENTS.md ("Layout and navigation") fixes. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: "/summary", label: "Summary", Icon: LayoutDashboard },
  { path: "/add", label: "Add entries", Icon: CirclePlus },
  { path: "/transactions", label: "Transactions", Icon: List },
  { path: "/yearly", label: "Yearly", Icon: Calendar },
  { path: "/trends", label: "Trends", Icon: ChartColumn },
  { path: "/templates", label: "Templates", Icon: Copy },
  { path: "/categories", label: "Categories & sources", Icon: Tag },
  { path: "/import", label: "Import", Icon: Upload },
];

/** Pages reached from the account menu rather than the sidebar. */
export const SETTINGS_PATH = "/settings";
export const IMPORT_PATH = "/import";
export const EXPORT_PATH = "/export";
export const ADMIN_PATH = "/admin";
