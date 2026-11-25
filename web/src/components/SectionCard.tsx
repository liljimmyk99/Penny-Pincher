import { useId, type ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled section of a screen on Card (#177): a region named by its `h2`
 * (the 18px/600 section title), an optional description and an action on the
 * right of the header (a toggle or a button), then the content.
 */
export function SectionCard({
  title,
  eyebrow,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  /** A small uppercase line above the title (not part of the region's name). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id} className={cn("min-w-0 gap-4 py-5", className)}>
      <CardHeader className="gap-1 px-5">
        <CardTitle>
          {eyebrow && (
            <p className="m-0 mb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{eyebrow}</p>
          )}
          <h2 id={id} className="m-0 [font:inherit]">
            {title}
          </h2>
        </CardTitle>
        {description && <CardDescription className="text-[13px]">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn("min-w-0 px-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
