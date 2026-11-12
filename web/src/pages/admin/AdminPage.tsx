import { useCallback, useState, type ReactNode } from "react";
import {
  errorMessage,
  useAdminStatus,
  useBackups,
  useDownloadBackup,
  useStartBackup,
  type Schemas,
} from "../../api";
import { firebaseConfigFromEnv } from "../../auth/config";
import { AlertIcon, DownloadIcon, LinkIcon } from "../../components/icons";
import { Toast } from "../../components/Toast";
import { Page } from "../Page";
import { UsersSection } from "./UsersSection";
import { formatBytes, formatDateTime, formatUptime } from "./format";
import "./AdminPage.css";

const KIND_LABEL: Record<Schemas["Backup"]["kind"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  manual: "Manual",
};

/** Where account tasks live in v1 (web/AGENTS.md "Admin panel"). */
function firebaseConsoleUrl(): string {
  const project = firebaseConfigFromEnv()?.projectId;
  return project
    ? `https://console.firebase.google.com/project/${encodeURIComponent(project)}/authentication/users`
    : "https://console.firebase.google.com/";
}

/**
 * Admin dashboard: app status, backups and the Users tab (root §6.12). Firebase
 * accounts are still created in the Firebase console, linked from the header.
 */
export function AdminPage() {
  const [tab, setTab] = useState<"status" | "users">("status");
  return (
    <Page
      title="Admin dashboard"
      eyebrow="Admin"
      actions={
        <a className="btn btn--ghost btn--sm" href={firebaseConsoleUrl()} target="_blank" rel="noreferrer">
          <LinkIcon width={16} height={16} />
          Firebase console
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      }
    >
      <div role="tablist" aria-label="Admin sections" className="admin__tabs">
        {(
          [
            ["status", "Status & backups"],
            ["users", "Users"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`admin-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="admin-panel"
            className={`admin__tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="admin-panel" aria-labelledby={`admin-tab-${tab}`}>
        {tab === "status" ? (
          <>
            <StatusTiles />
            <BackupsSection />
          </>
        ) : (
          <UsersSection />
        )}
      </div>
    </Page>
  );
}

function StatusTiles() {
  const status = useAdminStatus();
  if (status.isPending) return <p className="admin__status">Loading status…</p>;
  if (status.isError) {
    return (
      <p className="alert alert--danger" role="alert">
        <AlertIcon width={18} height={18} />
        {errorMessage(status.error)}
      </p>
    );
  }
  const s = status.data;
  const authOk = s.auth_provider.status === "ok";
  const last = s.backups.last_run;
  const nextRun = [s.backups.next_weekly_at, s.backups.next_monthly_at].sort()[0];

  return (
    <section aria-label="App status" className="admin__tiles">
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
      <Tile title="Sign-in" tone={authOk ? "ok" : "bad"} value={authOk ? "Firebase connected" : "Firebase unreachable"}>
        <Line label="Checked" value={formatDateTime(s.auth_provider.checked_at)} />
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
    <div className="card admin-tile">
      <h2 className="eyebrow">{title}</h2>
      <p className={`admin-tile__value${tone ? ` admin-tile__value--${tone}` : ""}`}>{value}</p>
      <dl className="admin-tile__lines">{children}</dl>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-tile__line">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BackupsSection() {
  const backups = useBackups();
  const start = useStartBackup();
  const download = useDownloadBackup();
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const [watching, setWatching] = useState<string | null>(null);

  // Confirm a manual backup with a toast once it finishes.
  const watched = watching ? backups.data?.find((b) => b.id === watching) : undefined;
  if (watched && watched.status !== "running") {
    setWatching(null);
    setToast(watched.status === "succeeded" ? "Backup finished" : "Backup failed");
  }

  async function backUpNow() {
    download.reset();
    try {
      const started = await start.mutateAsync();
      setWatching(started.id);
      setToast("Backup started");
    } catch {
      // Shown below from start.error.
    }
  }

  const error = start.isError ? start.error : download.isError ? download.error : null;
  const running = start.isPending || backups.data?.some((b) => b.status === "running") === true;

  return (
    <section className="card admin-backups" aria-labelledby="backups-h">
      <div className="admin-backups__head">
        <div>
          <h2 id="backups-h">Backups</h2>
          <p className="admin__desc">Encrypted snapshots. They can only be opened with the offline private key.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" disabled={running} onClick={() => void backUpNow()}>
          {running ? "Backing up…" : "Back up now"}
        </button>
      </div>
      {error && (
        <p className="alert alert--danger admin-backups__alert" role="alert">
          <AlertIcon width={18} height={18} />
          {errorMessage(error)}
        </p>
      )}
      {backups.isPending ? (
        <p className="admin__status">Loading backups…</p>
      ) : backups.isError ? (
        <p className="alert alert--danger admin-backups__alert" role="alert">
          <AlertIcon width={18} height={18} />
          {errorMessage(backups.error)}
        </p>
      ) : backups.data.length === 0 ? (
        <p className="admin__status">No backups yet.</p>
      ) : (
        <div className="admin-backups__scroll">
          <table className="admin-backups__table">
            <caption className="visually-hidden">Backup snapshots, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Started</th>
                <th scope="col">Status</th>
                <th scope="col">Size</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {backups.data.map((b) => (
                <tr key={b.id}>
                  <th scope="row">{KIND_LABEL[b.kind]}</th>
                  <td>{formatDateTime(b.started_at)}</td>
                  <td>
                    <span className={`admin-backups__state admin-backups__state--${b.status}`}>
                      {statusLabel(b.status)}
                    </span>
                    {b.error_message && <span className="admin-backups__reason">{b.error_message}</span>}
                  </td>
                  <td>{b.size_bytes === null ? "—" : formatBytes(b.size_bytes)}</td>
                  <td className="admin-backups__actions">
                    {b.status === "succeeded" && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        disabled={download.isPending}
                        aria-label={`Download ${KIND_LABEL[b.kind].toLowerCase()} backup from ${formatDateTime(b.started_at)}`}
                        onClick={() => download.mutate(b)}
                      >
                        <DownloadIcon width={14} height={14} />
                        Download
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast message={toast} onDismiss={dismissToast} />
    </section>
  );
}
