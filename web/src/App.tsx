import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AddEntriesPage } from "./pages/add/AddEntriesPage";
import { AdminOnly } from "./pages/AdminOnly";
import { CategoriesPage } from "./pages/categories/CategoriesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SummaryPage } from "./pages/summary/SummaryPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { TemplatesPage } from "./pages/templates/TemplatesPage";
import { YearlyPage } from "./pages/yearly/YearlyPage";
import { TransactionsPage } from "./pages/transactions/TransactionsPage";
import { AppShell } from "./shell/AppShell";
import { ADMIN_PATH, EXPORT_PATH, NAV_ITEMS, SETTINGS_PATH } from "./shell/navigation";

/** What each placeholder says until its screen is built. */
const DESCRIPTIONS: Record<string, string> = {
  "/trends": "Custom trends and spending by category over time.",
};

/** Screens that are built; every other nav item shows its placeholder. */
const SCREENS: Record<string, ReactElement> = {
  "/add": <AddEntriesPage />,
  "/categories": <CategoriesPage />,
  "/summary": <SummaryPage />,
  "/templates": <TemplatesPage />,
  "/transactions": <TransactionsPage />,
  "/yearly": <YearlyPage />,
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
          <Route
            key={path}
            path={path}
            element={SCREENS[path] ?? <PlaceholderPage title={label} description={DESCRIPTIONS[path]} />}
          />
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
