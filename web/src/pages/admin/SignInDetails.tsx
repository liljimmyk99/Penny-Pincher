import { useState } from "react";
import { Check, Copy } from "lucide-react";
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
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        <dt className="text-muted-foreground">Username</dt>
        <dd className="m-0 font-mono break-all">{username}</dd>
        <dt className="text-muted-foreground">Password</dt>
        <dd className="m-0 font-mono break-all">{password}</dd>
        {mustChange && (
          <>
            <dt className="text-muted-foreground">Next sign-in</dt>
            <dd className="m-0">They choose a new password</dd>
          </>
        )}
      </dl>
      <p className="m-0 text-[13px] text-muted-foreground">This is the only time the password is shown. Pass it on now; there is no email.</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy sign-in details"}
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
