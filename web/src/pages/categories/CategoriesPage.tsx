import * as Tooltip from "@radix-ui/react-tooltip";
import { useState, type ReactNode } from "react";
import {
  errorMessage,
  useCategories,
  useCategoryMutations,
  useCategoryStats,
  useIncomeSourceMutations,
  useIncomeSources,
  useIncomeSourceStats,
  type Schemas,
} from "../../api";
import { AlertIcon, InfoIcon } from "../../components/icons";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { Page } from "../Page";
import { AddForm } from "./AddForm";
import { DeleteDialog } from "./DeleteDialog";
import { ManageTable, type Column } from "./ManageTable";
import "./CategoriesPage.css";

type CategoryRow = Schemas["Category"] & { locked: boolean; stats?: Schemas["CategoryStats"] };
type SourceRow = Schemas["IncomeSource"] & { locked: boolean; stats?: Schemas["IncomeSourceStats"] };

type DeleteTarget = { kind: "category"; row: CategoryRow } | { kind: "source"; row: SourceRow };

const count = new Intl.NumberFormat("en-US");
const PENDING = "—";

/** Manage expense categories and income sources (web/AGENTS.md "Categories & sources"). */
export function CategoriesPage({ year = new Date().getFullYear() }: { year?: number }) {
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const categoryMutations = useCategoryMutations();
  const sourceMutations = useIncomeSourceMutations();
  const removing = target?.kind === "source" ? sourceMutations.remove : categoryMutations.remove;

  function askDelete(next: DeleteTarget) {
    setDeleteError(null);
    removing.reset();
    setTarget(next);
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleteError(null);
    try {
      await removing.mutateAsync(target.row.id);
      setTarget(null);
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  }

  return (
    <Page title="Categories & sources" eyebrow={`Manage · totals for ${year}`}>
      <Tooltip.Provider delayDuration={200}>
        <p id="reorder-help" className="visually-hidden">
          Use the arrow keys, Home or End to move this row. The order is used everywhere.
        </p>
        <CategoriesSection year={year} onDelete={(row) => askDelete({ kind: "category", row })} />
        <SourcesSection year={year} onDelete={(row) => askDelete({ kind: "source", row })} />
      </Tooltip.Provider>
      <DeleteDialog
        open={target !== null}
        {...(target ? deleteCopy(target) : { title: "", body: "" })}
        pending={removing.isPending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setTarget(null)}
      />
    </Page>
  );
}

function deleteCopy(target: DeleteTarget): { title: string; body: string; extra: string } {
  const { name } = target.row;
  const title = `Delete “${name}”?`;
  if (target.kind === "source") {
    return {
      title,
      body: "It has no income entries.",
      extra: `Templates that use ${name} will switch to Other.`,
    };
  }
  const stats = target.row.stats;
  const body =
    !stats ? "Its expenses will move to Other."
    : stats.entry_count === 0 ? "It has no expenses yet."
    : `Its ${count.format(stats.entry_count)} ${stats.entry_count === 1 ? "expense" : "expenses"} (${formatCents(stats.total_cents)} in total) will move to Other.`;
  return {
    title,
    body,
    extra: `Templates that use ${name} will switch to Other too, and saved trends for ${name} are removed.`,
  };
}

function CategoriesSection({ year, onDelete }: { year: number; onDelete: (row: CategoryRow) => void }) {
  const list = useCategories();
  const stats = useCategoryStats(year);
  const { create, rename, reorder } = useCategoryMutations();

  const byId = new Map((stats.data ?? []).map((s) => [s.category_id, s]));
  const rows: CategoryRow[] = (list.data ?? []).map((c) => ({
    ...c,
    locked: c.is_protected === true,
    stats: byId.get(c.id),
  }));
  const columns: Column<CategoryRow>[] = [
    { header: "Entries", cell: (r) => (r.stats ? count.format(r.stats.entry_count) : PENDING) },
    { header: "Spent · YTD", cell: (r) => (r.stats ? formatCents(r.stats.year_total_cents) : PENDING) },
  ];
  const sum = (pick: (s: Schemas["CategoryStats"]) => number) =>
    (stats.data ?? []).reduce((total, s) => total + pick(s), 0);

  return (
    <section className="card manage" aria-labelledby="categories-h">
      <div className="manage__head">
        <h2 id="categories-h">Expense categories</h2>
        <p className="manage__desc">Drag to reorder. The order here is the order on Summary, Templates and the entry form.</p>
      </div>
      <Loadable query={list} what="categories">
        <ManageTable
          caption="Expense categories"
          nameHeader="Category"
          renameLabel="Category name"
          rows={rows}
          columns={columns}
          badges={(r) => (
            <>
              {r.is_saving && <span className="badge badge--saving">Counted as savings</span>}
              {r.locked && <span className="badge">Default</span>}
            </>
          )}
          footer={{
            label: "All categories",
            cells: stats.data
              ? [count.format(sum((s) => s.entry_count)), formatCents(sum((s) => s.year_total_cents))]
              : [PENDING, PENDING],
          }}
          onReorder={(ids) => reorder.mutate(ids)}
          onRename={(row, name) => rename.mutateAsync({ id: row.id, name })}
          onDelete={onDelete}
        />
        <StatsError query={stats} />
        <ReorderError error={reorder.error} />
      </Loadable>
      <p className="manage__note">
        <InfoIcon />
        <span>
          Deleting a category moves its expenses and template items to <b>Other</b>. Other can’t be renamed or deleted.
        </span>
      </p>
      <AddForm
        label="New category name"
        placeholder="e.g. Pets"
        action="Add category"
        onAdd={(name) => create.mutateAsync(name)}
      />
    </section>
  );
}

function SourcesSection({ year, onDelete }: { year: number; onDelete: (row: SourceRow) => void }) {
  const list = useIncomeSources();
  const stats = useIncomeSourceStats(year);
  const { create, rename, reorder } = useIncomeSourceMutations();

  const byId = new Map((stats.data ?? []).map((s) => [s.income_source_id, s]));
  const rows: SourceRow[] = (list.data ?? []).map((s) => ({
    ...s,
    locked: s.is_protected === true,
    stats: byId.get(s.id),
  }));
  const money = (pick: (s: Schemas["IncomeSourceStats"]) => number) => (r: SourceRow) =>
    r.stats ? formatCents(pick(r.stats)) : PENDING;
  const columns: Column<SourceRow>[] = [
    { header: "Entries", cell: (r) => (r.stats ? count.format(r.stats.entry_count) : PENDING) },
    { header: "Gross · YTD", cell: money((s) => s.year_gross_cents) },
    { header: "Net · YTD", cell: money((s) => s.year_net_cents) },
    {
      header: "Tax rate",
      cell: (r) => (r.stats ? formatTaxRate(r.stats.year_gross_taxable_cents, r.stats.year_net_cents) : PENDING),
    },
  ];
  const sum = (pick: (s: Schemas["IncomeSourceStats"]) => number) =>
    (stats.data ?? []).reduce((total, s) => total + pick(s), 0);

  return (
    <section className="card manage" aria-labelledby="sources-h">
      <div className="manage__head">
        <h2 id="sources-h">Income sources</h2>
        <p className="manage__desc">
          Each income entry records gross, taxable and net pay. Tax rate is calculated from gross taxable and net.
        </p>
      </div>
      <Loadable query={list} what="income sources">
        <ManageTable
          caption="Income sources"
          nameHeader="Source"
          renameLabel="Source name"
          rows={rows}
          columns={columns}
          badges={(r) => r.locked && <span className="badge">Default</span>}
          footer={{
            label: "All sources",
            cells: stats.data
              ? [
                  count.format(sum((s) => s.entry_count)),
                  formatCents(sum((s) => s.year_gross_cents)),
                  formatCents(sum((s) => s.year_net_cents)),
                  formatTaxRate(sum((s) => s.year_gross_taxable_cents), sum((s) => s.year_net_cents)),
                ]
              : [PENDING, PENDING, PENDING, PENDING],
          }}
          onReorder={(ids) => reorder.mutate(ids)}
          onRename={(row, name) => rename.mutateAsync({ id: row.id, name })}
          onDelete={onDelete}
          deleteBlockedReason={(r) =>
            r.has_entries ? `${r.name} has income entries, so it can be renamed but not deleted.` : null
          }
        />
        <StatsError query={stats} />
        <ReorderError error={reorder.error} />
      </Loadable>
      <p className="manage__note">
        <InfoIcon />
        <span>
          A source with income entries can be renamed but not deleted. Deleting an unused source moves its template
          items to <b>Other</b>.
        </span>
      </p>
      <AddForm label="New source name" placeholder="e.g. Freelance" action="Add source" onAdd={(name) => create.mutateAsync(name)} />
    </section>
  );
}

interface QueryState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Shows loading and error states for a section's list. */
function Loadable({ query, what, children }: { query: QueryState; what: string; children: ReactNode }) {
  if (query.isPending) return <p className="manage__status">Loading {what}…</p>;
  if (query.isError) {
    return (
      <div role="alert" className="alert alert--danger manage__alert">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load {what}. {errorMessage(query.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void query.refetch()}>
            Try again
          </button>
        </span>
      </div>
    );
  }
  return <>{children}</>;
}

function StatsError({ query }: { query: QueryState }) {
  if (!query.isError) return null;
  return (
    <div role="alert" className="alert alert--danger manage__alert">
      <AlertIcon width={18} height={18} />
      <span>
        Couldn’t load totals. {errorMessage(query.error)}{" "}
        <button type="button" className="text-btn" onClick={() => void query.refetch()}>
          Try again
        </button>
      </span>
    </div>
  );
}

function ReorderError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="alert alert--danger manage__alert">
      <AlertIcon width={18} height={18} />
      Couldn’t save the new order. {errorMessage(error)}
    </p>
  );
}
