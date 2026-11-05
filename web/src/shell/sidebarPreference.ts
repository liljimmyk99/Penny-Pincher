/**
 * Whether the sidebar is collapsed to its icon rail. A UI preference, so it
 * may live in localStorage (web/AGENTS.md); kept per user on a shared browser.
 */
const keyFor = (userId: string) => `pp.sidebarCollapsed.${userId}`;

export function readSidebarCollapsed(userId: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(userId)) === "true";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(userId: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(keyFor(userId), String(collapsed));
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
}
