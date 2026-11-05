import "./Brand.css";

/** The orange "P" mark plus the wordmark. Sits on the dark sidebar colour. */
export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`brand brand--${size}`}>
      <span className="brand__mark" aria-hidden="true">
        P
      </span>
      <span className="brand__name">Penny Pincher</span>
    </div>
  );
}
