import { Check } from "lucide-react";
/**
 * The "Saved …" line: always in the page as a polite status, empty until something
 * saves. It is never display:none while empty, so screen readers keep the live
 * region and announce the text when it arrives.
 */
export function SavedStatus({ text }: { text: string | null }) {
  return (
    <div
      role="status"
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success-alert-foreground"
    >
      {text && (
        <>
          <Check className="size-4" aria-hidden="true" />
          {text}
        </>
      )}
    </div>
  );
}
