import { useState } from "react";
import { Link } from "react-router";
import { useTemplates } from "../../api";
import { Check } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const HIDDEN_KEY = "penny.welcome.hidden";
const CHECKED_KEY = "penny.welcome.categoriesChecked";

/** Per-viewer conveniences only; the card still works if storage is unavailable. */
function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function write(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

/**
 * The new-account welcome card (web/AGENTS.md "Empty states → New account"):
 * a 3-step checklist with progress, which can be hidden. Steps: check categories
 * & sources, build a template month, log the first entry.
 */
export function Welcome({ hasEntries }: { hasEntries: boolean }) {
  const templates = useTemplates();
  const [hidden, setHidden] = useState(() => read(HIDDEN_KEY));
  const [categoriesChecked, setCategoriesChecked] = useState(() => read(CHECKED_KEY));
  if (hidden || !templates.data) return null;

  const steps = [
    { done: categoriesChecked, label: "Check your categories & sources", to: "/categories", onGo: () => { write(CHECKED_KEY); setCategoriesChecked(true); } },
    { done: templates.data.some((t) => t.expense_item_count + t.income_item_count > 0), label: "Build a template month", to: "/templates" },
    { done: hasEntries, label: "Log your first entry", to: "/add" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <SectionCard
      eyebrow="Welcome"
      title="Let’s get you set up"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            write(HIDDEN_KEY);
            setHidden(true);
          }}
        >
          Hide
        </Button>
      }
      contentClassName="flex flex-col gap-3"
    >
      <Progress
        value={percent}
        aria-label="Setup progress"
        getValueLabel={() => `${doneCount} of ${steps.length} steps done`}
      />
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3" data-done={s.done || undefined}>
            <span
              className={cn(
                "inline-flex size-[22px] items-center justify-center rounded-full border-2 border-solid border-input",
                s.done && "border-income bg-income text-card",
              )}
              aria-hidden="true"
            >
              {s.done && <Check className="size-3.5" />}
            </span>
            <Link to={s.to} onClick={s.onGo} className={cn("text-link hover:text-link-hover", s.done && "text-muted-foreground line-through")}>
              {s.label}
            </Link>
            {s.done && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
      <p className="m-0 text-[13px] text-muted-foreground">Yearly and Trends fill in as you log months.</p>
    </SectionCard>
  );
}
