import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  errorMessage,
  findMerchant,
  lastCategoryFor,
  useApi,
  useCategories,
  useEntryMutations,
  type Schemas,
} from "../../api";
import { defaultDateFor } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { isApplePlatform } from "../../shell/platform";
import { MerchantCombobox } from "../../components/MerchantCombobox";
import { MoneyInput } from "../../components/MoneyInput";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardDescription } from "../../components/ui/card";
import { Input, inputVariants } from "../../components/ui/input";
import { Kbd } from "../../components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { RefundLink } from "./RefundLink";
import { SavedStatus } from "./SavedStatus";
import {
  batchErrors,
  emptyRow,
  isBlank,
  isRefund,
  NOTE_MAX,
  rowCents,
  toCreate,
  validateRow,
  type ExpenseRow,
  type RowErrors,
  type RowField,
} from "./expenseRows";

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

/**
 * The expense table: one row is a quick single entry, "Add row" makes it a
 * batch. Enter moves to the next row (adding one), ⌘/Ctrl+Enter saves every
 * row through the batch endpoint, all or nothing.
 */
export function ExpenseBatch({ month }: { month: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const categories = useCategories();
  const { createExpenses } = useEntryMutations();
  const [rows, setRows] = useState<ExpenseRow[]>(() => [emptyRow(defaultDateFor(month))]);
  const [errors, setErrors] = useState<Map<number, RowErrors>>(new Map());
  const [alert, setAlert] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [seenMonth, setSeenMonth] = useState(month);
  const fields = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);

  // Switching month moves rows nobody has typed in yet to the new month.
  if (seenMonth !== month) {
    setSeenMonth(month);
    setRows((rs) => rs.map((r) => (isBlank(r) ? { ...r, date: defaultDateFor(month) } : r)));
  }

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    fields.current.get(target)?.focus();
  });

  const fieldKey = (row: ExpenseRow, field: RowField) => `${row.key}:${field}`;
  const register = (row: ExpenseRow, field: RowField) => (el: HTMLElement | null) => {
    if (el) fields.current.set(fieldKey(row, field), el);
    else fields.current.delete(fieldKey(row, field));
  };
  const focusLater = (row: ExpenseRow, field: RowField) => {
    pendingFocus.current = fieldKey(row, field);
  };

  const categoryList = categories.data ?? [];
  const categoryName = (id: string) => categoryList.find((c) => c.id === id)?.name ?? "Unknown category";

  function update(key: number, patch: Partial<ExpenseRow>, clear?: RowField[]) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setSaved(null);
    if (clear?.length && errors.get(key)) {
      setErrors((prev) => {
        const next = new Map(prev);
        const rowErrors = { ...next.get(key) };
        for (const f of clear) delete rowErrors[f];
        next.set(key, rowErrors);
        return next;
      });
    }
  }

  /** Once the merchant is known, prefill the category from its latest expense. */
  async function resolveMerchant(row: ExpenseRow, merchant: Schemas["Merchant"] | null) {
    try {
      const found = merchant ?? (await findMerchant(qc, api, row.merchant));
      if (!found) return;
      update(row.key, { merchantId: found.id, ...(merchant ? { merchant: found.name } : {}) }, ["merchant"]);
      if (row.categoryTouched) return;
      const categoryId = await lastCategoryFor(qc, api, found.id);
      if (!categoryId) return;
      setRows((rs) =>
        rs.map((r) =>
          r.key === row.key && !r.categoryTouched && r.merchantId === found.id ? { ...r, categoryId } : r,
        ),
      );
      setErrors((prev) => {
        if (!prev.get(row.key)?.category) return prev;
        const next = new Map(prev);
        next.set(row.key, { ...next.get(row.key), category: undefined });
        return next;
      });
    } catch {
      // Autocomplete is a convenience; the user can still pick a category.
    }
  }

  function addRow(refund = false, after?: ExpenseRow) {
    const last = after ?? rows[rows.length - 1];
    const row = emptyRow(last?.date ?? defaultDateFor(month), refund);
    setRows((rs) => {
      const at = after ? rs.findIndex((r) => r.key === after.key) + 1 : rs.length;
      return [...rs.slice(0, at), row, ...rs.slice(at)];
    });
    setSaved(null);
    focusLater(row, "merchant");
  }

  function removeRow(row: ExpenseRow) {
    const index = rows.findIndex((r) => r.key === row.key);
    const rest = rows.filter((r) => r.key !== row.key);
    const next = rest.length ? rest : [emptyRow(row.date)];
    setRows(next);
    setErrors((prev) => {
      const copy = new Map(prev);
      copy.delete(row.key);
      return copy;
    });
    const focusRow = next[Math.min(index, next.length - 1)];
    focusLater(focusRow, "merchant");
  }

  function discard() {
    const row = emptyRow(defaultDateFor(month));
    setRows([row]);
    setErrors(new Map());
    setAlert(null);
    setSaved(null);
    focusLater(row, "merchant");
  }

  const filled = rows.filter((r) => !isBlank(r));
  const netCents = filled.reduce((sum, r) => sum + (rowCents(r) ?? 0), 0);

  async function save() {
    if (createExpenses.isPending) return;
    setSaved(null);
    if (filled.length === 0) {
      setAlert("Fill in at least one row first.");
      return;
    }
    const found = new Map<number, RowErrors>();
    for (const r of filled) {
      const e = validateRow(r);
      if (Object.keys(e).length) found.set(r.key, e);
    }
    if (found.size) {
      setErrors(found);
      setAlert(`Check the highlighted ${found.size === 1 ? "row" : `${count.format(found.size)} rows`}. Nothing was saved.`);
      focusFirstError(found);
      return;
    }
    setErrors(new Map());
    setAlert(null);
    try {
      await createExpenses.mutateAsync(filled.map(toCreate));
      setSaved(`Saved ${plural(filled.length, "entry", "entries")} · ${formatCents(netCents)} net.`);
      const row = emptyRow(filled[filled.length - 1].date);
      setRows([row]);
      focusLater(row, "merchant");
    } catch (err) {
      const { byRow, other } = batchErrors(err, filled);
      setErrors(byRow);
      setAlert([`Nothing was saved. ${errorMessage(err)}`, ...other].join(" "));
      focusFirstError(byRow);
    }
  }

  function focusFirstError(found: Map<number, RowErrors>) {
    const order: RowField[] = ["date", "merchant", "link", "category", "amount", "note"];
    for (const r of rows) {
      const e = found.get(r.key);
      const field = e && order.find((f) => e[f]);
      if (field) {
        fields.current.get(fieldKey(r, field))?.focus();
        return;
      }
    }
  }

  /** Enter: next row (adding one at the end). ⌘/Ctrl+Enter: save everything. */
  function onRowKeyDown(e: KeyboardEvent<HTMLElement>, row: ExpenseRow) {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      void save();
      return;
    }
    const index = rows.findIndex((r) => r.key === row.key);
    const next = rows[index + 1];
    if (next) fields.current.get(fieldKey(next, "merchant"))?.focus();
    else if (!isBlank(row)) addRow(false, row);
  }

  const mod = isApplePlatform() ? "⌘" : "Ctrl";
  const cellInput = inputVariants({ variant: "cell" });

  return (
    <Card role="region" aria-labelledby="expenses-h" className="min-w-0 gap-0 py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h2 id="expenses-h" className="m-0 text-lg leading-tight font-semibold">
            Expenses
          </h2>
          <CardDescription className="mt-1">
            Log one as it happens, or a whole stack at once. Nothing saves until you press Save.
          </CardDescription>
        </div>
        <p id="expense-keys" className="m-0 flex flex-wrap gap-3 text-xs font-medium text-muted-foreground">
          <span>
            <Kbd>Enter</Kbd> next row
          </span>
          <span>
            <Kbd>{mod} Enter</Kbd> save all
          </span>
        </p>
      </div>

      {categories.isError && (
        <Alert variant="destructive" className="mx-5 mb-3 w-auto">
          <AlertCircle />
          <AlertDescription>
            <p>
              Couldn’t load categories. {errorMessage(categories.error)}{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => void categories.refetch()}>
                Try again
              </Button>
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Table className="min-w-[720px]">
        <caption className="sr-only">New expenses</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-[150px] px-3">
              Date
            </TableHead>
            <TableHead scope="col" className="w-[22%] px-3">
              Merchant
            </TableHead>
            <TableHead scope="col" className="w-[170px] px-3">
              Category
            </TableHead>
            <TableHead scope="col" numeric className="w-[110px] px-3">
              Amount
            </TableHead>
            <TableHead scope="col" className="px-3">
              Note
            </TableHead>
            <TableHead scope="col" className="w-[52px]">
              <span className="sr-only">Remove</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const n = i + 1;
            const rowLabel = `row ${n}`;
            const e = errors.get(row.key) ?? {};
            const refund = isRefund(row);
            const errId = (f: RowField) => (e[f] ? `exp-${row.key}-${f}-err` : undefined);
            const describedBy = (f: RowField) => [errId(f), "expense-keys"].filter(Boolean).join(" ");
            const messages = (Object.entries(e) as [RowField, string | undefined][]).filter(([, m]) => m);
            const cell = "align-top whitespace-normal";
            return (
              <TableRow key={row.key} variant={refund ? "refund" : "default"} className="hover:bg-transparent">
                <TableCell className={cell}>
                  <Input
                    ref={register(row, "date")}
                    variant="cell"
                    type="date"
                    aria-label={`Date, ${rowLabel}`}
                    aria-invalid={e.date ? true : undefined}
                    aria-describedby={describedBy("date")}
                    value={row.date}
                    required
                    onChange={(ev) => update(row.key, { date: ev.target.value }, ["date"])}
                    onKeyDown={(ev) => onRowKeyDown(ev, row)}
                  />
                </TableCell>
                <TableCell className={cell}>
                  <MerchantCombobox
                    id={`exp-${row.key}-merchant`}
                    className={cellInput}
                    label={`Merchant, ${rowLabel}`}
                    value={row.merchant}
                    invalid={!!e.merchant}
                    describedBy={describedBy("merchant")}
                    inputRef={register(row, "merchant")}
                    onChange={(merchant) =>
                      update(row.key, { merchant, merchantId: null, refundedExpenseId: null }, ["merchant", "link"])
                    }
                    onPick={(m) => void resolveMerchant(row, m)}
                    onCommit={() => {
                      if (!row.merchantId && row.merchant.trim()) void resolveMerchant(row, null);
                    }}
                    onKeyDown={(ev) => onRowKeyDown(ev, row)}
                  />
                  {refund && (
                    <RefundLink
                      id={`exp-${row.key}-link`}
                      rowLabel={rowLabel}
                      merchantId={row.merchantId}
                      merchantName={row.merchant}
                      value={row.refundedExpenseId}
                      categoryName={categoryName}
                      error={e.link}
                      onChange={(original) =>
                        update(
                          row.key,
                          {
                            refundedExpenseId: original?.id ?? null,
                            // A refund usually lands in the original's category.
                            ...(original && !row.categoryTouched ? { categoryId: original.category_id } : {}),
                          },
                          ["link", ...(original ? (["category"] as RowField[]) : [])],
                        )
                      }
                    />
                  )}
                </TableCell>
                <TableCell className={cell}>
                  <Select
                    value={row.categoryId}
                    onValueChange={(categoryId) => update(row.key, { categoryId, categoryTouched: true }, ["category"])}
                  >
                    <SelectTrigger
                      ref={register(row, "category")}
                      variant="cell"
                      aria-label={`Category, ${rowLabel}`}
                      aria-invalid={e.category ? true : undefined}
                      aria-describedby={describedBy("category")}
                      // Enter keeps its row meaning (next row, ⌘/Ctrl+Enter saves) instead of
                      // opening the list; Space and the arrow keys still open it.
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") onRowKeyDown(ev, row);
                      }}
                    >
                      <SelectValue placeholder={categories.isPending ? "Loading…" : "Choose…"} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {categoryList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className={cell}>
                  <MoneyInput
                    ref={register(row, "amount")}
                    variant="cell"
                    prefix={refund ? "−" : null}
                    prefixClassName="text-sm font-bold text-refund-text"
                    className={refund ? "[&_input]:text-refund-text" : undefined}
                    aria-label={`${refund ? "Refund amount" : "Amount"}, ${rowLabel}`}
                    aria-invalid={e.amount ? true : undefined}
                    aria-describedby={describedBy("amount")}
                    value={row.amount}
                    onValueChange={(amount) => update(row.key, { amount }, ["amount"])}
                    onKeyDown={(ev) => onRowKeyDown(ev, row)}
                  />
                </TableCell>
                <TableCell className={cell}>
                  <Input
                    ref={register(row, "note")}
                    variant="cell"
                    type="text"
                    aria-label={`Note, ${rowLabel}`}
                    aria-invalid={e.note ? true : undefined}
                    aria-describedby={describedBy("note")}
                    maxLength={NOTE_MAX}
                    placeholder="Optional"
                    value={row.note}
                    onChange={(ev) => update(row.key, { note: ev.target.value }, ["note"])}
                    onKeyDown={(ev) => onRowKeyDown(ev, row)}
                  />
                  {messages.length > 0 && (
                    <ul className="mt-1.5 mb-0 list-none px-2 text-xs font-semibold text-danger-alert-foreground">
                      {messages.map(([f, m]) => (
                        <li key={f} id={errId(f)}>
                          {m}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className={cell}>
                  {(rows.length > 1 || !isBlank(row)) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-danger-alert-foreground"
                      aria-label={`Remove ${rowLabel}`}
                      onClick={() => removeRow(row)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap gap-4 px-3.5 pt-2 pb-3">
        <Button variant="link" className="px-1.5" onClick={() => addRow(false)}>
          <Plus />
          Add row
        </Button>
        <Button variant="link" className="px-1.5" onClick={() => addRow(true)}>
          <Plus />
          Add refund
        </Button>
      </div>

      {alert && (
        <Alert variant="destructive" className="mx-5 mb-3 w-auto">
          <AlertCircle />
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-b-xl border-0 border-t border-solid border-border bg-muted/50 px-5 py-3.5">
        <p className="m-0 text-muted-foreground tabular-nums" aria-live="polite">
          {plural(filled.length, "row", "rows")} ready ·{" "}
          <strong className="text-foreground">{formatCents(netCents)}</strong> net
        </p>
        <SavedStatus text={saved} />
        <div className="ml-auto flex gap-2.5">
          <Button variant="outline" disabled={filled.length === 0} onClick={discard}>
            Discard
          </Button>
          <Button
            disabled={createExpenses.isPending}
            aria-keyshortcuts={mod === "⌘" ? "Meta+Enter" : "Control+Enter"}
            onClick={() => void save()}
          >
            <Check />
            {createExpenses.isPending
              ? "Saving…"
              : `Save ${filled.length > 1 ? `${count.format(filled.length)} entries` : "entry"}`}
          </Button>
        </div>
      </div>
    </Card>
  );
}

