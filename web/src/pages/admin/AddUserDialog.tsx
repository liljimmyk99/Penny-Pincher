import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, errorMessage, fieldErrors, useAddUser, type Schemas } from "../../api";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MIN_PASSWORD_LENGTH } from "../../auth/ChangePasswordForm";
import { MustChangeCheckbox, PasswordField } from "./PasswordField";
import { SignInDetails } from "./SignInDetails";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

type Role = Schemas["AdminUser"]["role"];

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

interface Props {
  onClose: () => void;
  /** Called when the admin is done with the sign-in details. */
  onAdded: () => void;
}

export function AddUserDialog({ onClose, onAdded }: Props) {
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

  const field = (key: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <FormField label={label} description={hint} error={errors[key]}>
      {(control) => (
        <Input
          {...control}
          className={key === "username" ? "font-mono" : undefined}
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </FormField>
  );

  return (
    <Dialog open onOpenChange={(next) => !next && !add.isPending && (created ? onAdded() : onClose())}>
      <DialogContent>
        {created ? (
          <SignInDetails
            title="Sign-in details"
            message="User added. Pass these details on."
            {...created}
            onDone={onAdded}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Set their username and an initial password, then pass them on. There is no email.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" noValidate onSubmit={(e) => void submit(e)}>
              {field("username", "Username", username, setUsername, "3–32 letters, numbers, dots, dashes or underscores.")}
              {field("display_name", "Display name (optional)", name, setName)}
              {field("email", "Email (optional)", email, setEmail)}
              <FormField label="Role">
                {(control) => (
                  <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                    <SelectTrigger {...control} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <PasswordField label="Initial password" value={password} onChange={setPassword} error={errors.password} />
              <MustChangeCheckbox checked={mustChange} onChange={setMustChange} />
              {alert && (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>{alert}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={add.isPending} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={add.isPending}>
                  {add.isPending ? "Adding…" : "Add user"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
