import { useState } from "react";
import { errorMessage, useAdminUsers, type Schemas } from "../../api";
import { AlertIcon, PlusIcon } from "../../components/icons";
import { toast } from "../../lib/toast";
import { AddUserDialog } from "./AddUserDialog";
import { formatDateTime } from "./format";
import { ResetPasswordDialog } from "./ResetPasswordDialog";

/**
 * Users tab (root §6.12): the app's users and "Add user" with an initial password.
 */
export function UsersSection() {
  const users = useAdminUsers();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Schemas["AdminUser"] | null>(null);

  return (
    <section className="card admin-backups" aria-labelledby="users-h">
      <div className="admin-backups__head">
        <div>
          <h2 id="users-h">Users</h2>
          <p className="admin__desc">
            People who can sign in to Penny-Pincher. Add someone with a username and an initial password.
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
                <th scope="col">Username</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Added</th>
                <th scope="col">Password</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <th scope="row">{u.display_name ?? "—"}</th>
                  <td className="admin-users__mono">{u.username}</td>
                  <td>{u.email ?? "—"}</td>
                  <td>
                    <span className={`admin-users__role admin-users__role--${u.role}`}>
                      {u.role === "admin" ? "Admin" : "Member"}
                    </span>
                  </td>
                  <td>{formatDateTime(u.created_at)}</td>
                  <td>
                    <span className={`badge${u.must_change_password ? " admin-users__pill" : ""}`}>
                      {u.must_change_password ? "Must change at sign-in" : "Set by user"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Reset password for ${u.username}`}
                      onClick={() => setResetting(u)}
                    >
                      Reset password
                    </button>
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
            toast("User added");
          }}
        />
      )}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </section>
  );
}
