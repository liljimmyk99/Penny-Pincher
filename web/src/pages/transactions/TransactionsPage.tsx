import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  errorMessage,
  useCategories,
  useEntryMutations,
  useExpensesById,
  useIncomeSources,
  useMonthExpenses,
  useMonthIncome,
  type Schemas,
} from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { AlertIcon, LinkIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "../../components/icons";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { Toast } from "../../components/Toast";
import { formatShortDate, monthName, monthOf } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { useMonthParam } from "../../lib/useMonthParam";
import { Page } from "../Page";
import { EditExpenseDialog } from "./EditExpenseDialog";
import { EditIncomeDialog } from "./EditIncomeDialog";
import { LinkRefundDialog } from "./LinkRefundDialog";
import {
  describeOriginal,
  isRefund,
  matchesRefundFilter,
  originalStatus,
  refundTag,
  refundTotals,
  type RefundFilter,
} from "./refunds";
import { barPercent, categoryTotals, incomeTotals, matchesSearch, shareOf, sumCents } from "./totals";
import "./TransactionsPage.css";

type Target = { kind: "expense"; item: Schemas["Expense"] } | { kind: "income"; item: Schemas["IncomeEntry"] };

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

const REFUND_FILTERS: { value: RefundFilter | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "refunds", label: "Refunds" },
  { value: "unlinked", label: "Not linked" },
];
const asRefundFilter = (v: string | null): RefundFilter | null => (v === "refunds" || v === "unlinked" ? v : null);

/** Where a refund's "Refund for" link points: the original's row in its own month. */
const expenseAnchor = (id: string) => `expense-${id}`;

/**
 * Every income entry and expense in a month (web/AGENTS.md "Transactions").
 * The address holds the month (`?month=`, shared with Summary and Add
 * entries), the category filter (`?category=`), the refund filter
 * (`?show=refunds|unlinked`) and the search (`?q=`).
 * Totals are summed here from the month's entries, so an edit or delete
 * refreshes them with the lists.
 */
