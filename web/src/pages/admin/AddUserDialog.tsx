import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState, type FormEvent } from "react";
import { ApiError, errorMessage, fieldErrors, useAddUser, type Schemas } from "../../api";
import { AlertIcon, CloseIcon } from "../../components/icons";
import { MIN_PASSWORD_LENGTH } from "../../auth/ChangePasswordForm";
import { PasswordField } from "./PasswordField";
import { SignInDetails } from "./SignInDetails";

type Role = Schemas["AdminUser"]["role"];

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

interface Props {
  onClose: () => void;
  /** Called when the admin is done with the sign-in details. */
  onAdded: () => void;
}

export function AddUserDialog({ onClose, onAdded }: Props) {
  const uid = useId();
  const add = useAddUser();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [alert, setAlert] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ username: string; password: string; mustChange: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    setErrors({});
    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setErrors({ username: "Use 3–32 letters, numbers, dots, dashes or underscores." });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrors({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    try {
      await add.mutateAsync({
        username: trimmed,
        password,
        must_change_password: mustChange,
        email: email.trim() === "" ? null : email.trim(),
        display_name: name.trim() === "" ? null : name.trim(),
        role,
      });
      setCreated({ username: trimmed, password, mustChange });
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "user_exists") {
        setErrors({ username: errorMessage(err) });
      } else if (err instanceof ApiError && err.code === "weak_password") {
        setErrors({ password: fieldErrors(err).password ?? errorMessage(err) });
      } else {
        const fields = fieldErrors(err);
        if (Object.keys(fields).length > 0) setErrors(fields);
        else setAlert(errorMessage(err));
      }
    }
  }

  const field = (key: string, label: string, value: string, set: (v: string) => void, hint = "") => (
    <div>
      <label className="field-label" htmlFor={`${uid}-${key}`}>
        {label}
      </label>
      <input
        id={`${uid}-${key}`}
        className={`field${key === "username" ? " admin-users__mono" : ""}`}
        value={value}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
        onChange={(e) => set(e.target.value)}
      />
      {hint && <p className="admin__desc">{hint}</p>}
      {errors[key] && (
        <p id={`${uid}-${key}-err`} className="admin-users__error">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <Dialog.Root open onOpenChange={(next) => !next && !add.isPending && (created ? onAdded() : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog" aria-modal="true">
          {created ? (
            <SignInDetails
              title="Sign-in details"
              message="User added. Pass these details on."
              {...created}
              onDone={onAdded}
            />
          ) : (
            <>
              <div className="dialog__head">
                <div className="dialog__text">
                  <Dialog.Title className="dialog__title">Add user</Dialog.Title>
                  <Dialog.Description className="dialog__body">
                    Set their username and an initial password, then pass them on. There is no email.
                  </Dialog.Description>
                </div>
                <Dialog.Close className="icon-btn" aria-label="Close" disabled={add.isPending}>
                  <CloseIcon />
                </Dialog.Close>
              </div>
              <form className="admin-users__form" noValidate onSubmit={(e) => void submit(e)}>
                {field("username", "Username", username, setUsername, "3–32 letters, numbers, dots, dashes or underscores.")}
                {field("display_name", "Display name (optional)", name, setName)}
                {field("email", "Email (optional)", email, setEmail)}
                <div>
                  <label className="field-label" htmlFor={`${uid}-role`}>
                    Role
                  </label>
                  <select
                    id={`${uid}-role`}
                    className="field"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <PasswordField label="Initial password" value={password} onChange={setPassword} error={errors.password} />
                <label className="admin-users__check">
                  <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
                  Ask them to choose their own password
                </label>
                {alert && (
                  <p className="alert alert--danger" role="alert">
                    <AlertIcon width={18} height={18} />
                    {alert}
                  </p>
                )}
                <div className="dialog__actions">
                  <button type="button" className="btn btn--ghost" disabled={add.isPending} onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={add.isPending}>
                    {add.isPending ? "Adding…" : "Add user"}
                  </button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
