import { useState } from "react";
import { CheckIcon, CopyIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";

interface Props {
  title: string;
  message: string;
  username: string;
  password: string;
  mustChange: boolean;
  onDone: () => void;
}

/** Shown once after adding a user or resetting a password; the password is never fetched again. */
export function SignInDetails({ title, message, username, password, mustChange, onDone }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `Username: ${username}\nPassword: ${password}${mustChange ? "\nThey choose a new password at first sign-in." : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <dl className="admin-users__details">
        <dt>Username</dt>
        <dd className="admin-users__mono">{username}</dd>
        <dt>Password</dt>
        <dd className="admin-users__mono">{password}</dd>
        {mustChange && (
          <>
            <dt>Next sign-in</dt>
            <dd>They choose a new password</dd>
          </>
        )}
      </dl>
      <p className="admin__desc">This is the only time the password is shown. Pass it on now; there is no email.</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}
          {copied ? "Copied" : "Copy sign-in details"}
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
