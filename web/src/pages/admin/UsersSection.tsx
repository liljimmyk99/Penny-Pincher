import { useState } from "react";
import { errorMessage, useAdminUsers, type Schemas } from "../../api";
import { Plus } from "lucide-react";
import { LoadError } from "@/components/LoadError";
import { SectionCard } from "@/components/SectionCard";
import { StatusLine } from "@/components/StatusLine";
import { edgeColumns } from "@/components/tableStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
    <SectionCard
      title="Users"
      description="People who can sign in to Penny-Pincher. Add someone with a username and an initial password."
      action={
        <Button type="button" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add user
        </Button>
      }
      flush
    >
      {users.isPending ? (
        <StatusLine inset>Loading users…</StatusLine>
      ) : users.isError ? (
        <div className="px-5">
          <LoadError message={errorMessage(users.error)} onRetry={() => void users.refetch()} />
        </div>
      ) : (
        <Table className={cn("min-w-[760px]", edgeColumns)}>
          <TableCaption className="sr-only">Users, oldest first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Username</TableHead>
              <TableHead scope="col">Email</TableHead>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col">Added</TableHead>
              <TableHead scope="col">Password</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data.map((u) => (
              <TableRow key={u.id}>
                <TableHead scope="row" className="font-semibold text-foreground">
                  {u.display_name ?? "—"}
                </TableHead>
                <TableCell className="font-mono text-[13px]">{u.username}</TableCell>
                <TableCell>{u.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "selected" : "secondary"}>
                    {u.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{formatDateTime(u.created_at)}</TableCell>
                <TableCell>
                  {u.must_change_password ? (
                    <Badge variant="unconfirmed">Must change at sign-in</Badge>
                  ) : (
                    <span className="text-muted-foreground">Set by user</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Reset password for ${u.username}`}
                    onClick={() => setResetting(u)}
                  >
                    Reset password
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </SectionCard>
  );
}
