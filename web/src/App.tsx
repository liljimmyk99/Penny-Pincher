import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AdminOnly } from "./pages/AdminOnly";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { AppShell } from "./shell/AppShell";
import { ADMIN_PATH, EXPORT_PATH, NAV_ITEMS, SETTINGS_PATH } from "./shell/navigation";

/** What each placeholder says until its screen is built. */
const DESCRIPTIONS: Record<string, string> = {
  "/summary": "This month's income, spending and what's left over.",
  "/add": "Log expenses, refunds and income, one at a time or in a batch.",
  "/transactions": "Every income entry and expense for the month.",
  "/yearly": "Month-by-month totals, category totals and monthly averages for a year.",
  "/trends": "Custom trends and spending by category over time.",
  "/templates": "Template months to start each month from.",
  "/categories": "Expense categories and income sources.",
};

/** The signed-in app (AuthGate has already loaded `/v1/me`). */
export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

/** Every route, inside the app shell. Tests render this in a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/summary" replace />} />
        {NAV_ITEMS.map(({ path, label }) => (
          <Route key={path} path={path} element={<PlaceholderPage title={label} description={DESCRIPTIONS[path]} />} />
        ))}
        <Route
          path={SETTINGS_PATH}
          element={<PlaceholderPage title="Settings" description="Preferences for your account." />}
        />
        <Route
          path={EXPORT_PATH}
          element={<PlaceholderPage title="Export data" description="Download your entries as CSV or Excel." />}
        />
        <Route
          path={ADMIN_PATH}
          element={
            <AdminOnly>
              <PlaceholderPage title="Admin dashboard" description="App status and backups." />
            </AdminOnly>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
