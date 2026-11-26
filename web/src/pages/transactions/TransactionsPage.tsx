import { useEffect, useState } from "react";
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
import { CheckIcon, CopyIcon, LinkIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { DeleteDialog } from "../../components/DeleteDialog";
import { ErrorAlert, LoadError } from "../../components/LoadError";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { SectionCard } from "../../components/SectionCard";
import { StatTile } from "../../components/StatTile";
import { UnconfirmedBadge } from "../../components/UnconfirmedBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { toast } from "../../lib/toast";
import { formatShortDate, monthName, monthOf } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { useMonthParam } from "../../lib/useMonthParam";
import { ApplyTemplateDialog } from "../months/ApplyTemplateDialog";
import { NewMonthOffer } from "../months/NewMonthOffer";
import { SaveAsTemplateDialog } from "../months/SaveAsTemplateDialog";
import { UnconfirmedBanner } from "../months/UnconfirmedBanner";
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

type Target = { kind: "expense"; item: Schemas["Expense"] } | { kind: "income"; item: Schemas["IncomeEntry"] };

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

const REFUND_FILTERS: { value: RefundFilter | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "refunds", label: "Refunds" },
  { value: "unlinked", label: "Not linked" },
];
const asRefundFilter = (v: string | null): RefundFilter | null => (v === "refunds" || v === "unlinked" ? v : null);

/** Each refund tag's badge (web/AGENTS.md "Refunds"). */
const TAG_VARIANT = {
  full: "refund",
  partial: "refund",
  earlier: "selected",
  unlinked: "secondary",
} as const satisfies Record<NonNullable<ReturnType<typeof refundTag>>["kind"], string>;

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
  const [monthDialog, setMonthDialog] = useState<"apply" | "save" | null>(null);
  // Months the user chose to start blank (this visit only; it's not data).
  const [blank, setBlank] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const categories = useCategories();
  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? "—";
  const expenses = useMonthExpenses(month);
  const income = useMonthIncome(month);
  const loaded = expenses.isSuccess && income.isSuccess;
  const isEmpty = loaded && expenses.data.length === 0 && income.data.length === 0;
  const { updateExpense, updateIncome } = useEntryMutations();

  const onApplied = (r: Schemas["TemplateApplyResult"]) => {
    setMonthDialog(null);
    const n = r.created_expense_count + r.created_income_entry_count;
    toast(`Copied ${plural(n, "item", "items")} into ${monthName(month)}`);
  };

  /** Per-row Confirm: marks one template copy as checked, as-is. */
  async function confirmOne(target: Target) {
    setConfirmError(null);
    try {
      if (target.kind === "expense") await updateExpense.mutateAsync({ id: target.item.id, body: { confirmed: true } });
      else await updateIncome.mutateAsync({ id: target.item.id, body: { confirmed: true } });
    } catch (err) {
      setConfirmError(`Couldn’t confirm that entry. ${errorMessage(err)}`);
    }
  }

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
          <Button variant="ghost" onClick={() => setMonthDialog("apply")}>
            <CopyIcon aria-hidden="true" />
            Apply template…
          </Button>
          <Button variant="ghost" disabled={!loaded || isEmpty} onClick={() => setMonthDialog("save")}>
            Save as template…
          </Button>
          <Button asChild>
            <Link to={`/add?month=${month}`}>
              <PlusIcon aria-hidden="true" />
              Add entries
            </Link>
          </Button>
        </>
      }
    >
      <UnconfirmedBanner month={month} />
      {confirmError && <ErrorAlert>{confirmError}</ErrorAlert>}
      {isEmpty && !blank.has(month) && (
        <NewMonthOffer
          key={month}
          month={month}
          onStartBlank={() => setBlank((b) => new Set(b).add(month))}
          onApplied={onApplied}
        />
      )}
      <IncomeSection month={month} onConfirm={(item) => void confirmOne({ kind: "income", item })} onEdit={(item) => setEditing({ kind: "income", item })} onDelete={(item) => setDeleting({ kind: "income", item })} />
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
        onConfirm={(item) => void confirmOne({ kind: "expense", item })}
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
            toast(`Refund linked to ${original.merchant.name} · ${formatShortDate(original.date)}`);
          }}
        />
      )}
      <ConfirmDelete target={deleting} onDone={() => setDeleting(null)} />
      <ApplyTemplateDialog
        key={`apply-${month}`}
        month={month}
        open={monthDialog === "apply"}
        onClose={() => setMonthDialog(null)}
        onApplied={onApplied}
      />
      {monthDialog === "save" && (
        <SaveAsTemplateDialog
          month={month}
          open
          onClose={() => setMonthDialog(null)}
          onSaved={(t) => {
            setMonthDialog(null);
            toast(`Saved ${monthName(month)} as the template “${t.name}”`);
          }}
        />
      )}
    </Page>
  );
}

