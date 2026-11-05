import type { ReactNode } from "react";
import { useMe } from "../api";
import { isAdmin } from "../shell/me";
import { NotFoundPage } from "./NotFoundPage";

/**
 * Admin-only pages. Members get "not found" (the menu never links them here);
 * the API enforces `admin_required` regardless.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe().data;
  return isAdmin(me) ? <>{children}</> : <NotFoundPage />;
}
