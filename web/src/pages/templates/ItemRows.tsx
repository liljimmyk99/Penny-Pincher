import { useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { errorMessage, useTemplateItemMutations, type Schemas } from "../../api";
import { AlertCircleIcon, CheckIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/MoneyInput";
import { Input, inputVariants } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MerchantCombobox } from "../../components/MerchantCombobox";
import { serverErrors } from "../transactions/form";
import {
  EXPENSE_API_FIELDS,
  expenseForm,
  expensePatch,
  INCOME_API_FIELDS,
  incomeForm,
  incomePatch,
  validateExpense,
  validateIncome,
  type Errors,
  type ExpenseForm,
  type IncomeForm,
} from "./itemForms";

type Mutations = ReturnType<typeof useTemplateItemMutations>;

/** A row of the editor's grid (the column headings use it too). */
export const ROW = "grid min-w-[820px] items-center gap-x-2.5 px-5 py-[3px]";
export const EXPENSE_GRID = "grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_160px_64px_120px_92px]";
export const INCOME_GRID = "grid-cols-[150px_minmax(120px,1fr)_64px_116px_116px_116px_92px]";

/** Day of month: the quiet `cell` Input (#175), right-aligned like the numbers. */
const DAY_CELL = "text-right font-semibold tabular-nums";

/**
 * How a row saves. A saved item saves its changed fields when focus leaves the
 * row or on Enter. A draft (a new item) is created on Enter or Save, or when
 * focus leaves it complete; Enter then clears it for the next item.
 */
interface RowProps {
  mutations: Mutations;
  /** Draft rows: called once it is saved (`again` after Enter) or discarded. */
  onDraftDone?: (again: boolean) => void;
  autoFocus?: boolean;
}

/** Keeps the form in step with the server copy until the user types in it. */
function useSyncedForm<F>(saved: F | null, blank: F) {
  const [form, setForm] = useState<F>(saved ?? blank);
  const [base, setBase] = useState<string>(JSON.stringify(saved ?? blank));
  // Typed in since the form last matched the server copy. A newer copy leaves
  // the text alone even if it equals the older copy (an edit undone mid-save).
  const [edited, setEdited] = useState(false);
  const next = JSON.stringify(saved ?? blank);
  if (saved && next !== base) {
    if (!edited) setForm(saved);
    else if (JSON.stringify(form) === next) setEdited(false);
    setBase(next);
  }
  function edit(patch: Partial<F>) {
    setForm((f) => ({ ...f, ...patch }));
    setEdited(true);
  }
  return [form, setForm, edit] as const;
}

/**
 * One save at a time per row. A saved item's save asked for while another is in
 * flight is queued, not dropped, and runs when that one settles (the newest ask
 * wins). Saves diff against `latest()`: a save's reply reaches the row before
 * the template refetch re-renders it with a new `item`, so until then the reply
 * is the newest server copy.
 */
function useRowSave<F extends string, T>(item: T | undefined) {
  const [errors, setErrors] = useState<Errors<F>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const busy = useRef(false);
  const queued = useRef<(() => void) | null>(null);
  const shown = useRef(item);
  const reply = useRef<{ copy: T; over: T | undefined } | null>(null);
  useLayoutEffect(() => {
    shown.current = item;
  });

  /** The newest server copy of the item: the last reply, until a newer `item` renders. */
  function latest(): T | undefined {
    const r = reply.current;
    return r && r.over === shown.current ? r.copy : shown.current;
  }

  /** While a save is in flight, keeps `commit` to run after it and returns true. */
  function queue(commit: () => void): boolean {
    if (!busy.current) return false;
    queued.current = commit;
    return true;
  }

  async function run(save: () => Promise<T>, fields: Record<string, F>): Promise<boolean> {
    // Only a draft gets here mid-save: its create already carries its values, so
    // a second ask (Enter, then focus leaving) must not create it twice.
    if (busy.current) return false;
    busy.current = true;
    setAlert(null);
    let ok = false;
    try {
      const copy = await save();
      reply.current = { copy, over: shown.current };
      setErrors({});
      ok = true;
    } catch (err) {
      const { byField, other } = serverErrors(err, fields);
      setErrors(byField);
      const fieldsFlagged = Object.keys(byField).length > 0;
      setAlert(other.length > 0 ? other.join(" ") : fieldsFlagged ? null : errorMessage(err));
    }
    busy.current = false;
    const next = queued.current;
    queued.current = null;
    next?.();
    return ok;
  }
  return { errors, setErrors, alert, setAlert, latest, queue, run };
}

/**
 * Leaving the row (not just moving between its fields) saves it. Opening a
 * Category or Source picker moves focus into its menu, which Radix renders in a
 * portal outside the row; that doesn't count as leaving (#176).
 */
function leftRow(e: FocusEvent<HTMLElement>) {
  const next = e.relatedTarget as Element | null;
  if (next?.closest('[data-slot="select-content"]')) return false;
  return !e.currentTarget.contains(next);
}

export function ExpenseItemRow({
  item,
  categoryId,
  categories,
  mutations,
  onDraftDone,
  autoFocus,
}: RowProps & {
  item?: Schemas["TemplateExpenseItem"];
  /** The group a draft was added under. */
  categoryId: string;
  categories: Schemas["Category"][];
}) {
  const id = useId();
  const blank: ExpenseForm = { merchant: "", categoryId, day: "1", amount: "", note: "" };
  const [form, setForm, edit] = useSyncedForm(item ? expenseForm(item) : null, blank);
  const { errors, setErrors, alert, setAlert, latest, queue, run } = useRowSave<
    keyof ExpenseForm,
    Schemas["TemplateExpenseItem"]
  >(item);
  const firstRef = useRef<HTMLInputElement>(null);
  // Merchant plus note tells apart several items from one merchant ("Apple · iCloud+").
  const label = item ? [item.merchant.name, item.note].filter(Boolean).join(" · ") : "new item";

  function update(patch: Partial<ExpenseForm>) {
    edit(patch);
    const cleared = { ...errors };
    for (const key of Object.keys(patch) as (keyof ExpenseForm)[]) delete cleared[key];
    setErrors(cleared);
  }

  async function commit(how: "leave" | "enter" | "button") {
    const result = validateExpense(form);
    if (!result.ok) {
      // A half-filled draft can wait; say what's missing only when asked to save.
      if (item || how !== "leave") setErrors(result.errors);
      return;
    }
    if (item) {
      if (queue(() => void commit(how))) return;
      const patch = expensePatch(latest() ?? item, result.value);
      if (Object.keys(patch).length === 0) return;
      await run(() => mutations.updateExpense.mutateAsync({ itemId: item.id, body: patch }), EXPENSE_API_FIELDS);
      return;
    }
    const ok = await run(() => mutations.createExpense.mutateAsync(result.value), EXPENSE_API_FIELDS);
    if (!ok) return;
    if (how === "enter") {
      setForm({ ...blank, categoryId: form.categoryId, day: form.day });
      firstRef.current?.focus();
    }
    onDraftDone?.(how === "enter");
  }

  async function remove() {
    if (!item) return onDraftDone?.(false);
    setAlert(null);
    try {
      await mutations.removeExpense.mutateAsync(item.id);
    } catch (err) {
      setAlert(errorMessage(err));
    }
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit("enter");
    }
  };
  const errIds = (field: keyof ExpenseForm) => (errors[field] ? `${id}-${field}-err` : undefined);

  return (
    <div
      role="group"
      aria-label={item ? label : "New expense item"}
      className={cn(ROW, EXPENSE_GRID, !item && "bg-muted")}
      onBlur={(e) => leftRow(e) && void commit("leave")}
    >
      <MerchantCombobox
        id={`${id}-merchant`}
        label={`Name, ${label}`}
        value={form.merchant}
        invalid={!!errors.merchant}
        describedBy={errIds("merchant")}
        className={inputVariants({ variant: "cell" })}
        inputRef={firstRef}
        onChange={(merchant) => update({ merchant })}
        onPick={(m) => update({ merchant: m.name })}
        onCommit={() => {}}
        onKeyDown={onEnter}
        autoFocus={autoFocus}
      />
      <Input
        variant="cell"
        aria-label={`Note, ${label}`}
        aria-invalid={errors.note ? true : undefined}
        aria-describedby={errIds("note")}
        placeholder="Note (optional)"
        value={form.note}
        onChange={(e) => update({ note: e.target.value })}
        onKeyDown={onEnter}
      />
      <Select value={form.categoryId} onValueChange={(categoryId) => update({ categoryId })}>
        <SelectTrigger
          variant="cell"
          className="w-full"
          aria-label={`Category, ${label}`}
          aria-invalid={errors.categoryId ? true : undefined}
          aria-describedby={errIds("categoryId")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        variant="cell"
        className={DAY_CELL}
        inputMode="numeric"
        aria-label={`Day of month, ${label}`}
        aria-invalid={errors.day ? true : undefined}
        aria-describedby={errIds("day")}
        value={form.day}
        maxLength={2}
        onChange={(e) => update({ day: e.target.value })}
        onKeyDown={onEnter}
      />
      <MoneyInput
        variant="cell"
        aria-label={`Amount, ${label}`}
        aria-invalid={errors.amount ? true : undefined}
        aria-describedby={errIds("amount")}
        value={form.amount}
        onValueChange={(amount) => update({ amount })}
        onKeyDown={onEnter}
      />
      <RowActions
        draft={!item}
        label={label}
        onSave={() => void commit("button")}
        onRemove={() => void remove()}
      />
      <RowErrors id={id} errors={errors} alert={alert} />
    </div>
  );
}

export function IncomeItemRow({
  item,
  sources,
  mutations,
  onDraftDone,
  autoFocus,
}: RowProps & {
  item?: Schemas["TemplateIncomeItem"];
  sources: Schemas["IncomeSource"][];
}) {
  const id = useId();
  const blank: IncomeForm = { sourceId: sources[0]?.id ?? "", label: "", day: "1", gross: "", taxable: "", net: "" };
  const [form, setForm, edit] = useSyncedForm(item ? incomeForm(item) : null, blank);
  const { errors, setErrors, alert, setAlert, latest, queue, run } = useRowSave<
    keyof IncomeForm,
    Schemas["TemplateIncomeItem"]
  >(item);
  const firstRef = useRef<HTMLButtonElement>(null);
  const sourceName = (sourceId: string) => sources.find((s) => s.id === sourceId)?.name ?? "Income";
  const label = item ? [sourceName(item.income_source_id), item.note].filter(Boolean).join(" · ") : "new income";

  function update(patch: Partial<IncomeForm>) {
    edit(patch);
    const cleared = { ...errors };
    for (const key of Object.keys(patch) as (keyof IncomeForm)[]) delete cleared[key];
    setErrors(cleared);
  }

  async function commit(how: "leave" | "enter" | "button") {
    const result = validateIncome(form);
    if (!result.ok) {
      if (item || how !== "leave") setErrors(result.errors);
      return;
    }
    if (item) {
      if (queue(() => void commit(how))) return;
      const patch = incomePatch(latest() ?? item, result.value);
      if (Object.keys(patch).length === 0) return;
      await run(() => mutations.updateIncome.mutateAsync({ itemId: item.id, body: patch }), INCOME_API_FIELDS);
      return;
    }
    const ok = await run(() => mutations.createIncome.mutateAsync(result.value), INCOME_API_FIELDS);
    if (!ok) return;
    if (how === "enter") {
      setForm({ ...blank, sourceId: form.sourceId, day: form.day });
      firstRef.current?.focus();
    }
    onDraftDone?.(how === "enter");
  }

  async function remove() {
    if (!item) return onDraftDone?.(false);
    setAlert(null);
    try {
      await mutations.removeIncome.mutateAsync(item.id);
    } catch (err) {
      setAlert(errorMessage(err));
    }
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit("enter");
    }
  };
  const errIds = (field: keyof IncomeForm) => (errors[field] ? `${id}-${field}-err` : undefined);
  const money = (field: "gross" | "taxable" | "net", name: string) => (
    <MoneyInput
      variant="cell"
      aria-label={`${name}, ${label}`}
      aria-invalid={errors[field] ? true : undefined}
      aria-describedby={errIds(field)}
      value={form[field]}
      onValueChange={(text) => update({ [field]: text })}
      onKeyDown={onEnter}
    />
  );

  return (
    <div
      role="group"
      aria-label={item ? label : "New income item"}
      className={cn(ROW, INCOME_GRID, !item && "bg-muted")}
      onBlur={(e) => leftRow(e) && void commit("leave")}
    >
      <Select value={form.sourceId} onValueChange={(sourceId) => update({ sourceId })}>
        <SelectTrigger
          ref={firstRef}
          variant="cell"
          className="w-full"
          aria-label={`Source, ${label}`}
          aria-invalid={errors.sourceId ? true : undefined}
          aria-describedby={errIds("sourceId")}
          autoFocus={autoFocus}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        variant="cell"
        aria-label={`Label, ${label}`}
        aria-invalid={errors.label ? true : undefined}
        aria-describedby={errIds("label")}
        placeholder="Label (optional)"
        value={form.label}
        onChange={(e) => update({ label: e.target.value })}
        onKeyDown={onEnter}
      />
      <Input
        variant="cell"
        className={DAY_CELL}
        inputMode="numeric"
        aria-label={`Day of month, ${label}`}
        aria-invalid={errors.day ? true : undefined}
        aria-describedby={errIds("day")}
        value={form.day}
        maxLength={2}
        onChange={(e) => update({ day: e.target.value })}
        onKeyDown={onEnter}
      />
      {money("gross", "Gross")}
      {money("taxable", "Gross taxable")}
      {money("net", "Net")}
      <RowActions
        draft={!item}
        label={label}
        onSave={() => void commit("button")}
        onRemove={() => void remove()}
      />
      <RowErrors id={id} errors={errors} alert={alert} />
    </div>
  );
}

