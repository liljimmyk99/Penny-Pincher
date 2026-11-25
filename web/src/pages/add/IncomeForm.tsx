import { AlertCircle, Check } from "lucide-react";
import { useRef, useState } from "react";
import {
  errorMessage,
  fieldErrors,
  useEntryMutations,
  useIncomeSources,
  useMonthIncome,
  type Schemas,
} from "../../api";
import { FormField } from "../../components/FormField";
import { MoneyInput } from "../../components/MoneyInput";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { defaultDateFor, isDate, monthName } from "../../lib/dates";
import { formatCents, parseCents } from "../../lib/money";
import { cn } from "../../lib/utils";
import { formatTaxRate } from "../../lib/taxRate";
import { NOTE_MAX } from "./expenseRows";
import { SavedStatus } from "./SavedStatus";

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
  const controls = useRef(new Map<Field, HTMLElement>());
  const radios = useRef(new Map<string, HTMLButtonElement>());
  const control = (f: Field) => (el: HTMLElement | null) => {
    if (el) controls.current.set(f, el);
    else controls.current.delete(f);
  };

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
      controls.current.get("gross")?.focus();
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
    controls.current.get(f)?.focus();
  }

  const select = (next: string) => {
    if (next === selected?.id) return;
    setSourceId(next);
    clear("source");
  };

  const moneyInput = (f: MoneyField, label: string) => (
    <FormField label={label} error={errors[f]}>
      {(props) => (
        <MoneyInput
          {...props}
          ref={control(f)}
          className="[&_input]:text-[15px]"
          value={money[f]}
          onValueChange={(text) => {
            setMoney((m) => ({ ...m, [f]: text }));
            clear(f, ...(f === "gross" ? (["taxable", "net"] as Field[]) : []));
          }}
        />
      )}
    </FormField>
  );

  const rate = cents.taxable !== null && cents.net !== null && cents.taxable >= 0 ? formatTaxRate(cents.taxable, cents.net) : "—";

  return (
    <Card role="region" aria-labelledby="income-h" className="min-w-0 gap-0 py-0">
      <div className="px-5 pt-5 pb-3">
        <h2 id="income-h" className="m-0 text-lg leading-tight font-semibold">
          Income
        </h2>
        <CardDescription className="mt-1">A paycheck or a one-off job.</CardDescription>
      </div>
      <form
        className="flex flex-col gap-4 px-5 pb-5"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void save();
        }}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <span id="income-source" className="text-sm font-medium">
            Source
          </span>
          {sources.isPending ? (
            <p className="m-0 text-sm text-muted-foreground">Loading sources…</p>
          ) : sources.isError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                <p>
                  Couldn’t load income sources. {errorMessage(sources.error)}{" "}
                  <Button variant="link" className="h-auto p-0" onClick={() => void sources.refetch()}>
                    Try again
                  </Button>
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <ToggleGroup
              type="single"
              aria-labelledby="income-source"
              aria-describedby={errors.source ? "income-source-err" : undefined}
              value={selected?.id ?? ""}
              // A source is always chosen: clicking the chosen one again doesn't clear it.
              onValueChange={(v) => v && select(v)}
              spacing={1}
              className="flex w-full flex-wrap rounded-md bg-muted p-1"
            >
              {list.map((s) => (
                <ToggleGroupItem
                  key={s.id}
                  value={s.id}
                  ref={(el) => {
                    if (el) radios.current.set(s.id, el);
                    else radios.current.delete(s.id);
                  }}
                  // Arrow keys move and select, as a radio group does.
                  onFocus={() => select(s.id)}
                  className="h-10 flex-1 rounded-sm px-3.5 font-medium text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs"
                >
                  {s.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {errors.source && (
            <p id="income-source-err" className="m-0 text-sm font-medium text-danger-alert-foreground">
              {errors.source}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 min-[481px]:grid-cols-2">
          <FormField
            label={
              <>
                Label <span className="font-normal text-muted-foreground">optional</span>
              </>
            }
            error={errors.note}
          >
            {(props) => (
              <Input
                {...props}
                ref={control("note")}
                type="text"
                placeholder="e.g. Paycheck"
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  clear("note");
                }}
              />
            )}
          </FormField>
          <FormField label="Date" error={errors.date}>
            {(props) => (
              <Input
                {...props}
                ref={control("date")}
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateTouched(true);
                  clear("date");
                }}
              />
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[481px]:grid-cols-2">
          {moneyInput("gross", "Gross")}
          {moneyInput("taxable", "Gross taxable")}
          {moneyInput("net", "Net")}
          <div className="flex flex-col justify-end gap-1.5 text-sm font-medium">
            <span>
              Tax rate <span className="font-normal text-muted-foreground">(taxable − net) ÷ taxable</span>
            </span>
            <strong aria-live="polite" className="flex h-11 items-center text-lg font-semibold tabular-nums">
              {rate}
            </strong>
          </div>
        </div>

        {alert && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="success" disabled={createIncome.isPending || !selected}>
            <Check />
            {createIncome.isPending ? "Saving…" : "Save income"}
          </Button>
          <SavedStatus text={saved} />
        </div>
      </form>
      <MonthSoFar month={month} sources={list} />
    </Card>
  );
}

/** That month's income so far, net, per source. Display-only sums of integer cents. */
function MonthSoFar({ month, sources }: { month: string; sources: Schemas["IncomeSource"][] }) {
  const entries = useMonthIncome(month);
  const heading = `${monthName(month)} so far · net`;
  const row = "flex justify-between gap-3 py-1.5 tabular-nums";

  let body;
  if (entries.isPending) body = <p className="m-0 text-muted-foreground">Loading…</p>;
  else if (entries.isError)
    body = (
      <p className="m-0 text-muted-foreground">
        Couldn’t load this month’s income. {errorMessage(entries.error)}{" "}
        <Button variant="link" className="h-auto p-0" onClick={() => void entries.refetch()}>
          Try again
        </Button>
      </p>
    );
  else if (entries.data.length === 0) body = <p className="m-0 text-muted-foreground">No income logged in {monthName(month)} yet.</p>;
  else {
    const bySource = new Map<string, { n: number; net: number }>();
    for (const e of entries.data) {
      const t = bySource.get(e.income_source_id) ?? { n: 0, net: 0 };
      bySource.set(e.income_source_id, { n: t.n + 1, net: t.net + e.net_cents });
    }
    const total = entries.data.reduce((sum, e) => sum + e.net_cents, 0);
    body = (
      <dl className="m-0">
        {sources
          .filter((s) => bySource.has(s.id))
          .map((s) => {
            const t = bySource.get(s.id)!;
            return (
              <div key={s.id} className={row}>
                <dt className="font-semibold">
                  {s.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {count.format(t.n)} {t.n === 1 ? "entry" : "entries"}
                  </span>
                </dt>
                <dd className="m-0 font-semibold text-income">{formatCents(t.net)}</dd>
              </div>
            );
          })}
        <div className={cn(row, "border-0 border-t border-solid border-border font-bold")}>
          <dt>Total</dt>
          <dd className="m-0 text-income">{formatCents(total)}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-0 border-t border-solid border-border px-5 pt-4 pb-5" aria-labelledby="so-far-h">
      <h3 id="so-far-h" className="eyebrow m-0">
        {heading}
      </h3>
      {body}
    </div>
  );
}
