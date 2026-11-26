import { useId, type ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled section of a screen on Card (#177): a region named by its `h2`
 * (the 18px/600 section title), an optional description and an action on the
 * right of the header (a toggle or a button), then the content.
 *
 * `flush` (#176) drops the content's side padding and stacks it 16px apart, so a
 * Table runs edge to edge; pad anything else in it with `px-5`.
 */
export function SectionCard({
  id: givenId,
  flush = false,
  title,
  eyebrow,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  /** Id of the heading, when something else refers to it; generated otherwise. */
  id?: string;
  /** Edge-to-edge content (tables), stacked 16px apart. */
  flush?: boolean;
  title: ReactNode;
  /** A small uppercase line above the title (not part of the region's name). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const generatedId = useId();
  const id = givenId ?? generatedId;
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
      <CardContent className={cn("min-w-0 px-5", flush && "flex flex-col gap-4 px-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
