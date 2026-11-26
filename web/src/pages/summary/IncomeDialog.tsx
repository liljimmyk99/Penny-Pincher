import { Link } from "react-router";
import { errorMessage, useMonthIncome, type Schemas } from "../../api";
import { formatShortDate, monthName } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { formatTaxRate } from "../../lib/taxRate";
import { LoadError } from "@/components/LoadError";
import { Button } from "@/components/ui/button";
import { LoadingSection } from "@/components/LoadingSection";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        {income.isPending && <LoadingSection label="entries" rows={2} />}
        {income.isError && (
          <LoadError message={`Couldn’t load the entries. ${errorMessage(income.error)}`} onRetry={() => void income.refetch()} />
        )}
        {income.isSuccess && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Label</TableHead>
                <TableHead scope="col" numeric>Gross</TableHead>
                <TableHead scope="col" numeric>Taxable</TableHead>
                <TableHead scope="col" numeric>Net</TableHead>
                <TableHead scope="col" numeric>Tax rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatShortDate(e.date)}</TableCell>
                  <TableCell>{e.note ?? "—"}</TableCell>
                  <TableCell numeric>{formatCents(e.gross_cents)}</TableCell>
                  <TableCell numeric>{formatCents(e.gross_taxable_cents)}</TableCell>
                  <TableCell numeric>{formatCents(e.net_cents)}</TableCell>
                  <TableCell numeric>{formatTaxRate(e.gross_taxable_cents, e.net_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TotalRow label={source.name} totals={source} />
              <TotalRow label="All sources combined" totals={combined} />
            </TableFooter>
          </Table>
        )}
        <DialogFooter>
          <Button asChild variant="outline">
            <Link to={`/transactions?month=${month}`} onClick={onClose}>
              Open in Transactions
            </Link>
          </Button>
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
    <TableRow>
      <TableHead scope="row" colSpan={2} className="text-foreground">
        {label}
      </TableHead>
      <TableCell numeric>{formatCents(totals.gross_cents)}</TableCell>
      <TableCell numeric>{formatCents(totals.gross_taxable_cents)}</TableCell>
      <TableCell numeric>{formatCents(totals.net_cents)}</TableCell>
      <TableCell numeric>{formatTaxRate(totals.gross_taxable_cents, totals.net_cents)}</TableCell>
    </TableRow>
  );
}
