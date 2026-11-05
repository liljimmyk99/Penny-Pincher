import type { Schemas } from "../api";

/** What the shell calls the signed-in user: their display name, else their email. */
export function displayName(me: Schemas["Me"] | undefined): string {
  return me?.display_name?.trim() || me?.email || "Your account";
}

export const isAdmin = (me: Schemas["Me"] | undefined) => me?.role === "admin";
