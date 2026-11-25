import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { parseCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "inputMode"> & {
  /** What the user typed, kept as text so "12." or "1,2" can be edited. */
  value: string;
  /** The new text and its value in integer cents (null while it isn't a valid amount). */
  onValueChange: (text: string, cents: number | null) => void;
};

/**
 * A money field (#169): the shared Input with a "$" prefix and right-aligned
 * tabular numerals. It works in text and integer cents only: parsing goes through
 * lib/money.ts, never float maths. Seed it with centsToInput(cents).
 */
export function MoneyInput({ value, onValueChange, className, ...props }: MoneyInputProps) {
  return (
    <div data-slot="money-input" className={cn("relative w-full", className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-muted-foreground"
      >
        $
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        className="pl-7 text-right font-semibold tabular-nums"
        value={value}
        onChange={(e) => onValueChange(e.target.value, parseCents(e.target.value))}
        {...props}
      />
    </div>
  );
}
