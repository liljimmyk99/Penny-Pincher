import { useId } from "react";
import { MIN_PASSWORD_LENGTH } from "../../auth/ChangePasswordForm";
import { generatePassword } from "./generatePassword";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** A visible, monospace password field with a Generate button, for admins setting a password for someone else. */
export function PasswordField({ label, value, onChange, error }: Props) {
  const id = useId();
  const hint = `${id}-hint`;
  const err = `${id}-err`;
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="admin-users__pw">
        <input
          id={id}
          className="field admin-users__mono"
          value={value}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hint} ${err}` : hint}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn btn--ghost" onClick={() => onChange(generatePassword())}>
          Generate
        </button>
      </div>
      <p id={hint} className="admin__desc">
        At least {MIN_PASSWORD_LENGTH} characters.
      </p>
      {error && (
        <p id={err} className="admin-users__error">
          {error}
        </p>
      )}
    </div>
  );
}
