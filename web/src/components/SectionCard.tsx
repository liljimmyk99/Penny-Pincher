import type { ReactNode } from "react";
import { CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A screen section on the shadcn Card (#176): an `h2` title (the 18px/600
 * section title) labelling the section, an optional description and header
 * action, then the body. Tables inside run edge to edge; pad other content with
 * `px-6`, as CardContent does.
 */
export function SectionCard({
  id,
  title,
  description,
  action,
  className,
  headerClassName,
  children,
}: {
  /** Id of the heading; the section is labelled by it. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Controls at the end of the header (a search field, say). */
  action?: ReactNode;
  className?: string;
  headerClassName?: string;
  children: ReactNode;
}) {
  return (
    // A <section> drawn as the Card (same classes as ui/card), so it is a named region.
    <section
      data-slot="card"
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card py-5 text-card-foreground",
        className,
      )}
    >
      <CardHeader className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", headerClassName)}>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="m-0 text-lg leading-tight font-semibold">
            {title}
          </h2>
          {description && <CardDescription className="max-w-[640px] text-[13px]">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      {children}
    </section>
  );
}