/** Muted text for an empty cell or a status line. */
const muted = "text-muted-foreground";
const statusLine = "m-0 px-5 pb-1 text-muted-foreground";

function RowActions({
  name,
  onEdit,
  onDelete,
  onLink,
  onConfirm,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
  onLink?: () => void;
  /** Only for unconfirmed template copies. */
  onConfirm?: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end gap-1">
      {onConfirm && (
        <Button variant="outline" size="sm" className="border-brand text-unconfirmed-text hover:text-unconfirmed-text" aria-label={`Confirm ${name}`} onClick={onConfirm}>
          <CheckIcon aria-hidden="true" />
          Confirm
        </Button>
      )}
      {onLink && (
        <Button variant="outline" size="sm" aria-label={`Link ${name}`} onClick={onLink}>
          Link…
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hover:bg-danger-alert hover:text-danger-alert-foreground"
        aria-label={`Delete ${name}`}
        onClick={onDelete}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </div>
  );
}

/* ---- Income ------------------------------------------------------------- */

function IncomeSection({
  month,
  onConfirm,
  onEdit,
  onDelete,
}: {
  month: string;
  onConfirm: (entry: Schemas["IncomeEntry"]) => void;
  onEdit: (entry: Schemas["IncomeEntry"]) => void;
  onDelete: (entry: Schemas["IncomeEntry"]) => void;
}) {
  const income = useMonthIncome(month);
  const sources = useIncomeSources();
  const sourceName = (id: string) => sources.data?.find((s) => s.id === id)?.name ?? "—";
  const entries = income.data ?? [];

  let body;
  if (income.isPending) body = <p className={statusLine}>Loading income…</p>;
  else if (income.isError)
    body = <LoadError className="mx-5 w-auto" message={`Couldn’t load this month’s income. ${errorMessage(income.error)}`} onRetry={() => void income.refetch()} />;
  else if (entries.length === 0)
    body = (
      <p className={statusLine}>
        No income logged in {monthName(month)}. <Link to={`/add?month=${month}`}>Add income</Link>
      </p>
    );
  else {
    const total = incomeTotals(entries);
    body = (
      <Table aria-label="Income entries" className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-6">Date</TableHead>
            <TableHead scope="col">Source</TableHead>
            <TableHead scope="col">Label</TableHead>
            <TableHead scope="col" numeric>Gross</TableHead>
            <TableHead scope="col" numeric>Taxable</TableHead>
            <TableHead scope="col" numeric>Net</TableHead>
            <TableHead scope="col" numeric>Tax rate</TableHead>
            <TableHead scope="col" className="w-[104px] pr-6">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => {
            const name = `${sourceName(e.income_source_id)}${e.note ? ` ${e.note}` : ""}, ${formatShortDate(e.date)}`;
            return (
              <TableRow key={e.id} variant={e.confirmed ? "default" : "unconfirmed"}>
                <TableCell data-col="date" className={cn("pl-6", muted)}>{formatShortDate(e.date)}</TableCell>
                <TableCell>
                  <Badge variant="income">{sourceName(e.income_source_id)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{e.note ?? <span className={muted}>—</span>}</span>
                    {!e.confirmed && <UnconfirmedBadge />}
                  </div>
                </TableCell>
                <TableCell numeric>{formatCents(e.gross_cents)}</TableCell>
                <TableCell numeric>{formatCents(e.gross_taxable_cents)}</TableCell>
                <TableCell numeric className="font-semibold text-income">{formatCents(e.net_cents)}</TableCell>
                <TableCell numeric>{formatTaxRate(e.gross_taxable_cents, e.net_cents)}</TableCell>
                <TableCell className="pr-6 text-right">
                  <RowActions
                    name={`income ${name}`}
                    onEdit={() => onEdit(e)}
                    onDelete={() => onDelete(e)}
                    onConfirm={e.confirmed ? undefined : () => onConfirm(e)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" colSpan={3} className="pl-6 text-foreground">
              Total
            </TableHead>
            <TableCell numeric>{formatCents(total.grossCents)}</TableCell>
            <TableCell numeric>{formatCents(total.taxableCents)}</TableCell>
            <TableCell numeric className="text-income">{formatCents(total.netCents)}</TableCell>
            <TableCell numeric>{formatTaxRate(total.taxableCents, total.netCents)}</TableCell>
            <TableCell className="pr-6" />
          </TableRow>
        </TableFooter>
      </Table>
    );
  }

  return (
    <SectionCard flush
      id="tx-income-h"
      title={
        <>
          Income {income.data && <span className="font-medium text-muted-foreground">· {plural(entries.length, "entry", "entries")}</span>}
        </>
      }
    >
      {body}
    </SectionCard>
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
  onConfirm: (expense: Schemas["Expense"]) => void;
}

function SpendingSections({ month, categoryFilter, ...rest }: SpendingProps) {
  const expenses = useMonthExpenses(month);
  const categories = useCategories();

  if (expenses.isPending || categories.isPending)
    return (
      <SectionCard flush id="tx-exp-h" title="Expenses">
        <p className={statusLine}>Loading expenses…</p>
      </SectionCard>
    );
  if (expenses.isError || categories.isError)
    return (
      <SectionCard flush id="tx-exp-h" title="Expenses">
        <LoadError className="mx-5 w-auto" message={`Couldn’t load this month’s expenses. ${errorMessage(expenses.error ?? categories.error)}`} onRetry={() => {
            if (expenses.isError) void expenses.refetch();
            if (categories.isError) void categories.refetch();
          }} />
      </SectionCard>
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
    <section className="flex flex-wrap gap-4" aria-label="Refunds this month">
      <StatTile
        label="Refunds this month"
        value={formatCents(t.refundCents)}
        tone={t.refundCents < 0 ? "refund" : "default"}
        sub={t.refundCount === 0 ? "No refunds" : `${plural(t.refundCount, "refund", "refunds")} · ${count.format(t.linkedCount)} linked to an expense`}
      />
      <StatTile label="Spent before refunds" value={formatCents(t.beforeCents)} sub={`Every expense logged in ${monthName(month)}`} />
      <StatTile label="Spent after refunds" value={formatCents(t.afterCents)} sub="What Summary and Trends show" />
    </section>
  );
}

/** The category rows' columns: name, bar, total, share. */
const catGrid =
  "grid w-full grid-cols-[minmax(96px,180px)_minmax(60px,1fr)_minmax(96px,auto)_84px] items-center gap-x-4 px-2.5 max-sm:grid-cols-[minmax(0,1fr)_auto_64px] max-sm:[&>[data-bar]]:hidden";

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
    <SectionCard flush
      id="tx-cat-h"
      title="Spending by category"
      description={totals.length > 0 ? "Choose a category to filter the expense list." : undefined}
    >
      {totals.length === 0 ? (
        <p className={statusLine}>Nothing spent this month yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5 px-3.5">
          <div className={cn(catGrid, "min-h-7 text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase")} aria-hidden="true">
            <span>Category</span>
            <span data-bar />
            <span className="text-right">Total</span>
            <span className="text-right">% of spend</span>
          </div>
          {totals.map(({ category, totalCents: cents }) => {
            const on = category.id === selected;
            const share = shareOf(cents, totalCents);
            return (
              <button
                key={category.id}
                type="button"
                data-slot="category-row"
                className={cn(
                  catGrid,
                  "min-h-11 cursor-pointer rounded-md border border-solid border-transparent bg-transparent text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/35",
                  on && "border-ring bg-selected text-selected-foreground hover:bg-selected",
                )}
                aria-pressed={on}
                aria-label={`${category.name}, ${formatCents(cents)}, ${share === "—" ? "no share" : `${share} of spending`}`}
                onClick={() => onFilter(on ? null : category.id)}
              >
                <span className="truncate font-semibold">{category.name}</span>{" "}
                <span data-bar className="block h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className={cn("block h-full rounded-full", category.is_saving ? "bg-saving-bar" : "bg-spent")}
                    style={{ width: `${barPercent(cents, max)}%` }}
                  />
                </span>{" "}
                <span data-col="total" className="text-right font-semibold whitespace-nowrap tabular-nums">{formatCents(cents)}</span>{" "}
                <span data-col="share" className="text-right font-medium whitespace-nowrap text-muted-foreground tabular-nums">{share}</span>
              </button>
            );
          })}
          <div data-slot="category-total" className={cn(catGrid, "mt-1 min-h-11 [border-top:1px_solid_var(--border)] font-bold")}>
            <span>Total spent</span>
            <span data-bar />
            <span data-col="total" className="text-right whitespace-nowrap tabular-nums">{formatCents(totalCents)}</span>
            <span className="text-right whitespace-nowrap tabular-nums">{totalCents > 0 ? "100%" : "—"}</span>
          </div>
        </div>
      )}
    </SectionCard>
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
  onConfirm,
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

  const chip = (key: string, on: boolean, label: string, n: number, onPress: () => void) => (
    <Toggle
      key={key}
      variant="outline"
      className="rounded-full px-3.5"
      pressed={on}
      onPressedChange={onPress}
    >
      {label} <span className="font-medium opacity-80 tabular-nums">{count.format(n)}</span>
    </Toggle>
  );

  let body;
  if (expenses.length === 0)
    body = (
      <p className={statusLine}>
        No expenses logged in {monthName(month)}. <Link to={`/add?month=${month}`}>Add expenses</Link>
      </p>
    );
  else if (shown.length === 0) body = <p className={statusLine}>No expenses match. Try another filter or search.</p>;
  else
    body = (
      <Table aria-label="Expenses" className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-6">Date</TableHead>
            <TableHead scope="col">Merchant</TableHead>
            <TableHead scope="col">Category</TableHead>
            <TableHead scope="col">Note</TableHead>
            <TableHead scope="col" numeric>Amount</TableHead>
            <TableHead scope="col" className="w-[104px] pr-6">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((e) => {
            const refund = isRefund(e);
            const category = categories.get(e.category_id);
            const original = refund ? originalOf(e) : undefined;
            const tag = refund ? refundTag(e, original) : null;
            const status = originalStatus(e);
            const anchor = expenseAnchor(e.id);
            const isTarget = anchor === target;
            const name = `${refund ? "refund" : "expense"} ${e.merchant.name}, ${formatShortDate(e.date)}`;
            return (
              <TableRow
                key={e.id}
                id={anchor}
                tabIndex={isTarget ? -1 : undefined}
                // Unconfirmed wins the tint: it is the state that needs action. A refund keeps its badge and green amount.
                variant={!e.confirmed ? "unconfirmed" : refund ? "refund" : "default"}
                data-refund={refund || undefined}
                data-target={isTarget || undefined}
                className="outline-none data-[target]:shadow-[inset_0_2px_0_var(--ring),inset_0_-2px_0_var(--ring)]"
              >
                <TableCell data-col="date" className={cn("pl-6", muted)}>{formatShortDate(e.date)}</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="font-semibold">{e.merchant.name}</strong>
                    {refund && (
                      <Badge variant={tag ? TAG_VARIANT[tag.kind] : "refund"} data-tag={tag?.kind ?? "refund"}>
                        {tag?.label ?? "Refund"}
                      </Badge>
                    )}
                    {!e.confirmed && <UnconfirmedBadge />}
                  </div>
                  {original && (
                    <p data-slot="refund-for" className="mt-1 mb-0 flex items-center gap-1.5 text-xs font-semibold text-refund-text">
                      <LinkIcon aria-hidden="true" className="size-3.5 flex-none" />
                      <span>
                        Refund for{" "}
                        <Link
                          // data-slot: skips the old global link colour (controls.css) so it stays refund green.
                          data-slot="refund-link"
                          className="text-inherit underline"
                          to={{ pathname: "/transactions", search: `?month=${monthOf(original.date)}`, hash: expenseAnchor(original.id) }}
                        >
                          {describeOriginal(original)}
                        </Link>
                      </span>
                    </p>
                  )}
                  {status && <p data-slot="refund-status" className="mt-1 mb-0 text-xs font-semibold text-muted-foreground">{status.text}</p>}
                </TableCell>
                <TableCell>
                  <Badge variant={category?.is_saving ? "saving" : "secondary"}>{category?.name ?? "—"}</Badge>
                </TableCell>
                <TableCell className={muted}>{e.note ?? "—"}</TableCell>
                <TableCell
                  numeric
                  data-col="amount"
                  className={cn("font-bold", refund && "text-refund-text", status?.full && "text-muted-foreground")}
                >
                  {status?.full ? (
                    <>
                      <s>{formatCents(e.amount_cents)}</s>
                      <span className="sr-only"> (refunded in full)</span>
                    </>
                  ) : (
                    formatCents(e.amount_cents)
                  )}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <RowActions
                    name={name}
                    onEdit={() => onEdit(e)}
                    onDelete={() => onDelete(e)}
                    onLink={refund && !e.refunded_expense_id ? () => onLink(e) : undefined}
                    onConfirm={e.confirmed ? undefined : () => onConfirm(e)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );

  return (
    <SectionCard flush
      id="tx-exp-h"
      title={
        <>
          Expenses <span className="font-medium text-muted-foreground">· {plural(expenses.length, "entry", "entries")}</span>
        </>
      }
      description={
        refundCounts.refunds > 0
          ? "Refunds are negative amounts. They lower spending in their category for the month they’re logged, even when the purchase was in an earlier month."
          : undefined
      }
      action={
        <label className="relative block w-full max-w-[300px]">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search merchants and notes</span>
          <Input type="search" className="pl-9" placeholder="Search merchant or note" value={search} onChange={(e) => onSearch(e.target.value)} />
        </label>
      }
    >
      {expenses.length > 0 && (
        <div className="flex flex-col gap-3 px-6">
          <div role="group" aria-label="Filter by refund" className="flex flex-wrap gap-2">
            {REFUND_FILTERS.map(({ value, label }) =>
              chip(label, value === refundFilter, label, value === null ? expenses.length : refundCounts[value], () => onRefundFilter(value)),
            )}
          </div>
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
            {chip("all", selected === null, "All categories", expenses.length, () => onFilter(null))}
            {totals.map((t) => chip(t.category.id, t.category.id === selected, t.category.name, t.count, () => onFilter(t.category.id)))}
          </div>
        </div>
      )}
      {body}
      {expenses.length > 0 && (
        <p role="status" className="m-0 [border-top:1px_solid_var(--border)] px-6 pt-3.5 text-[13px] text-muted-foreground tabular-nums">
          {filtered
            ? `Showing ${count.format(shown.length)} of ${plural(expenses.length, "expense", "expenses")} · ${formatCents(sumCents(shown.map((e) => e.amount_cents)))}`
            : `${plural(expenses.length, "expense", "expenses")} · ${formatCents(sumCents(expenses.map((e) => e.amount_cents)))}`}
        </p>
      )}
    </SectionCard>
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
