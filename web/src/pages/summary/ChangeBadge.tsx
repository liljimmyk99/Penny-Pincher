import { describeChange } from "../../lib/change";

/** "▲ +$12.00 (+10%)" in orange (worse) or blue (better); Saving flips. Nothing when there is no change. */
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
  if (c.tone === "none") return <span className="change change--none">No change {suffix}</span>;
  const text = `${c.arrow} ${c.amount}${c.percent ? ` (${c.percent})` : ""}`;
  const words = `${c.tone === "worse" ? "Worse" : "Better"}: ${c.amount}${c.percent ? ` (${c.percent})` : ""} ${suffix}`;
  return (
    <span className={`change change--${c.tone}`} title={words}>
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{words}</span>
    </span>
  );
}