function RowActions({
  draft,
  label,
  onSave,
  onRemove,
}: {
  draft: boolean;
  label: string;
  onSave: () => void;
  onRemove: () => void;
}) {
  // Safari doesn't focus a clicked button, so the click would read as leaving
  // the row (and save a draft that is being discarded). Keep focus where it is.
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  return (
    <span className="inline-flex justify-end gap-1" onMouseDown={keepFocus}>
      {draft && (
        <Button variant="ghost" size="icon-sm" className="text-income" aria-label={`Save ${label}`} onClick={onSave}>
          <CheckIcon aria-hidden="true" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="hover:bg-danger-alert hover:text-danger-alert-foreground"
        aria-label={draft ? `Discard ${label}` : `Remove ${label}`}
        onClick={onRemove}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </span>
  );
}

function RowErrors<F extends string>({ id, errors, alert }: { id: string; errors: Errors<F>; alert: string | null }) {
  const entries = Object.entries(errors) as [F, string][];
  if (entries.length === 0 && !alert) return null;
  const items: ReactNode[] = entries.map(([field, message]) => (
    <li key={field} id={`${id}-${field}-err`}>
      {message}
    </li>
  ));
  if (alert) items.push(<li key="alert">{alert}</li>);
  return (
    <div className="col-span-full my-1 flex items-start gap-1.5 px-2 text-[13px] font-medium text-danger-alert-foreground" role="alert">
      <AlertCircleIcon aria-hidden="true" className="mt-px size-4 flex-none" />
      <ul className="m-0 list-none p-0">{items}</ul>
    </div>
  );
}
