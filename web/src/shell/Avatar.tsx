import "./Avatar.css";

/** A round initial for the signed-in user. Decorative: the name is always shown or labelled next to it. */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initial = name.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "?";
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {initial}
    </span>
  );
}
