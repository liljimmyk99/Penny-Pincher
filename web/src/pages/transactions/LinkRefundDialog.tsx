import { useId, useState, type FormEvent } from "react";
import { errorMessage, useEntryMutations, useExpensesBetween, type Schemas } from "../../api";
import { SearchIcon } from "lucide-react";
import { ErrorAlert, LoadError } from "../../components/LoadError";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import { addDays, formatShortDate, monthName, monthOf } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { suggestOriginal } from "./refunds";
import { matchesSearch } from "./totals";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

/** How far back the dialog looks for the original purchase. */
export const LINK_WINDOW_DAYS = 90;
/** Status lines and the note under the list. */
const note = "m-0 text-[13px] text-muted-foreground";
/** Most candidates listed at once; searching narrows the rest. */
const SHOWN = 50;

interface Props {
  refund: Schemas["Expense"];
  categoryName: (id: string) => string;
  onClose: () => void;
  onLinked: (original: Schemas["Expense"]) => void;
}

/**
 * "Link…" on an unlinked refund (web/AGENTS.md "Refunds"): searches expenses
 * from the 90 days up to the refund's date, preselects a Suggested match, and
 * sets `refunded_expense_id` on confirm. Linking is optional.
 */
export function LinkRefundDialog({ refund, categoryName, onClose, onLinked }: Props) {
  const uid = useId();
  const candidates = useExpensesBetween(addDays(refund.date, -LINK_WINDOW_DAYS), refund.date);
  const { updateExpense } = useEntryMutations();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const pending = updateExpense.isPending;

  const all = (candidates.data ?? []).filter((c) => c.id !== refund.id);
  const suggested = suggestOriginal(refund, all);
  const selected = chosen ?? suggested?.id ?? null;
  const matching = all.filter((c) => matchesSearch(c, query));
  const ordered =
    suggested && matching.includes(suggested) ? [suggested, ...matching.filter((c) => c !== suggested)] : matching;
  const shown = ordered.slice(0, SHOWN);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const original = all.find((c) => c.id === selected);
    if (!original) {
      setAlert("Choose the expense this refund is for.");
      return;
    }
    setAlert(null);
    const body: Schemas["ExpenseUpdate"] = { refunded_expense_id: original.id };
    // Any edit confirms an entry; linking alone shouldn't.
    if (!refund.confirmed) body.confirmed = false;
    try {
      await updateExpense.mutateAsync({ id: refund.id, body });
      onLinked(original);
    } catch (err) {
      setAlert(`Not linked. ${errorMessage(err)}`);
    }
  }

  const describe = [
    refund.merchant.name,
    formatShortDate(refund.date),
    formatCents(refund.amount_cents),
    categoryName(refund.category_id),
    refund.note,
  ]
    .filter(Boolean)
    .join(" · ");

  let list;
  if (candidates.isPending) list = <p className={note}>Loading expenses…</p>;
  else if (candidates.isError)
    list = <LoadError what="expenses" error={candidates.error} retry={() => void candidates.refetch()} />;
  else if (all.length === 0)
    list = <p className={note}>No expenses in the {LINK_WINDOW_DAYS} days before this refund.</p>;
  else if (shown.length === 0) list = <p className={note}>No expenses match “{query.trim()}”.</p>;
  else
    list = (
      <div role="radiogroup" aria-label="Expense to link" className="flex max-h-80 flex-col gap-2 overflow-y-auto p-0.5">
        {shown.map((c) => {
          const on = c.id === selected;
          const net = c.amount_cents + c.refunded_total_cents;
          const meta = [formatShortDate(c.date), categoryName(c.category_id), c.note].filter(Boolean).join(" · ");
          return (
            <label
              key={c.id}
              data-state={on ? "checked" : "unchecked"}
              className={cn(
                "grid min-h-15 cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border border-solid border-border bg-card px-3.5 py-2.5 hover:bg-muted",
                "has-focus-visible:ring-[3px] has-focus-visible:ring-ring/35",
                on && "border-ring bg-selected text-selected-foreground shadow-[inset_0_0_0_1px_var(--color-ring)] hover:bg-selected",
              )}
            >
              <input
                type="radio"
                name={`${uid}-original`}
                value={c.id}
                checked={on}
                onChange={() => setChosen(c.id)}
                className="m-0 size-[18px] accent-primary"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="font-semibold">{c.merchant.name}</strong>
                  {c === suggested && <Badge variant="selected">Suggested</Badge>}
                </span>
                <span className={cn("truncate text-[13px]", on ? "text-selected-foreground" : "text-muted-foreground")}>
                  {meta}
                  {c.refunded_total_cents !== 0 && ` · net ${formatCents(net)}`}
                </span>
              </span>
              <span className="font-bold tabular-nums">{formatCents(c.amount_cents)}</span>
            </label>
          );
        })}
      </div>
    );

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Link refund to an expense</DialogTitle>
          <DialogDescription>{describe}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" noValidate onSubmit={(e) => void submit(e)}>
          <label className="relative block">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search expenses</span>
            <Input
              type="search"
              className="pl-9"
              placeholder={`Search expenses from the last ${LINK_WINDOW_DAYS} days`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {list}
          {ordered.length > SHOWN && (
            <p className={note}>
              Showing {SHOWN} of {ordered.length}. Search to narrow the list.
            </p>
          )}
          <p className={note}>
            Linking is optional. An unlinked refund still lowers {categoryName(refund.category_id)} spending for{" "}
            {monthName(monthOf(refund.date))}.
          </p>
          {alert && <ErrorAlert>{alert}</ErrorAlert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !selected}>
              {pending ? "Linking…" : "Link refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
