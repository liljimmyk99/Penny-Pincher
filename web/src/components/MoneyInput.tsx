import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { parseCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "inputMode" | "prefix"> & {
  /** What the user typed, kept as text so "12." or "1,2" can be edited. */
  value: string;
  /** The new text and its value in integer cents (null while it isn't a valid amount). */
  onValueChange: (text: string, cents: number | null) => void;
  /** Shown before the number, hidden from assistive tech: "$" by default, null for none. */
  prefix?: ReactNode;
  /** The prefix's own class (a refund row's "−" takes the refund colour). */
  prefixClassName?: string;
};

/**
 * A money field (#169): the shared Input with a "$" prefix and right-aligned
 * tabular numerals. It works in text and integer cents only: parsing goes through
 * lib/money.ts, never float maths. Seed it with centsToInput(cents).
 * `variant="cell"` is the quiet table-cell look (#175).
 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  prefix = "$",
  prefixClassName,
  variant,
  ...props
}: MoneyInputProps) {
  const hasPrefix = prefix !== null && prefix !== undefined;
  return (
    <div data-slot="money-input" className={cn("relative w-full", className)}>
      {hasPrefix && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 flex items-center text-sm font-semibold text-muted-foreground",
            variant === "cell" ? "left-2" : "left-3",
            prefixClassName,
          )}
        >
          {prefix}
        </span>
      )}
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        variant={variant}
        className={cn("text-right font-semibold tabular-nums", hasPrefix && (variant === "cell" ? "pl-6" : "pl-7"))}
        value={value}
        onChange={(e) => onValueChange(e.target.value, parseCents(e.target.value))}
        {...props}
      />
    </div>
  );
}
