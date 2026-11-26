import { Check, CircleAlert, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormField } from "@/components/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage, fieldErrors } from "../api";
import { useSession } from "./context";

export const MIN_PASSWORD_LENGTH = 12;

/**
 * The Change password form, shared by the forced full-page screen and the
 * account-menu dialog: current, new and repeat fields with a live checklist.
 * `secondary` is the Cancel or Sign out button, placed beside the submit button.
 */
export function ChangePasswordForm({
  currentLabel,
  secondary,
  onChanged,
}: {
  currentLabel: string;
  secondary: ReactNode;
  onChanged: () => void;
}) {
  const session = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});

  const checks = [
    { ok: next.length >= MIN_PASSWORD_LENGTH, label: `At least ${MIN_PASSWORD_LENGTH} characters` },
    { ok: next.length > 0 && next !== current, label: "Different from your current password" },
    { ok: next.length > 0 && next === repeat, label: "Both new passwords match" },
  ];
  const ready = current !== "" && checks.every((c) => c.ok);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setAlert(null);
    setErrors({});
    try {
      await session.changePassword(current, next);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_credentials") {
        setErrors({ current: "That isn't your current password." });
      } else if (err instanceof ApiError && err.code === "weak_password") {
        setErrors({ next: fieldErrors(err).new_password ?? errorMessage(err) });
      } else {
        setAlert(errorMessage(err));
      }
      setBusy(false);
    }
  }

  const input = (
    key: "current" | "next" | "repeat",
    label: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
    error?: string,
  ) => (
    <FormField label={label} error={error}>
      {(control) => (
        <div className="relative">
          <Input
            {...control}
            className={key === "next" ? "pr-12" : undefined}
            type={show ? "text" : "password"}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
          {key === "next" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1 right-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-[18px]"
              aria-label={show ? "Hide passwords" : "Show passwords"}
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff /> : <Eye />}
            </Button>
          )}
        </div>
      )}
    </FormField>
  );

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(e) => void submit(e)}>
      {alert && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      )}
      {input("current", currentLabel, current, setCurrent, "current-password", errors.current)}
      {input("next", "New password", next, setNext, "new-password", errors.next)}
      {input("repeat", "Repeat new password", repeat, setRepeat, "new-password")}

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-muted-foreground" aria-label="Password requirements">
        {checks.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-2", c.ok && "text-refund-text")}>
            {c.ok ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <span aria-hidden="true" className="mx-px size-3.5 rounded-full border-2 border-current" />
            )}
            {c.label}
            <span className="sr-only">{c.ok ? " (met)" : " (not met)"}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[13px] text-muted-foreground">Changing your password signs you out on your other devices.</p>

      <div className="flex justify-end gap-2.5">
        {secondary}
        <Button type="submit" disabled={!ready || busy}>
          {busy ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
