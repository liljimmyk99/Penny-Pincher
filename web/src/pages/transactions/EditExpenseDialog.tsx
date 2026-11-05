import { useId, useState } from "react";
import { errorMessage, useCategories, useEntryMutations, type Schemas } from "../../api";
import { MerchantCombobox } from "../../components/MerchantCombobox";
import { formatShortDate, isDate } from "../../lib/dates";
import { MERCHANT_MAX, NOTE_MAX } from "../../lib/limits";
import { centsToInput, parseCents } from "../../lib/money";
import { EditDialog, FormField } from "./EditDialog";
import { invalidProps, serverErrors } from "./form";

type Field = "date" | "merchant" | "category" | "amount" | "note";
type Errors = Partial<Record<Field, string>>;

const SERVER_FIELDS: Record<string, Field> = {
  date: "date",
  merchant_name: "merchant",
  category_id: "category",
  amount_cents: "amount",
  note: "note",
  refunded_expense_id: "amount",
};

const ORDER: Field[] = ["date", "merchant", "category", "amount", "note"];

/**
 * Edits one expense or refund. Only changed fields are sent (PATCH); saving an
 * unconfirmed template copy also confirms it (api/openapi.yaml). A negative
 * amount is a refund.
 */
export function EditExpenseDialog({ expense, onClose }: { expense: Schemas["Expense"]; onClose: () => void }) {
  const uid = useId();
  const categories = useCategories();
  const { updateExpense } = useEntryMutations();
  const [date, setDate] = useState(expense.date);
  const [merchant, setMerchant] = useState(expense.merchant.name);
  const [categoryId, setCategoryId] = useState(expense.category_id);
  const [amount, setAmount] = useState(centsToInput(expense.amount_cents));
  const [note, setNote] = useState(expense.note ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const id = (f: Field) => `${uid}-${f}`;

  function edit(f: Field, set: (v: string) => void) {
    return (v: string) => {
      set(v);
      if (errors[f])
        setErrors((prev) => {
          const next = { ...prev };
          delete next[f];
          return next;
        });
    };
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!isDate(date)) e.date = "Pick a date.";
    if (!merchant.trim()) e.merchant = "Enter a merchant.";
    else if (merchant.trim().length > MERCHANT_MAX) e.merchant = `Keep it under ${MERCHANT_MAX} characters.`;
    if (!categoryId) e.category = "Choose a category.";
    const cents = parseCents(amount);
    if (!amount.trim()) e.amount = "Enter an amount.";
    else if (cents === null) e.amount = "Enter an amount like 12.34, or −12.34 for a refund.";
    else if (cents === 0) e.amount = "The amount can’t be zero.";
    if (note.trim().length > NOTE_MAX) e.note = `Keep the note under ${NOTE_MAX} characters.`;
    return e;
  }

  /** Only what changed. Turning a refund back into an expense also drops its link. */
  function changes(): Schemas["ExpenseUpdate"] {
    const body: Schemas["ExpenseUpdate"] = {};
    const cents = parseCents(amount)!;
    const nextNote = note.trim() || null;
    if (date !== expense.date) body.date = date;
    if (merchant.trim() !== expense.merchant.name) body.merchant_name = merchant.trim();
    if (categoryId !== expense.category_id) body.category_id = categoryId;
    if (cents !== expense.amount_cents) body.amount_cents = cents;
    if (nextNote !== expense.note) body.note = nextNote;
    if (cents > 0 && expense.refunded_expense_id) body.refunded_expense_id = null;
    return body;
  }

  async function save() {
    if (updateExpense.isPending) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setAlert("Check the highlighted fields. Nothing was saved.");
      focusFirst(e);
      return;
    }
    setAlert(null);
    const body = changes();
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      await updateExpense.mutateAsync({ id: expense.id, body });
      onClose();
    } catch (err) {
      const { byField, other } = serverErrors(err, SERVER_FIELDS);
      setErrors(byField);
      setAlert([`Nothing was saved. ${errorMessage(err)}`, ...other].join(" "));
      focusFirst(byField);
    }
  }

  function focusFirst(e: Errors) {
    const f = ORDER.find((k) => e[k]);
    if (f) document.getElementById(id(f))?.focus();
  }

  const kind = expense.amount_cents < 0 ? "refund" : "expense";
  return (
    <EditDialog
      open
      title={`Edit ${kind}`}
      description={`${expense.merchant.name} · ${formatShortDate(expense.date)}. Use a negative amount for a refund.`}
      pending={updateExpense.isPending}
      alert={alert}
      onSubmit={() => void save()}
      onClose={onClose}
    >
      <div className="edit-form__grid">
        <FormField id={id("date")} label="Date" error={errors.date}>
          <input
            id={id("date")}
            className="field"
            type="date"
            required
            value={date}
            onChange={(e) => edit("date", setDate)(e.target.value)}
            {...invalidProps(id("date"), errors.date)}
          />
        </FormField>
        <FormField id={id("amount")} label="Amount" error={errors.amount}>
          <input
            id={id("amount")}
            className="field field--num"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => edit("amount", setAmount)(e.target.value)}
            {...invalidProps(id("amount"), errors.amount)}
          />
        </FormField>
        <FormField id={id("merchant")} label="Merchant" error={errors.merchant} wide>
          <MerchantCombobox
            id={id("merchant")}
            label="Merchant"
            className="field"
            value={merchant}
            invalid={!!errors.merchant}
            describedBy={errors.merchant ? `${id("merchant")}-err` : undefined}
            onChange={edit("merchant", setMerchant)}
            onPick={(m) => edit("merchant", setMerchant)(m.name)}
            onCommit={() => {}}
          />
        </FormField>
        <FormField id={id("category")} label="Category" error={errors.category} wide>
          <select
            id={id("category")}
            className="field"
            value={categoryId}
            onChange={(e) => edit("category", setCategoryId)(e.target.value)}
            {...invalidProps(id("category"), errors.category)}
          >
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id={id("note")}
          label={
            <>
              Note <span className="edit-form__optional">optional</span>
            </>
          }
          error={errors.note}
          wide
        >
          <input
            id={id("note")}
            className="field"
            type="text"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => edit("note", setNote)(e.target.value)}
            {...invalidProps(id("note"), errors.note)}
          />
        </FormField>
      </div>
    </EditDialog>
  );
}
