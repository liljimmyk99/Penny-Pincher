import { cn } from "@/lib/utils";
import "./Brand.css";

/**
 * The orange "P" mark plus the wordmark. Sits on the dark sidebar colour.
 * `hideName` keeps the wordmark for screen readers only (the collapsed rail).
 */
export function Brand({ size = "md", hideName = false }: { size?: "sm" | "md" | "lg"; hideName?: boolean }) {
  return (
    <div className={`brand brand--${size}`}>
      <span className="brand__mark" aria-hidden="true">
        P
      </span>
      <span className={cn("brand__name", hideName && "sr-only")}>Penny Pincher</span>
    </div>
  );
}
