import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  errorMessage,
  fieldErrors,
  useEntryMutations,
  useIncomeSources,
  useMonthIncome,
  type Schemas,
} from "../../api";
import { AlertIcon, CheckIcon } from "../../components/icons";
import { defaultDateFor, isDate, monthName } from "../../lib/dates";
import { formatCents, parseCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { NOTE_MAX } from "./expenseRows";

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

const count = new Intl.NumberFormat("en-US");

/** A paycheck or one-off job: source, date, gross, gross taxable, net and a label (the note). */
export function IncomeForm({ month }: { month: string }) {
  const uid = useId();
  const sources = useIncomeSources();
  const { createIncome } = useEntryMutations();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [date, setDate] = useState(() => defaultDateFor(month));
  const [dateTouched, setDateTouched] = useState(false);
  const [note, setNote] = useState("");
  const [money, setMoney] = useState<Record<MoneyField, string>>({ gross: "", taxable: "", net: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [seenMonth, setSeenMonth] = useState(month);
  const grossRef = useRef<HTMLInputElement>(null);
  const radios = useRef(new Map<string, HTMLButtonElement>());

  if (seenMonth !== month) {
    setSeenMonth(month);
    if (!dateTouched) setDate(defaultDateFor(month));
  }

  const list = sources.data ?? [];
  const selected = list.find((s) => s.id === sourceId) ?? list[0] ?? null;
  const cents = {
    gross: parseCents(money.gross),
    taxable: parseCents(money.taxable),
    net: parseCents(money.net),
  };
  const id = (f: Field) => `${uid}-${f}`;
  const errId = (f: Field) => (errors[f] ? `${id(f)}-err` : undefined);

  function clear(...fs: Field[]) {
    setSaved(null);
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
    if (!selected) e.source = "Choose a source.";
    if (!isDate(date)) e.date = "Pick a date.";
    const labels: Record<MoneyField, string> = { gross: "gross", taxable: "gross taxable", net: "net" };
    for (const f of ["gross", "taxable", "net"] as MoneyField[]) {
      const c = cents[f];
      if (!money[f].trim()) e[f] = `Enter the ${labels[f]} amount (0 if none).`;
      else if (c === null) e[f] = "Enter an amount like 1234.56.";
      else if (c < 0) e[f] = "Income amounts can’t be negative.";
    }
    if (!e.gross && !e.taxable && cents.taxable! > cents.gross!) e.taxable = "Gross taxable can’t be more than gross.";
    if (!e.gross && !e.net && cents.net! > cents.gross!) e.net = "Net can’t be more than gross.";
    if (note.trim().length > NOTE_MAX) e.note = `Keep the label under ${NOTE_MAX} characters.`;
    return e;
  }

  async function save() {
    if (createIncome.isPending) return;
    setSaved(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setAlert("Check the highlighted fields. Nothing was saved.");
      focusFirst(e);
      return;
    }
    setAlert(null);
    const body: Schemas["IncomeEntryCreate"] = {
      income_source_id: selected!.id,
      date,
      gross_cents: cents.gross!,
      gross_taxable_cents: cents.taxable!,
      net_cents: cents.net!,
      note: note.trim() || null,
      confirmed: true,
    };
    try {
      await createIncome.mutateAsync(body);
      setSaved(`Saved ${formatCents(body.net_cents)} net from ${selected!.name}.`);
      setMoney({ gross: "", taxable: "", net: "" });
      setNote("");
      grossRef.current?.focus();
    } catch (err) {
      const server: Errors = {};
      const other: string[] = [];
      for (const [field, issue] of Object.entries(fieldErrors(err))) {
        const f = SERVER_FIELDS[field];
        if (f) server[f] ??= issue;
        else other.push(issue);
      }
      setErrors(server);
      setAlert([`Nothing was saved. ${errorMessage(err)}`, ...other].join(" "));
      focusFirst(server);
    }
  }

  function focusFirst(e: Errors) {
    const order: Field[] = ["source", "note", "date", "gross", "taxable", "net"];
    const f = order.find((k) => e[k]);
    if (!f) return;
    if (f === "source") {
      if (selected) radios.current.get(selected.id)?.focus();
      return;
    }
    document.getElementById(id(f))?.focus();
  }

  /** Roving focus over the source radios: arrows move and select, Home/End jump. */
  function onRadioKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: list.length - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = list[(keys[e.key] + list.length) % list.length];
    setSourceId(next.id);
    clear("source");
    radios.current.get(next.id)?.focus();
  }

  const moneyInput = (f: MoneyField, label: string) => (
    <div className="income__field">
      <label htmlFor={id(f)} className="field-label">
        {label}
      </label>
      <div className="money-field" data-invalid={errors[f] ? true : undefined}>
        <span aria-hidden="true">$</span>
        <input
          id={id(f)}
          ref={f === "gross" ? grossRef : undefined}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={money[f]}
          aria-invalid={errors[f] ? true : undefined}
          aria-describedby={errId(f)}
          onChange={(ev) => {
            setMoney((m) => ({ ...m, [f]: ev.target.value }));
            clear(f, ...(f === "gross" ? (["taxable", "net"] as Field[]) : []));
          }}
        />
      </div>
      {errors[f] && (
        <p id={errId(f)} className="income__error">
          {errors[f]}
        </p>
      )}
    </div>
  );

  const rate = cents.taxable !== null && cents.net !== null && cents.taxable >= 0 ? formatTaxRate(cents.taxable, cents.net) : "—";

  return (
    <section className="card entry-card income" aria-labelledby="income-h">
      <div className="entry-card__head">
        <div>
          <h2 id="income-h">Income</h2>
          <p className="entry-card__desc">A paycheck or a one-off job.</p>
        </div>
      </div>
      <form
        className="income__form"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void save();
        }}
      >
        <div className="income__field">
          <span id={id("source")} className="field-label">
            Source
          </span>
          {sources.isPending ? (
            <p className="entry-card__desc">Loading sources…</p>
          ) : sources.isError ? (
            <p role="alert" className="alert alert--danger">
              <AlertIcon width={18} height={18} />
              <span>
                Couldn’t load income sources. {errorMessage(sources.error)}{" "}
                <button type="button" className="text-btn" onClick={() => void sources.refetch()}>
                  Try again
                </button>
              </span>
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby={id("source")}
              aria-describedby={errId("source")}
              className="seg-group"
            >
              {list.map((s, i) => {
                const on = s.id === selected?.id;
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      if (el) radios.current.set(s.id, el);
                      else radios.current.delete(s.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    className={on ? "seg is-on" : "seg"}
                    onClick={() => {
                      setSourceId(s.id);
                      clear("source");
                    }}
                    onKeyDown={(e) => onRadioKey(e, i)}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
          {errors.source && (
            <p id={errId("source")} className="income__error">
              {errors.source}
            </p>
          )}
        </div>

        <div className="income__row">
          <div className="income__field">
            <label htmlFor={id("note")} className="field-label">
              Label <span className="income__optional">optional</span>
            </label>
            <input
              id={id("note")}
              className="field"
              type="text"
              placeholder="e.g. Paycheck"
              maxLength={NOTE_MAX}
              value={note}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errId("note")}
              onChange={(e) => {
                setNote(e.target.value);
                clear("note");
              }}
            />
            {errors.note && (
              <p id={errId("note")} className="income__error">
                {errors.note}
              </p>
            )}
          </div>
          <div className="income__field">
            <label htmlFor={id("date")} className="field-label">
              Date
            </label>
            <input
              id={id("date")}
              className="field"
              type="date"
              required
              value={date}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errId("date")}
              onChange={(e) => {
                setDate(e.target.value);
                setDateTouched(true);
                clear("date");
              }}
            />
            {errors.date && (
              <p id={errId("date")} className="income__error">
                {errors.date}
              </p>
            )}
          </div>
        </div>

        <div className="income__money">
          {moneyInput("gross", "Gross")}
          {moneyInput("taxable", "Gross taxable")}
          {moneyInput("net", "Net")}
          <div className="income__rate">
            <span>
              Tax rate <span className="income__optional">(taxable − net) ÷ taxable</span>
            </span>
            <strong aria-live="polite">{rate}</strong>
          </div>
        </div>

        {alert && (
          <p role="alert" className="alert alert--danger">
            <AlertIcon width={18} height={18} />
            {alert}
          </p>
        )}
        <div className="income__actions">
          <button type="submit" className="btn btn--income" disabled={createIncome.isPending || !selected}>
            <CheckIcon />
            {createIncome.isPending ? "Saving…" : "Save income"}
          </button>
          <div role="status" className="entry-card__saved">
            {saved && (
              <>
                <CheckIcon width={16} height={16} />
                {saved}
              </>
            )}
          </div>
        </div>
      </form>
      <MonthSoFar month={month} sources={list} />
    </section>
  );
}

/** That month's income so far, net, per source. Display-only sums of integer cents. */
function MonthSoFar({ month, sources }: { month: string; sources: Schemas["IncomeSource"][] }) {
  const entries = useMonthIncome(month);
  const heading = `${monthName(month)} so far · net`;

  let body;
  if (entries.isPending) body = <p className="so-far__empty">Loading…</p>;
  else if (entries.isError)
    body = (
      <p className="so-far__empty">
        Couldn’t load this month’s income. {errorMessage(entries.error)}{" "}
        <button type="button" className="text-btn" onClick={() => void entries.refetch()}>
          Try again
        </button>
      </p>
    );
  else if (entries.data.length === 0) body = <p className="so-far__empty">No income logged in {monthName(month)} yet.</p>;
  else {
    const bySource = new Map<string, { n: number; net: number }>();
    for (const e of entries.data) {
      const t = bySource.get(e.income_source_id) ?? { n: 0, net: 0 };
      bySource.set(e.income_source_id, { n: t.n + 1, net: t.net + e.net_cents });
    }
    const total = entries.data.reduce((sum, e) => sum + e.net_cents, 0);
    body = (
      <dl className="so-far__list">
        {sources
          .filter((s) => bySource.has(s.id))
          .map((s) => {
            const t = bySource.get(s.id)!;
            return (
              <div key={s.id} className="so-far__row">
                <dt>
                  {s.name} <span>· {count.format(t.n)} {t.n === 1 ? "entry" : "entries"}</span>
                </dt>
                <dd>{formatCents(t.net)}</dd>
              </div>
            );
          })}
        <div className="so-far__row so-far__row--total">
          <dt>Total</dt>
          <dd>{formatCents(total)}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="so-far" aria-labelledby="so-far-h">
      <h3 id="so-far-h" className="eyebrow">
        {heading}
      </h3>
      {body}
    </div>
  );
}
