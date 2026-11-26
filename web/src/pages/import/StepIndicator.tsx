import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Get template", "Upload", "Review", "Import"];

/** Where the user is: 0 = Get template … 3 = Import. Done steps get a check, the current one a blue ring. */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Import steps">
      {STEPS.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={label}
            data-state={done ? "done" : now ? "current" : "todo"}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2.5 rounded-full border border-solid border-border bg-card py-0 pr-3.5 pl-1.5 text-sm font-semibold text-muted-foreground",
              (done || now) && "text-foreground",
              now && "border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-secondary-foreground",
                done && "bg-success-alert text-success-alert-foreground",
                now && "bg-primary text-primary-foreground",
              )}
            >
              {done ? <Check className="size-[15px]" /> : i + 1}
            </span>
            {label}
            {done && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}
