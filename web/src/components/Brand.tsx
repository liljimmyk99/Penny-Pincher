import { cn } from "@/lib/utils";

const sizes = {
  sm: { root: "min-w-0 gap-2", mark: "size-[30px] flex-none rounded-md text-base", name: "truncate text-base" },
  md: { root: "gap-3", mark: "size-[38px] rounded-md text-xl", name: "text-xl tracking-[-0.01em]" },
  lg: { root: "gap-3.5", mark: "size-14 rounded-xl text-[30px]", name: "text-[30px] tracking-[-0.02em]" },
} as const;

/**
 * The orange "P" mark plus the wordmark. Sits on the dark sidebar colour.
 * `hideName` keeps the wordmark for screen readers only (the collapsed rail).
 */
export function Brand({ size = "md", hideName = false }: { size?: keyof typeof sizes; hideName?: boolean }) {
  const s = sizes[size];
  return (
    <div data-slot="brand" className={cn("flex items-center text-sidebar-foreground", s.root)}>
      <span
        aria-hidden="true"
        className={cn("flex items-center justify-center bg-brand font-extrabold text-on-brand", s.mark)}
      >
        P
      </span>
      <span className={cn("font-extrabold", s.name, hideName && "sr-only")}>Penny Pincher</span>
    </div>
  );
}
