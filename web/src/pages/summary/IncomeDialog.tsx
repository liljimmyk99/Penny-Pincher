import { Link } from "react-router";
import { errorMessage, useMonthIncome, type Schemas } from "../../api";
import { AlertIcon } from "../../components/icons";
import { formatShortDate, monthName } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
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

type Totals = Schemas["IncomeTotals"];

/**
 * One income source's entries for the month (gross, taxable, net, tax rate)
 * with an "All sources combined" total (web/AGENTS.md "Summary").
 */
export function IncomeDialog({
  month,
  source,
  combined,
  onClose,
}: {
  month: string;
  source: Schemas["MonthlySummary"]["income"]["sources"][number];
  combined: Totals;
  onClose: () => void;
}) {
  const income = useMonthIncome(month);
  const entries = (income.data ?? []).filter((e) => e.income_source_id === source.income_source_id);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(720px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>{source.name}</DialogTitle>
          <DialogDescription>Income entries in {monthName(month)}.</DialogDescription>
        </DialogHeader>
        {income.isPending && <p className="summary__status">Loading entries…</p>}
        {income.isError && (
          <p role="alert" className="alert alert--danger">
            <AlertIcon width={18} height={18} />
            <span>
              Couldn’t load the entries. {errorMessage(income.error)}{" "}
              <button type="button" className="text-btn" onClick={() => void income.refetch()}>
                Try again
              </button>
            </span>
          </p>
        )}
        {income.isSuccess && (
          <div className="summary__scroll">
            <table className="summary-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Label</th>
                  <th scope="col" className="num">Gross</th>
                  <th scope="col" className="num">Taxable</th>
                  <th scope="col" className="num">Net</th>
                  <th scope="col" className="num">Tax rate</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatShortDate(e.date)}</td>
                    <td>{e.note ?? "—"}</td>
                    <td className="num">{formatCents(e.gross_cents)}</td>
                    <td className="num">{formatCents(e.gross_taxable_cents)}</td>
                    <td className="num">{formatCents(e.net_cents)}</td>
                    <td className="num">{formatTaxRate(e.gross_taxable_cents, e.net_cents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <TotalRow label={source.name} totals={source} />
                <TotalRow label="All sources combined" totals={combined} />
              </tfoot>
            </table>
          </div>
        )}
        <DialogFooter>
          <Link className="btn btn--ghost" to={`/transactions?month=${month}`} onClick={onClose}>
            Open in Transactions
          </Link>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TotalRow({ label, totals }: { label: string; totals: Totals }) {
  return (
    <tr>
      <th scope="row" colSpan={2}>
        {label}
      </th>
      <td className="num">{formatCents(totals.gross_cents)}</td>
      <td className="num">{formatCents(totals.gross_taxable_cents)}</td>
      <td className="num">{formatCents(totals.net_cents)}</td>
      <td className="num">{formatTaxRate(totals.gross_taxable_cents, totals.net_cents)}</td>
    </tr>
  );
}
