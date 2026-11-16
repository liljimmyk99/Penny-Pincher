import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useId, useState, type FormEvent } from "react";
import { errorMessage, fieldErrors, useAddUser, useAdminUsers, type Schemas } from "../../api";
import { AlertIcon, CloseIcon, PlusIcon } from "../../components/icons";
import { Toast } from "../../components/Toast";
import { formatDateTime } from "./format";

type Role = Schemas["AdminUser"]["role"];

/**
 * Users tab (root §6.12): the app's users and "Add user". It writes the app's
 * database only; Firebase accounts are created in the Firebase console.
 */
export function UsersSection() {
  const users = useAdminUsers();
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <section className="card admin-backups" aria-labelledby="users-h">
      <div className="admin-backups__head">
        <div>
          <h2 id="users-h">Users</h2>
          <p className="admin__desc">
            People who can sign in to Penny-Pincher. Accounts themselves are created in the Firebase console.
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding(true)}>
          <PlusIcon width={16} height={16} />
          Add user
        </button>
      </div>
      {users.isPending ? (
        <p className="admin__status">Loading users…</p>
      ) : users.isError ? (
        <p className="alert alert--danger admin-backups__alert" role="alert">
          <AlertIcon width={18} height={18} />
          {errorMessage(users.error)}
        </p>
      ) : (
        <div className="admin-backups__scroll">
          <table className="admin-backups__table">
            <caption className="visually-hidden">Users, oldest first</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Added</th>
                <th scope="col">Firebase uid</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <th scope="row">{u.display_name ?? "—"}</th>
                  <td>{u.email ?? "—"}</td>
                  <td>
                    <span className={`admin-users__role admin-users__role--${u.role}`}>
                      {u.role === "admin" ? "Admin" : "Member"}
                    </span>
                  </td>
                  <td>{formatDateTime(u.created_at)}</td>
                  <td>
                    <code className="admin-users__uid">{u.firebase_uid}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <AddUserDialog
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            setToast("User added");
          }}
        />
      )}
      <Toast message={toast} onDismiss={dismissToast} />
    </section>
  );
}

function AddUserDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const uid = useId();
  const add = useAddUser();
  const [firebaseUid, setFirebaseUid] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [alert, setAlert] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    setErrors({});
    if (firebaseUid.trim() === "") {
      setErrors({ firebase_uid: "Paste the Firebase uid." });
      return;
    }
    try {
      await add.mutateAsync({
        firebase_uid: firebaseUid.trim(),
        email: email.trim() === "" ? null : email.trim(),
        display_name: name.trim() === "" ? null : name.trim(),
        role,
      });
      onAdded();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setAlert(errorMessage(err));
    }
  }

  const field = (key: string, label: string, value: string, set: (v: string) => void, extra = "") => (
    <div>
      <label className="field-label" htmlFor={`${uid}-${key}`}>
        {label}
      </label>
      <input
        id={`${uid}-${key}`}
        className="field"
        value={value}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
        onChange={(e) => set(e.target.value)}
      />
      {extra && <p className="admin__desc">{extra}</p>}
      {errors[key] && (
        <p id={`${uid}-${key}-err`} className="admin-users__error">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <Dialog.Root open onOpenChange={(next) => !next && !add.isPending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog" aria-modal="true">
          <div className="dialog__head">
            <div className="dialog__text">
              <Dialog.Title className="dialog__title">Add user</Dialog.Title>
              <Dialog.Description className="dialog__body">
                Create the account in the Firebase console first, then paste its uid. This adds the person to
                Penny-Pincher only; nothing is changed in Firebase.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-btn" aria-label="Close" disabled={add.isPending}>
              <CloseIcon />
            </Dialog.Close>
          </div>
          <form className="admin-users__form" noValidate onSubmit={(e) => void submit(e)}>
            {field("firebase_uid", "Firebase uid", firebaseUid, setFirebaseUid)}
            {field("email", "Email (optional)", email, setEmail)}
            {field("display_name", "Display name (optional)", name, setName)}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
