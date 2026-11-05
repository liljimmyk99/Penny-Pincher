import { useQueryClient } from "@tanstack/react-query";
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
import { AlertIcon, CheckIcon, PlusIcon, TrashIcon } from "../../components/icons";
import { defaultDateFor } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { isApplePlatform } from "../../shell/platform";
import { MerchantCombobox } from "../../components/MerchantCombobox";
import { RefundLink } from "./RefundLink";
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

  return (
    <section className="card entry-card" aria-labelledby="expenses-h">
      <div className="entry-card__head">
        <div>
          <h2 id="expenses-h">Expenses</h2>
          <p className="entry-card__desc">Log one as it happens, or a whole stack at once. Nothing saves until you press Save.</p>
        </div>
        <p className="entry-card__keys" id="expense-keys">
          <span>
            <kbd>Enter</kbd> next row
          </span>
          <span>
            <kbd>{mod} Enter</kbd> save all
          </span>
        </p>
      </div>

      {categories.isError && (
        <p role="alert" className="alert alert--danger entry-card__alert">
          <AlertIcon width={18} height={18} />
          <span>
            Couldn’t load categories. {errorMessage(categories.error)}{" "}
            <button type="button" className="text-btn" onClick={() => void categories.refetch()}>
              Try again
            </button>
          </span>
        </p>
      )}

      <div className="batch__scroll">
        <table className="batch">
          <caption className="visually-hidden">New expenses</caption>
          <thead>
            <tr>
              <th scope="col" className="batch__date">Date</th>
              <th scope="col" className="batch__merchant">Merchant</th>
              <th scope="col" className="batch__category">Category</th>
              <th scope="col" className="batch__amount num">Amount</th>
              <th scope="col">Note</th>
              <th scope="col" className="batch__remove">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const n = i + 1;
              const rowLabel = `row ${n}`;
              const e = errors.get(row.key) ?? {};
              const refund = isRefund(row);
              const errId = (f: RowField) => (e[f] ? `exp-${row.key}-${f}-err` : undefined);
              const describedBy = (f: RowField) => [errId(f), "expense-keys"].filter(Boolean).join(" ");
              const messages = (Object.entries(e) as [RowField, string | undefined][]).filter(([, m]) => m);
              return (
                <tr key={row.key} className={refund ? "batch__row batch__row--refund" : "batch__row"}>
                  <td>
                    <input
                      ref={register(row, "date")}
                      className="cell-input"
                      type="date"
                      aria-label={`Date, ${rowLabel}`}
                      aria-invalid={e.date ? true : undefined}
                      aria-describedby={describedBy("date")}
                      value={row.date}
                      required
                      onChange={(ev) => update(row.key, { date: ev.target.value }, ["date"])}
                      onKeyDown={(ev) => onRowKeyDown(ev, row)}
                    />
                  </td>
                  <td>
                    <MerchantCombobox
                      id={`exp-${row.key}-merchant`}
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
                  </td>
                  <td>
                    <select
                      ref={register(row, "category")}
                      className="cell-input"
                      aria-label={`Category, ${rowLabel}`}
                      aria-invalid={e.category ? true : undefined}
                      aria-describedby={describedBy("category")}
                      value={row.categoryId}
                      onChange={(ev) =>
                        update(row.key, { categoryId: ev.target.value, categoryTouched: true }, ["category"])
                      }
                      onKeyDown={(ev) => onRowKeyDown(ev, row)}
                    >
                      <option value="" disabled>
                        {categories.isPending ? "Loading…" : "Choose…"}
                      </option>
                      {categoryList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="cell-money">
                      {refund && (
                        <span className="cell-money__sign" aria-hidden="true">
                          −
                        </span>
                      )}
                      <input
                        ref={register(row, "amount")}
                        className="cell-input num"
                        type="text"
                        inputMode="decimal"
                        aria-label={`${refund ? "Refund amount" : "Amount"}, ${rowLabel}`}
                        aria-invalid={e.amount ? true : undefined}
                        aria-describedby={describedBy("amount")}
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(ev) => update(row.key, { amount: ev.target.value }, ["amount"])}
                        onKeyDown={(ev) => onRowKeyDown(ev, row)}
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      ref={register(row, "note")}
                      className="cell-input"
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
                      <ul className="batch__errors">
                        {messages.map(([f, m]) => (
                          <li key={f} id={errId(f)}>
                            {m}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {(rows.length > 1 || !isBlank(row)) && (
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        aria-label={`Remove ${rowLabel}`}
                        onClick={() => removeRow(row)}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="batch__add">
        <button type="button" className="text-btn" onClick={() => addRow(false)}>
          <PlusIcon />
          Add row
        </button>
        <button type="button" className="text-btn" onClick={() => addRow(true)}>
          <PlusIcon />
          Add refund
        </button>
      </div>

      {alert && (
        <p role="alert" className="alert alert--danger entry-card__alert">
          <AlertIcon width={18} height={18} />
          {alert}
        </p>
      )}

      <div className="entry-card__foot">
        <p className="batch__total" aria-live="polite">
          {plural(filled.length, "row", "rows")} ready · <strong>{formatCents(netCents)}</strong> net
        </p>
        <div role="status" className="entry-card__saved">
          {saved && (
            <>
              <CheckIcon width={16} height={16} />
              {saved}
            </>
          )}
        </div>
        <div className="entry-card__actions">
          <button type="button" className="btn btn--ghost" disabled={filled.length === 0} onClick={discard}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={createExpenses.isPending}
            aria-keyshortcuts={mod === "⌘" ? "Meta+Enter" : "Control+Enter"}
            onClick={() => void save()}
          >
            <CheckIcon />
            {createExpenses.isPending
              ? "Saving…"
              : `Save ${filled.length > 1 ? `${count.format(filled.length)} entries` : "entry"}`}
          </button>
        </div>
      </div>
    </section>
  );
}
