import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const toneClass = {
  default: "text-foreground",
  income: "text-income",
  saving: "text-saving",
  refund: "text-refund-text",
  muted: "text-muted-foreground",
} as const;

export type StatTileTone = keyof typeof toneClass;

type StatTileProps = {
  /** What the figure is ("Net income"); shown as a small uppercase label. */
  label: ReactNode;
  /** The figure, already formatted (money through the shared formatter). */
  value: ReactNode;
  /** Optional line under the figure, such as a change or a note. */
  sub?: ReactNode;
  /** Colour of the figure; `muted` for an empty month. */
  tone?: StatTileTone;
  className?: string;
};

/**
 * A summary tile (#170): a Card with a label, a 26px/700 figure in tabular
 * numerals and optional sub-text. Replaces the old `.tile` markup.
 */
export function StatTile({ label, value, sub, tone = "default", className }: StatTileProps) {
  return (
    <Card data-slot="stat-tile" data-tone={tone} className={cn("min-w-[200px] flex-1 gap-1.5 px-5 py-[18px]", className)}>
      <p className="m-0 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("m-0 text-[26px] leading-tight font-bold tracking-[-0.02em] tabular-nums", toneClass[tone])}>{value}</p>
      {sub != null && <p className="m-0 text-[13px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}
