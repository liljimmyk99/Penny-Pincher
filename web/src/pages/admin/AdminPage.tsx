import { Download } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LoadError } from "@/components/LoadError";
import { SectionCard } from "@/components/SectionCard";
import { StatusLine } from "@/components/StatusLine";
import { edgeColumns } from "@/components/tableStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  useAdminStatus,
  useBackups,
  useDownloadBackup,
  useStartBackup,
  type Schemas,
} from "../../api";
import { toast } from "../../lib/toast";
import { Page } from "../Page";
import { UsersSection } from "./UsersSection";
import { formatBytes, formatDateTime, formatUptime } from "./format";

const KIND_LABEL: Record<Schemas["Backup"]["kind"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  manual: "Manual",
};

const STATUS_BADGE = {
  succeeded: "income",
  failed: "destructive",
  running: "secondary",
} as const satisfies Record<Schemas["Backup"]["status"], string>;

/**
 * Admin dashboard: app status, backups and the Users tab (root §6.12).
 */
export function AdminPage() {
  const [tab, setTab] = useState<"status" | "users">("status");
  return (
    <Page
      title="Admin dashboard"
      eyebrow="Admin"
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v === "users" ? "users" : "status")} className="gap-6">
        <TabsList
          variant="line"
          aria-label="Admin sections"
          className="w-full justify-start border-x-0 border-t-0 border-b border-solid border-border"
        >
          <TabsTrigger value="status" className="flex-none px-4">
            Status &amp; backups
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-none px-4">
            Users
          </TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="flex flex-col gap-6">
          <StatusTiles />
          <BackupsSection />
        </TabsContent>
        <TabsContent value="users">
          <UsersSection />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function StatusTiles() {
  const status = useAdminStatus();
  if (status.isPending) return <StatusLine>Loading status…</StatusLine>;
  if (status.isError) return <LoadError message={errorMessage(status.error)} onRetry={() => void status.refetch()} />;
  const s = status.data;
  const last = s.backups.last_run;
  const nextRun = [s.backups.next_weekly_at, s.backups.next_monthly_at].sort()[0];

  return (
    <section aria-label="App status" className="flex flex-wrap gap-4">
      <Tile title="API server" tone="ok" value="Running">
        <Line label="Version" value={s.version} />
        <Line label="Uptime" value={formatUptime(s.uptime_seconds)} />
      </Tile>
      <Tile title="Database" value={formatBytes(s.database.size_bytes)}>
        <Line
          label="Last write"
          value={s.database.last_write_at ? formatDateTime(s.database.last_write_at) : "No data yet"}
        />
      </Tile>
      <Tile
        title="Backups"
        tone={last?.status === "failed" ? "bad" : undefined}
        value={last ? `${KIND_LABEL[last.kind]} · ${statusLabel(last.status)}` : "No backups yet"}
      >
        <Line label="Last run" value={last ? formatDateTime(last.finished_at ?? last.started_at) : "—"} />
        <Line label="Next run" value={formatDateTime(nextRun)} />
        <Line label="Schedule" value={s.backups.schedule} />
      </Tile>
    </section>
  );
}

function statusLabel(status: Schemas["Backup"]["status"]): string {
  return status === "succeeded" ? "Succeeded" : status === "failed" ? "Failed" : "Running";
}

function Tile({
  title,
  value,
  tone,
  children,
}: {
  title: string;
  value: string;
  tone?: "ok" | "bad";
  children: ReactNode;
}) {
  return (
    <Card className="min-w-[220px] flex-1 gap-2 px-5 py-[18px]">
      <h2 className="m-0 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</h2>
      <p
        className={cn(
          "m-0 flex items-center gap-2 text-xl leading-tight font-bold tracking-[-0.01em]",
          tone === "bad" && "text-danger-alert-foreground",
        )}
      >
        {tone && (
          <span
            aria-hidden="true"
            className={cn("size-2.5 flex-none rounded-full", tone === "ok" ? "bg-income" : "bg-destructive")}
          />
        )}
        {value}
      </p>
      <dl className="m-0 flex flex-col gap-1 text-[13px]">{children}</dl>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right tabular-nums">{value}</dd>
    </div>
  );
}

function BackupsSection() {
  const backups = useBackups();
  const start = useStartBackup();
  const download = useDownloadBackup();
  const [watching, setWatching] = useState<string | null>(null);

  // Confirm a manual backup with a toast once it finishes.
  const watched = watching ? backups.data?.find((b) => b.id === watching) : undefined;
  const finished = watched && watched.status !== "running" ? watched.status : null;
  useEffect(() => {
    // Fires once per watched backup: a finished status never changes again.
    if (!finished) return;
    if (finished === "succeeded") toast("Backup finished");
    else toast.error("Backup failed");
  }, [finished]);

  async function backUpNow() {
    download.reset();
    try {
      const started = await start.mutateAsync();
      setWatching(started.id);
      toast("Backup started");
    } catch {
      // Shown below from start.error.
    }
  }

  const error = start.isError ? start.error : download.isError ? download.error : null;
  const running = start.isPending || backups.data?.some((b) => b.status === "running") === true;

  return (
    <SectionCard
      title="Backups"
      description="Encrypted snapshots. They can only be opened with the offline private key."
      action={
        <Button type="button" disabled={running} onClick={() => void backUpNow()}>
          {running ? "Backing up…" : "Back up now"}
        </Button>
      }
      flush
    >
      {error && (
        <div className="px-5">
          <LoadError message={errorMessage(error)} />
        </div>
      )}
      {backups.isPending ? (
        <StatusLine inset>Loading backups…</StatusLine>
      ) : backups.isError ? (
        <div className="px-5">
          <LoadError message={errorMessage(backups.error)} onRetry={() => void backups.refetch()} />
        </div>
      ) : backups.data.length === 0 ? (
        <StatusLine inset>No backups yet.</StatusLine>
      ) : (
        <Table className={edgeColumns}>
          <TableCaption className="sr-only">Backup snapshots, newest first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Started</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" numeric>
                Size
              </TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.data.map((b) => (
              <TableRow key={b.id}>
                <TableHead scope="row" className="font-semibold text-foreground">
                  {KIND_LABEL[b.kind]}
                </TableHead>
                <TableCell className="tabular-nums">{formatDateTime(b.started_at)}</TableCell>
                <TableCell>
                  <span className="flex flex-col items-start gap-1">
                    <Badge variant={STATUS_BADGE[b.status]}>{statusLabel(b.status)}</Badge>
                    {b.error_message && (
                      <span className="text-xs whitespace-normal text-muted-foreground">{b.error_message}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell numeric>{b.size_bytes === null ? "—" : formatBytes(b.size_bytes)}</TableCell>
                <TableCell className="text-right">
                  {b.status === "succeeded" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={download.isPending}
                      aria-label={`Download ${KIND_LABEL[b.kind].toLowerCase()} backup from ${formatDateTime(b.started_at)}`}
                      onClick={() => download.mutate(b)}
                    >
                      <Download aria-hidden="true" />
                      Download
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
