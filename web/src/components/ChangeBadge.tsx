import { Badge } from "@/components/ui/badge";
import { describeChange, type ChangeTone } from "@/lib/change";

const variant = { worse: "worse", better: "better", none: "unchanged" } as const;

/**
 * A change indicator (web/AGENTS.md "Change indicators") on the Badge change
 * variants: `text` is what is shown (arrow and sign included), `words` what a
 * screen reader hears instead ("Worse: +$12.00 vs. last month").
 */
export function ChangeText({ tone, text, words }: { tone: ChangeTone; text: string; words?: string }) {
  return (
    <Badge variant={variant[tone]} title={words}>
      {words ? (
        <>
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{words}</span>
        </>
      ) : (
        text
      )}
    </Badge>
  );
}

/** "▲ +$12.00 (+10%)" in orange (worse) or blue (better); Saving flips. "No change" when equal. */
export function ChangeBadge({
  current,
  previous,
  saving = false,
  suffix = "vs. last month",
}: {
  current: number;
  previous: number;
  saving?: boolean;
  suffix?: string;
}) {
  const c = describeChange(current, previous, saving);
  if (c.tone === "none") return <ChangeText tone="none" text={`No change ${suffix}`.trim()} />;
  const figures = `${c.amount}${c.percent ? ` (${c.percent})` : ""}`;
  return (
    <ChangeText
      tone={c.tone}
      text={`${c.arrow} ${figures}`}
      words={`${c.tone === "worse" ? "Worse" : "Better"}: ${figures} ${suffix}`.trim()}
    />
  );
}
