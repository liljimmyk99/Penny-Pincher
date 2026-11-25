import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, errorMessage, fieldErrors } from "../api";
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon } from "../components/icons";
import { useSession } from "./context";
import "./ChangePasswordForm.css";

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
  const ids = useId();
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
    <div className="signin__field">
      <label className="field-label" htmlFor={`${ids}-${key}`}>
        {label}
      </label>
      <div className="signin__password">
        <input
          id={`${ids}-${key}`}
          className="field"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ids}-${key}-err` : undefined}
        />
        {key === "next" && (
          <button
            type="button"
            className="signin__toggle"
            aria-label={show ? "Hide passwords" : "Show passwords"}
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${ids}-${key}-err`} className="pw-form__error">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <form className="pw-form" noValidate onSubmit={(e) => void submit(e)}>
      {alert && (
        <div className="alert alert--danger" role="alert">
          <AlertIcon />
          <span>{alert}</span>
        </div>
      )}
      {input("current", currentLabel, current, setCurrent, "current-password", errors.current)}
      {input("next", "New password", next, setNext, "new-password", errors.next)}
      {input("repeat", "Repeat new password", repeat, setRepeat, "new-password")}

      <ul className="pw-form__checks" aria-label="Password requirements">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "is-met" : undefined}>
            {c.ok ? <CheckIcon width={16} height={16} /> : <span className="pw-form__dot" aria-hidden="true" />}
            {c.label}
            <span className="sr-only">{c.ok ? " (met)" : " (not met)"}</span>
          </li>
        ))}
      </ul>
      <p className="pw-form__note">Changing your password signs you out on your other devices.</p>

      <div className="pw-form__actions">
        {secondary}
        <button type="submit" className="btn btn--primary" disabled={!ready || busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
