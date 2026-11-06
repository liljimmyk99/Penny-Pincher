import type { ReactNode } from "react";
import { donutGradient, type DonutSlice } from "../pages/summary/summary";
import "./charts.css";

/** A donut drawn with CSS `conic-gradient` (an approved chart type); the legend beside it is its text alternative. */
export function Donut({
  slices,
  centre,
  label,
}: {
  slices: DonutSlice[];
  /** Shown in the hole, e.g. the total. */
  centre: ReactNode;
  label: string;
}) {
  return (
    <div className="donut" role="img" aria-label={label} style={{ background: donutGradient(slices) }}>
      <div className="donut__hole">{centre}</div>
    </div>
  );
}
