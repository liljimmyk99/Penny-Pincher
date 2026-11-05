import { useId, useState } from "react";
import { errorMessage, useEntryMutations, useIncomeSources, type Schemas } from "../../api";
import { formatShortDate, isDate } from "../../lib/dates";
import { NOTE_MAX } from "../../lib/limits";
import { centsToInput, parseCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { EditDialog, FormField } from "./EditDialog";
import { invalidProps, serverErrors } from "./form";

type MoneyField = "gross" | "taxable" | "net";
type Field = MoneyField | "source" | "date" | "note";
type Errors = Partial<Record<Field, string>>;

const SERVER_FIELDS: Record<string, Field> = {
  income_source_id: "source",
  date: "date",
  gross_cents: "gross",
  gross_taxable_cents: "taxable",
  net_cents: "net",
  note: "note",
};

const ORDER: Field[] = ["source", "date", "note", "gross", "taxable", "net"];
const LABELS: Record<MoneyField, string> = { gross: "gross", taxable: "gross taxable", net: "net" };

/**
 * Edits one income entry. Only changed fields are sent (PATCH); saving an
 * unconfirmed template copy also confirms it. Taxable and net can't exceed gross.
 */
export function EditIncomeDialog({ entry, onClose }: { entry: Schemas["IncomeEntry"]; onClose: () => void }) {
  const uid = useId();
  const sources = useIncomeSources();
  const { updateIncome } = useEntryMutations();
  const [sourceId, setSourceId] = useState(entry.income_source_id);
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note ?? "");
  const [money, setMoney] = useState<Record<MoneyField, string>>({
    gross: centsToInput(entry.gross_cents),
    taxable: centsToInput(entry.gross_taxable_cents),
    net: centsToInput(entry.net_cents),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const id = (f: Field) => `${uid}-${f}`;
  const cents = { gross: parseCents(money.gross), taxable: parseCents(money.taxable), net: parseCents(money.net) };

  function clear(...fs: Field[]) {
    if (fs.some((f) => errors[f])) {
      setErrors((prev) => {
        const next = { ...prev };
        for (const f of fs) delete next[f];
        return next;
      });
    }
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!sourceId) e.source = "Choose a source.";
    if (!isDate(date)) e.date = "Pick a date.";
    for (const f of ["gross", "taxable", "net"] as MoneyField[]) {
      const c = cents[f];
      if (!money[f].trim()) e[f] = `Enter the ${LABELS[f]} amount (0 if none).`;
      else if (c === null) e[f] = "Enter an amount like 1234.56.";
      else if (c < 0) e[f] = "Income amounts can’t be negative.";
    }
    if (!e.gross && !e.taxable && cents.taxable! > cents.gross!) e.taxable = "Gross taxable can’t be more than gross.";
    if (!e.gross && !e.net && cents.net! > cents.gross!) e.net = "Net can’t be more than gross.";
    if (note.trim().length > NOTE_MAX) e.note = `Keep the label under ${NOTE_MAX} characters.`;
    return e;
  }

  function changes(): Schemas["IncomeEntryUpdate"] {
    const body: Schemas["IncomeEntryUpdate"] = {};
    const nextNote = note.trim() || null;
    if (sourceId !== entry.income_source_id) body.income_source_id = sourceId;
    if (date !== entry.date) body.date = date;
    if (nextNote !== entry.note) body.note = nextNote;
    if (cents.gross !== entry.gross_cents) body.gross_cents = cents.gross!;
    if (cents.taxable !== entry.gross_taxable_cents) body.gross_taxable_cents = cents.taxable!;
    if (cents.net !== entry.net_cents) body.net_cents = cents.net!;
    return body;
  }

  async function save() {
    if (updateIncome.isPending) return;
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
      await updateIncome.mutateAsync({ id: entry.id, body });
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

  const sourceName = sources.data?.find((s) => s.id === entry.income_source_id)?.name ?? "Income";
  const rate = cents.taxable !== null && cents.net !== null && cents.taxable >= 0 ? formatTaxRate(cents.taxable, cents.net) : "—";

  const moneyInput = (f: MoneyField, label: string) => (
    <FormField id={id(f)} label={label} error={errors[f]}>
      <input
        id={id(f)}
        className="field field--num"
        type="text"
        inputMode="decimal"
        value={money[f]}
        onChange={(ev) => {
          setMoney((m) => ({ ...m, [f]: ev.target.value }));
          clear(f, ...(f === "gross" ? (["taxable", "net"] as Field[]) : []));
        }}
        {...invalidProps(id(f), errors[f])}
      />
    </FormField>
  );

  return (
    <EditDialog
      open
      title="Edit income entry"
      description={`${sourceName} · ${formatShortDate(entry.date)}.`}
      pending={updateIncome.isPending}
      alert={alert}
      onSubmit={() => void save()}
      onClose={onClose}
    >
      <div className="edit-form__grid">
        <FormField id={id("source")} label="Source" error={errors.source}>
          <select
            id={id("source")}
            className="field"
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              clear("source");
            }}
            {...invalidProps(id("source"), errors.source)}
          >
            {(sources.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id={id("date")} label="Date" error={errors.date}>
          <input
            id={id("date")}
            className="field"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              clear("date");
            }}
            {...invalidProps(id("date"), errors.date)}
          />
        </FormField>
        <FormField
          id={id("note")}
          label={
            <>
              Label <span className="edit-form__optional">optional</span>
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
            onChange={(e) => {
              setNote(e.target.value);
              clear("note");
            }}
            {...invalidProps(id("note"), errors.note)}
          />
        </FormField>
        {moneyInput("gross", "Gross")}
        {moneyInput("taxable", "Gross taxable")}
        {moneyInput("net", "Net")}
        <div className="edit-form__rate">
          <span className="field-label">Tax rate</span>
          <strong aria-live="polite">{rate}</strong>
        </div>
      </div>
    </EditDialog>
  );
}
