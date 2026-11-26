import { Badge } from "@/components/ui/badge";

/**
 * "Unconfirmed · from template" (#176): a template copy the user hasn't checked
 * yet. The brand-orange dot is decorative; the text says the same.
 */
export function UnconfirmedBadge({ children = "Unconfirmed · from template" }: { children?: string }) {
  return (
    <Badge variant="unconfirmed">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
      {children}
    </Badge>
  );
}