export function TransactionsPage() {
  const [month, setMonth] = useMonthParam();
  const [params, setParams] = useSearchParams();
  const categoryFilter = params.get("category");
  const refundFilter = asRefundFilter(params.get("show"));
  const search = params.get("q") ?? "";
  const [editing, setEditing] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [linking, setLinking] = useState<Schemas["Expense"] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const categories = useCategories();
  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? "—";

  function setParam(key: string, value: string | null) {
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  }

  return (
    <Page
      title="Transactions"
      eyebrow="Every entry for the month"
      actions={
        <>
          <MonthSwitcher month={month} onChange={setMonth} />
          <Link className="btn btn--primary" to={`/add?month=${month}`}>
            <PlusIcon />
            Add entries
          </Link>
        </>
      }
    >
      <IncomeSection month={month} onEdit={(item) => setEditing({ kind: "income", item })} onDelete={(item) => setDeleting({ kind: "income", item })} />
      <SpendingSections
        month={month}
        categoryFilter={categoryFilter}
        refundFilter={refundFilter}
        search={search}
        onFilter={(id) => setParam("category", id)}
        onRefundFilter={(f) => setParam("show", f)}
        onSearch={(q) => setParam("q", q)}
        onEdit={(item) => setEditing({ kind: "expense", item })}
        onDelete={(item) => setDeleting({ kind: "expense", item })}
        onLink={setLinking}
      />
      {editing?.kind === "expense" && (
        <EditExpenseDialog key={editing.item.id} expense={editing.item} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === "income" && (
        <EditIncomeDialog key={editing.item.id} entry={editing.item} onClose={() => setEditing(null)} />
      )}
      {linking && (
        <LinkRefundDialog
          key={linking.id}
          refund={linking}
          categoryName={categoryName}
          onClose={() => setLinking(null)}
          onLinked={(original) => {
            setLinking(null);
            setToast(`Refund linked to ${original.merchant.name} · ${formatShortDate(original.date)}`);
          }}
        />
      )}
      <ConfirmDelete target={deleting} onDone={() => setDeleting(null)} />
      <Toast message={toast} onDismiss={dismissToast} />
    </Page>
  );
}

function LoadError({ what, error, retry }: { what: string; error: unknown; retry: () => void }) {
  return (
    <p role="alert" className="alert alert--danger tx__alert">
      <AlertIcon width={18} height={18} />
      <span>
        Couldn’t load {what}. {errorMessage(error)}{" "}
        <button type="button" className="text-btn" onClick={retry}>
          Try again
        </button>
      </span>
    </p>
  );
}

function UnconfirmedPill() {
  return (
    <span className="pill-unconfirmed">
      <i aria-hidden="true" />
      Unconfirmed · from template
    </span>
  );
}

function RowActions({
  name,
  onEdit,
  onDelete,
  onLink,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
  onLink?: () => void;
}) {
  return (
    <div className="tx-table__buttons">
      {onLink && (
        <button type="button" className="btn btn--ghost btn--xs" aria-label={`Link ${name}`} onClick={onLink}>
          Link…
        </button>
      )}
      <button type="button" className="icon-btn" aria-label={`Edit ${name}`} onClick={onEdit}>
        <PencilIcon />
      </button>
      <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${name}`} onClick={onDelete}>
        <TrashIcon />
      </button>
    </div>
  );
}

/* ---- Income ------------------------------------------------------------- */

function IncomeSection({
  month,
  onEdit,
  onDelete,
}: {
  month: string;
  onEdit: (entry: Schemas["IncomeEntry"]) => void;
  onDelete: (entry: Schemas["IncomeEntry"]) => void;
}) {
  const income = useMonthIncome(month);
  const sources = useIncomeSources();
  const sourceName = (id: string) => sources.data?.find((s) => s.id === id)?.name ?? "—";
  const entries = income.data ?? [];

  let body;
  if (income.isPending) body = <p className="tx__status">Loading income…</p>;
  else if (income.isError) body = <LoadError what="this month’s income" error={income.error} retry={() => void income.refetch()} />;
  else if (entries.length === 0)
    body = (
      <p className="tx__status">
        No income logged in {monthName(month)}. <Link to={`/add?month=${month}`}>Add income</Link>
      </p>
    );
  else {
    const total = incomeTotals(entries);
    body = (
      <div className="tx-table__scroll">
        <table className="tx-table tx-table--income">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Source</th>
              <th scope="col">Label</th>
              <th scope="col" className="num">Gross</th>
              <th scope="col" className="num">Taxable</th>
              <th scope="col" className="num">Net</th>
              <th scope="col" className="num">Tax rate</th>
              <th scope="col" className="tx-table__actions-col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const name = `${sourceName(e.income_source_id)}${e.note ? ` ${e.note}` : ""}, ${formatShortDate(e.date)}`;
              return (
                <tr key={e.id} className={e.confirmed ? undefined : "is-unconfirmed"}>
                  <td className="tx-table__date">{formatShortDate(e.date)}</td>
                  <td>
                    <span className="tag tag--income">{sourceName(e.income_source_id)}</span>
                  </td>
                  <td>
                    <div className="tx-table__main">
                      <span>{e.note ?? <span className="tx__muted">—</span>}</span>
                      {!e.confirmed && <UnconfirmedPill />}
                    </div>
                  </td>
                  <td className="num">{formatCents(e.gross_cents)}</td>
                  <td className="num">{formatCents(e.gross_taxable_cents)}</td>
                  <td className="num tx-table__net">{formatCents(e.net_cents)}</td>
                  <td className="num">{formatTaxRate(e.gross_taxable_cents, e.net_cents)}</td>
                  <td className="tx-table__actions">
                    <RowActions name={`income ${name}`} onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total
              </th>
              <td className="num">{formatCents(total.grossCents)}</td>
              <td className="num">{formatCents(total.taxableCents)}</td>
              <td className="num tx-table__net">{formatCents(total.netCents)}</td>
              <td className="num">{formatTaxRate(total.taxableCents, total.netCents)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <section className="card tx" aria-labelledby="tx-income-h">
      <div className="tx__head">
        <h2 id="tx-income-h">
          Income {income.data && <span className="tx__count">· {plural(entries.length, "entry", "entries")}</span>}
        </h2>
      </div>
      {body}
    </section>
  );
}

/* ---- Spending by category and the expense list -------------------------- */

interface SpendingProps {
  month: string;
  categoryFilter: string | null;
  refundFilter: RefundFilter | null;
  search: string;
  onFilter: (categoryId: string | null) => void;
  onRefundFilter: (filter: RefundFilter | null) => void;
  onSearch: (q: string) => void;
  onEdit: (expense: Schemas["Expense"]) => void;
  onDelete: (expense: Schemas["Expense"]) => void;
  onLink: (refund: Schemas["Expense"]) => void;
}

function SpendingSections({ month, categoryFilter, ...rest }: SpendingProps) {
  const expenses = useMonthExpenses(month);
  const categories = useCategories();

  if (expenses.isPending || categories.isPending)
    return (
      <section className="card tx" aria-labelledby="tx-exp-h">
        <div className="tx__head">
          <h2 id="tx-exp-h">Expenses</h2>
        </div>
        <p className="tx__status">Loading expenses…</p>
      </section>
    );
  if (expenses.isError || categories.isError)
    return (
      <section className="card tx" aria-labelledby="tx-exp-h">
        <div className="tx__head">
          <h2 id="tx-exp-h">Expenses</h2>
        </div>
        <LoadError
          what="this month’s expenses"
          error={expenses.error ?? categories.error}
          retry={() => {
            if (expenses.isError) void expenses.refetch();
            if (categories.isError) void categories.refetch();
          }}
        />
      </section>
    );

  const all = expenses.data;
  const totals = categoryTotals(all, categories.data);
  const byId = new Map(categories.data.map((c) => [c.id, c]));
  const selected = categoryFilter && byId.has(categoryFilter) ? categoryFilter : null;

  return (
    <>
      <RefundTiles month={month} expenses={all} />
      <CategorySection totals={totals} totalCents={sumCents(all.map((e) => e.amount_cents))} selected={selected} onFilter={rest.onFilter} />
      <ExpenseSection month={month} expenses={all} totals={totals} categories={byId} selected={selected} {...rest} />
    </>
  );
}

/** Refunds this month, and spending before and after them (web/AGENTS.md "Refunds"). */
function RefundTiles({ month, expenses }: { month: string; expenses: Schemas["Expense"][] }) {
  const t = refundTotals(expenses);
  return (
    <section className="tiles" aria-label="Refunds this month">
      <div className="tile">
        <span className="tile__label">Refunds this month</span>
        <span className={t.refundCents < 0 ? "tile__value tile__value--refund" : "tile__value"}>{formatCents(t.refundCents)}</span>
        <span className="tile__sub">
          {t.refundCount === 0 ? "No refunds" : `${plural(t.refundCount, "refund", "refunds")} · ${count.format(t.linkedCount)} linked to an expense`}
        </span>
      </div>
      <div className="tile">
        <span className="tile__label">Spent before refunds</span>
        <span className="tile__value">{formatCents(t.beforeCents)}</span>
        <span className="tile__sub">Every expense logged in {monthName(month)}</span>
      </div>
      <div className="tile">
        <span className="tile__label">Spent after refunds</span>
        <span className="tile__value">{formatCents(t.afterCents)}</span>
        <span className="tile__sub">What Summary and Trends show</span>
      </div>
    </section>
  );
}

function CategorySection({
  totals,
  totalCents,
  selected,
  onFilter,
}: {
  totals: ReturnType<typeof categoryTotals>;
  totalCents: number;
  selected: string | null;
  onFilter: (categoryId: string | null) => void;
}) {
  const max = Math.max(0, ...totals.map((t) => t.totalCents));
  return (
    <section className="card tx" aria-labelledby="tx-cat-h">
      <div className="tx__head">
        <h2 id="tx-cat-h">Spending by category</h2>
        {totals.length > 0 && <p className="tx__desc">Choose a category to filter the expense list.</p>}
      </div>
      {totals.length === 0 ? (
        <p className="tx__status">Nothing spent this month yet.</p>
      ) : (
        <div className="cat-rows">
          <div className="cat-row cat-row--head" aria-hidden="true">
            <span>Category</span>
            <span />
            <span className="num">Total</span>
            <span className="num">% of spend</span>
          </div>
          {totals.map(({ category, totalCents: cents }) => {
            const on = category.id === selected;
            const share = shareOf(cents, totalCents);
            return (
              <button
                key={category.id}
                type="button"
                className={on ? "cat-row is-on" : "cat-row"}
                aria-pressed={on}
                aria-label={`${category.name}, ${formatCents(cents)}, ${share === "—" ? "no share" : `${share} of spending`}`}
                onClick={() => onFilter(on ? null : category.id)}
              >
                <span className="cat-row__name">{category.name}</span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className={category.is_saving ? "bar-fill bar-fill--saving" : "bar-fill"}
                    style={{ width: `${barPercent(cents, max)}%` }}
                  />
                </span>
                <span className="num">{formatCents(cents)}</span>
                <span className="num cat-row__share">{share}</span>
              </button>
            );
          })}
          <div className="cat-row cat-row--total">
            <span>Total spent</span>
            <span />
            <span className="num">{formatCents(totalCents)}</span>
            <span className="num">{totalCents > 0 ? "100%" : "—"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpenseSection({
  month,
  expenses,
  totals,
  categories,
  selected,
  refundFilter,
  search,
  onFilter,
  onRefundFilter,
  onSearch,
  onEdit,
  onDelete,
  onLink,
}: {
  month: string;
  expenses: Schemas["Expense"][];
  totals: ReturnType<typeof categoryTotals>;
  categories: Map<string, Schemas["Category"]>;
  selected: string | null;
} & Omit<SpendingProps, "month" | "categoryFilter">) {
  const { hash } = useLocation();
  const shown = expenses.filter(
    (e) => (!selected || e.category_id === selected) && matchesRefundFilter(e, refundFilter) && matchesSearch(e, search),
  );
  const filtered = selected !== null || refundFilter !== null || search.trim() !== "";

  // Originals in this month are in the list; earlier ones are looked up by id.
  const inMonth = new Map(expenses.map((e) => [e.id, e]));
  const elsewhere = [
    ...new Set(
      expenses.flatMap((e) => (e.refunded_expense_id && !inMonth.has(e.refunded_expense_id) ? [e.refunded_expense_id] : [])),
    ),
  ];
  const fetched = useExpensesById(elsewhere);
  const originalOf = (refund: Schemas["Expense"]) =>
    refund.refunded_expense_id ? (inMonth.get(refund.refunded_expense_id) ?? fetched.get(refund.refunded_expense_id)) : undefined;

  // "Refund for …" links land on the original's row: bring it into view and focus it.
  const target = hash.startsWith("#expense-") ? hash.slice(1) : null;
  const targetShown = target !== null && shown.some((e) => expenseAnchor(e.id) === target);
  useEffect(() => {
    if (!target || !targetShown) return;
    const row = document.getElementById(target);
    row?.scrollIntoView?.({ block: "center" });
    row?.focus({ preventScroll: true });
  }, [target, targetShown]);

  const refundCounts = {
    refunds: expenses.filter((e) => matchesRefundFilter(e, "refunds")).length,
    unlinked: expenses.filter((e) => matchesRefundFilter(e, "unlinked")).length,
  };

  const chip = (id: string | null, name: string, n: number) => {
    const on = id === selected;
    return (
      <button key={id ?? "all"} type="button" className={on ? "chip is-on" : "chip"} aria-pressed={on} onClick={() => onFilter(id)}>
        {name} <span className="chip__count">{count.format(n)}</span>
      </button>
    );
  };

  let body;
  if (expenses.length === 0)
    body = (
      <p className="tx__status">
        No expenses logged in {monthName(month)}. <Link to={`/add?month=${month}`}>Add expenses</Link>
      </p>
    );
  else if (shown.length === 0) body = <p className="tx__status">No expenses match. Try another filter or search.</p>;
  else
    body = (
      <div className="tx-table__scroll">
        <table className="tx-table tx-table--expenses">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Merchant</th>
              <th scope="col">Category</th>
              <th scope="col">Note</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col" className="tx-table__actions-col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const refund = isRefund(e);
              const category = categories.get(e.category_id);
              const original = refund ? originalOf(e) : undefined;
              const tag = refund ? refundTag(e, original) : null;
              const status = originalStatus(e);
              const anchor = expenseAnchor(e.id);
              const isTarget = anchor === target;
              const rowClass =
                [refund && "is-refund", !e.confirmed && "is-unconfirmed", isTarget && "is-target"].filter(Boolean).join(" ") ||
                undefined;
              const amountClass = ["num tx-table__amount", refund && "is-refund", status?.full && "is-struck"]
                .filter(Boolean)
                .join(" ");
              const name = `${refund ? "refund" : "expense"} ${e.merchant.name}, ${formatShortDate(e.date)}`;
              return (
                <tr key={e.id} id={anchor} tabIndex={isTarget ? -1 : undefined} className={rowClass}>
                  <td className="tx-table__date">{formatShortDate(e.date)}</td>
                  <td>
                    <div className="tx-table__main">
                      <strong>{e.merchant.name}</strong>
                      {refund && <span className={`pill pill--${tag?.kind ?? "refund"}`}>{tag?.label ?? "Refund"}</span>}
                      {!e.confirmed && <UnconfirmedPill />}
                    </div>
                    {original && (
                      <p className="tx-refund-for">
                        <LinkIcon />
                        <span>
                          Refund for{" "}
                          <Link to={{ pathname: "/transactions", search: `?month=${monthOf(original.date)}`, hash: expenseAnchor(original.id) }}>
                            {describeOriginal(original)}
                          </Link>
                        </span>
                      </p>
                    )}
                    {status && <p className="tx-refunded">{status.text}</p>}
                  </td>
                  <td>
                    <span className={category?.is_saving ? "tag tag--saving" : "tag"}>{category?.name ?? "—"}</span>
                  </td>
                  <td className="tx-table__note">{e.note ?? <span className="tx__muted">—</span>}</td>
                  <td className={amountClass}>
                    {status?.full ? (
                      <>
                        <s>{formatCents(e.amount_cents)}</s>
                        <span className="visually-hidden"> (refunded in full)</span>
                      </>
                    ) : (
                      formatCents(e.amount_cents)
                    )}
                  </td>
                  <td className="tx-table__actions">
                    <RowActions
                      name={name}
                      onEdit={() => onEdit(e)}
                      onDelete={() => onDelete(e)}
                      onLink={refund && !e.refunded_expense_id ? () => onLink(e) : undefined}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <section className="card tx" aria-labelledby="tx-exp-h">
      <div className="tx__head tx__head--expenses">
        <div>
          <h2 id="tx-exp-h">
            Expenses <span className="tx__count">· {plural(expenses.length, "entry", "entries")}</span>
          </h2>
          {refundCounts.refunds > 0 && (
            <p className="tx__desc">
              Refunds are negative amounts. They lower spending in their category for the month they’re logged, even when the
              purchase was in an earlier month.
            </p>
          )}
        </div>
        <label className="tx-search">
          <SearchIcon />
          <span className="visually-hidden">Search merchants and notes</span>
          <input type="search" placeholder="Search merchant or note" value={search} onChange={(e) => onSearch(e.target.value)} />
        </label>
      </div>
      {expenses.length > 0 && (
        <div className="tx__filters">
          <div role="group" aria-label="Filter by refund" className="tx__chips">
            {REFUND_FILTERS.map(({ value, label }) => {
              const on = value === refundFilter;
              const n = value === null ? expenses.length : refundCounts[value];
              return (
                <button
                  key={label}
                  type="button"
                  className={on ? "chip is-on" : "chip"}
                  aria-pressed={on}
                  onClick={() => onRefundFilter(value)}
                >
                  {label} <span className="chip__count">{count.format(n)}</span>
                </button>
              );
            })}
          </div>
          <div role="group" aria-label="Filter by category" className="tx__chips">
            {chip(null, "All categories", expenses.length)}
            {totals.map((t) => chip(t.category.id, t.category.name, t.count))}
          </div>
        </div>
      )}
      {body}
      {expenses.length > 0 && (
        <p role="status" className="tx__footer">
          {filtered
            ? `Showing ${count.format(shown.length)} of ${plural(expenses.length, "expense", "expenses")} · ${formatCents(sumCents(shown.map((e) => e.amount_cents)))}`
            : `${plural(expenses.length, "expense", "expenses")} · ${formatCents(sumCents(expenses.map((e) => e.amount_cents)))}`}
        </p>
      )}
    </section>
  );
}

/* ---- Delete ------------------------------------------------------------- */

function ConfirmDelete({ target, onDone }: { target: Target | null; onDone: () => void }) {
  const { deleteExpense, deleteIncome } = useEntryMutations();
  const sources = useIncomeSources();
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(target);
  const mutation = target?.kind === "income" ? deleteIncome : deleteExpense;

  if (seen !== target) {
    setSeen(target);
    setError(null);
  }

  async function confirm() {
    if (!target) return;
    setError(null);
    try {
      await mutation.mutateAsync(target.item.id);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  let copy = { title: "", body: "", extra: undefined as string | undefined, confirmLabel: "Delete" };
  if (target?.kind === "expense") {
    const e = target.item;
    const kind = e.amount_cents < 0 ? "refund" : "expense";
    copy = {
      title: `Delete this ${kind}?`,
      body: `${e.merchant.name} · ${formatShortDate(e.date)} · ${formatCents(e.amount_cents)}. This can’t be undone.`,
      extra: e.refunded_total_cents < 0 ? "Its refunds stay, but they will no longer be linked to it." : undefined,
      confirmLabel: `Delete ${kind}`,
    };
  } else if (target?.kind === "income") {
    const e = target.item;
    const source = sources.data?.find((s) => s.id === e.income_source_id)?.name ?? "Income";
    copy = {
      title: "Delete this income entry?",
      body: `${source}${e.note ? ` · ${e.note}` : ""} · ${formatShortDate(e.date)} · ${formatCents(e.net_cents)} net. This can’t be undone.`,
      extra: undefined,
      confirmLabel: "Delete income entry",
    };
  }

  return (
    <DeleteDialog
      open={target !== null}
      {...copy}
      pending={mutation.isPending}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={onDone}
    />
  );
}
