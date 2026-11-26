import { Check } from "lucide-react";
import type { PasswordRule } from "@/lib/password";
import { cn } from "@/lib/utils";

/**
 * The live checklist under a new password (#201). Each rule shows ✓ or ○ plus
 * its text and a "(met)" / "(not met)" status for screen readers, so it never
 * relies on colour; changes are announced politely. Rules come from
 * `newPasswordRules` in `lib/password`.
 */
export function PasswordRequirements({ rules, className }: { rules: PasswordRule[]; className?: string }) {
  return (
    <ul
      aria-label="Password requirements"
      aria-live="polite"
      className={cn("m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-muted-foreground", className)}
    >
      {rules.map((rule) => (
        <li key={rule.label} className={cn("flex items-center gap-2", rule.ok && "text-refund-text")}>
          {rule.ok ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <span aria-hidden="true" className="mx-px size-3.5 rounded-full border-2 border-current" />
          )}
          {rule.label}
          <span className="sr-only">{rule.ok ? " (met)" : " (not met)"}</span>
        </li>
      ))}
    </ul>
  );
}
