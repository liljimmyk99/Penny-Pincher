import { CircleAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormField } from "@/components/FormField";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { newPasswordRules } from "@/lib/password";
import { ApiError, errorMessage, fieldErrors } from "../api";
import { useSession } from "./context";

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

  const checks = newPasswordRules({ next, current, repeat });
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
    autoComplete: "current-password" | "new-password",
    error?: string,
  ) => (
    <FormField label={label} error={error}>
      {(control) => (
        <PasswordInput
          {...control}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => set(e.target.value)}
          // One toggle, on New password, shows or hides all three fields.
          visible={show}
          onVisibleChange={setShow}
          toggle={key === "next"}
          toggleLabel="passwords"
        />
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

      <PasswordRequirements rules={checks} />
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
