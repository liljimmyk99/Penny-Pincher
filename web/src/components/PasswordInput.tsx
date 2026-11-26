import { useId, useLayoutEffect, useRef, useState, type ComponentProps, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputProps = Omit<ComponentProps<typeof Input>, "type" | "autoComplete" | "ref">;

export interface PasswordInputProps extends InputProps {
  /** Always set by the caller, so password managers can fill and save the field. */
  autoComplete: "current-password" | "new-password";
  ref?: Ref<HTMLInputElement>;
  /** Controlled visibility, for a form whose one toggle reveals several fields. */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  /** Hide the Show/Hide button (another field in the form holds it). Default true. */
  toggle?: boolean;
  /** What the toggle reveals, read after "Show"/"Hide". Default "password". */
  toggleLabel?: string;
}

/**
 * A password field with a Show/Hide button inside it (#201): a real button with
 * visible text and `aria-pressed`. Showing or hiding keeps focus and the cursor in
 * the field. Spread a `FormField`'s control props onto it like any `Input`.
 */
export function PasswordInput({
  autoComplete,
  ref,
  visible: visibleProp,
  onVisibleChange,
  toggle = true,
  toggleLabel = "password",
  className,
  id,
  ...props
}: PasswordInputProps) {
  const [visibleState, setVisibleState] = useState(false);
  const visible = visibleProp ?? visibleState;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selection = useRef<[number, number] | null>(null);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  // Changing `type` can reset the selection; put the cursor back where it was.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const saved = selection.current;
    selection.current = null;
    if (el && saved && document.activeElement === el) el.setSelectionRange(saved[0], saved[1]);
  }, [visible]);

  function setRef(el: HTMLInputElement | null) {
    inputRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  }

  function flip() {
    const el = inputRef.current;
    if (el && document.activeElement === el && el.selectionStart !== null && el.selectionEnd !== null) {
      selection.current = [el.selectionStart, el.selectionEnd];
    }
    const next = !visible;
    if (visibleProp === undefined) setVisibleState(next);
    onVisibleChange?.(next);
  }

  return (
    <div className="relative">
      <Input
        {...props}
        ref={setRef}
        id={inputId}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        className={cn(toggle && "pr-[4.5rem]", className)}
      />
      {toggle && (
        <Button
          type="button"
          variant="ghost"
          className="absolute top-0 right-0 rounded-l-none px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
          // The name starts with the visible text, so voice control can say "Show" (WCAG 2.5.3).
          aria-label={`${visible ? "Hide" : "Show"} ${toggleLabel}`}
          aria-pressed={visible}
          aria-controls={inputId}
          // Keep focus (and so the cursor) in the field when the button is clicked.
          onMouseDown={(e) => e.preventDefault()}
          onClick={flip}
        >
          {visible ? "Hide" : "Show"}
        </Button>
      )}
    </div>
  );
}
