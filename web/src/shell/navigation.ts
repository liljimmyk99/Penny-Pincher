import type { ComponentType, SVGProps } from "react";
import {
  CalendarIcon,
  ChartIcon,
  CopyIcon,
  DashboardIcon,
  ListIcon,
  PlusCircleIcon,
  TagIcon,
  UploadIcon,
} from "../components/icons";

export interface NavItem {
  path: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** The sidebar, in the order web/AGENTS.md ("Layout and navigation") fixes. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: "/summary", label: "Summary", Icon: DashboardIcon },
  { path: "/add", label: "Add entries", Icon: PlusCircleIcon },
  { path: "/transactions", label: "Transactions", Icon: ListIcon },
  { path: "/yearly", label: "Yearly", Icon: CalendarIcon },
  { path: "/trends", label: "Trends", Icon: ChartIcon },
  { path: "/templates", label: "Templates", Icon: CopyIcon },
  { path: "/categories", label: "Categories & sources", Icon: TagIcon },
  { path: "/import", label: "Import", Icon: UploadIcon },
];

/** Pages reached from the account menu rather than the sidebar. */
export const SETTINGS_PATH = "/settings";
export const IMPORT_PATH = "/import";
export const EXPORT_PATH = "/export";
export const ADMIN_PATH = "/admin";
