import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router";
import { errorMessage, useMonthIncome, type Schemas } from "../../api";
import { AlertIcon, CloseIcon } from "../../components/icons";
import { formatShortDate, monthName } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";

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
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog income-dialog" aria-modal="true">
          <div className="income-dialog__head">
            <div className="dialog__text">
              <Dialog.Title className="dialog__title">{source.name}</Dialog.Title>
              <Dialog.Description className="dialog__body">Income entries in {monthName(month)}.</Dialog.Description>
            </div>
            <Dialog.Close className="icon-btn" aria-label="Close">
              <CloseIcon />
            </Dialog.Close>
          </div>
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
          <div className="dialog__actions">
            <Link className="btn btn--ghost" to={`/transactions?month=${month}`} onClick={onClose}>
              Open in Transactions
            </Link>
            <Dialog.Close className="btn btn--primary">Done</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
