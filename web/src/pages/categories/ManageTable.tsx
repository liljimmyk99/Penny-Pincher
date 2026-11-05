import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { errorMessage } from "../../api";
import { AlertIcon, GripIcon, InfoIcon, LockIcon, PencilIcon, TrashIcon } from "../../components/icons";
import { moveAmongUnlocked } from "./reorder";

export interface ManageRow {
  id: string;
  name: string;
  /** The protected "Other": no handle, no rename, no delete. */
  locked: boolean;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

interface Props<T extends ManageRow> {
  /** Names the table for assistive tech, e.g. "Expense categories". */
  caption: string;
  /** Header of the name column, e.g. "Category". */
  nameHeader: string;
  /** Label of the inline rename field, e.g. "Category name". */
  renameLabel: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  badges?: (row: T) => ReactNode;
  footer: { label: string; cells: readonly ReactNode[] };
  onReorder: (ids: string[]) => void;
  onRename: (row: T, name: string) => Promise<unknown>;
  onDelete: (row: T) => void;
  /** When set for a row, it shows this explanation instead of a delete button. */
  deleteBlockedReason?: (row: T) => string | null;
}

/**
 * A reorderable list with inline rename and delete, shared by the expense
 * categories and income sources tables. Rows reorder by dragging the handle
 * or, from the keyboard, with the arrow keys on it.
 */
export function ManageTable<T extends ManageRow>({
  caption,
  nameHeader,
  renameLabel,
  rows,
  columns,
  badges,
  footer,
  onReorder,
  onRename,
  onDelete,
  deleteBlockedReason,
}: Props<T>) {
  const [editing, setEditing] = useState<{ id: string; draft: string; error?: string; saving?: boolean } | null>(
    null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const renameButtons = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<{ kind: "handle" | "rename"; id: string } | null>(null);

  // Keep focus on the control the user was using after rows move or an edit ends.
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    const el = (target.kind === "handle" ? handles : renameButtons).current.get(target.id);
    if (el && document.activeElement !== el) el.focus();
    if (el) refocus.current = null;
  });

  const movable = rows.filter((r) => !r.locked);

  function move(row: T, to: number) {
    const ids = moveAmongUnlocked(rows, row.id, to);
    if (!ids) return;
    onReorder(ids);
    setAnnouncement(`${row.name} moved to position ${to + 1} of ${movable.length}.`);
  }

  function onHandleKey(e: KeyboardEvent, row: T) {
    const index = movable.findIndex((r) => r.id === row.id);
    const to =
      e.key === "ArrowUp" ? index - 1
      : e.key === "ArrowDown" ? index + 1
      : e.key === "Home" ? 0
      : e.key === "End" ? movable.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    refocus.current = { kind: "handle", id: row.id };
    move(row, to);
  }

  function onDragStart(e: DragEvent<HTMLButtonElement>, row: T) {
    setDragId(row.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", row.id);
    const tr = e.currentTarget.closest("tr");
    if (tr) e.dataTransfer.setDragImage(tr, 24, 24);
  }

  function onDragOver(e: DragEvent, row: T) {
    if (!dragId || row.locked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== row.id) setOverId(row.id);
  }

  function onDrop(e: DragEvent, row: T) {
    e.preventDefault();
    const dragged = rows.find((r) => r.id === dragId);
    setDragId(null);
    setOverId(null);
    if (!dragged || row.locked) return;
    move(dragged, movable.findIndex((r) => r.id === row.id));
  }

  function startEdit(row: T) {
    setEditing({ id: row.id, draft: row.name });
  }

  function endEdit(id: string) {
    refocus.current = { kind: "rename", id };
    setEditing(null);
  }

  async function saveEdit(row: T) {
    if (!editing) return;
    const name = editing.draft.trim();
    if (!name) {
      setEditing({ ...editing, error: "Enter a name." });
      return;
    }
    if (name === row.name) {
      endEdit(row.id);
      return;
    }
    setEditing({ ...editing, saving: true, error: undefined });
    try {
      await onRename(row, name);
      endEdit(row.id);
    } catch (err) {
      setEditing((cur) => (cur ? { ...cur, saving: false, error: errorMessage(err) } : cur));
    }
  }

  return (
    <div className="manage-table__scroll">
      <table className="manage-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="manage-table__handle-col">
              <span className="visually-hidden">Reorder</span>
            </th>
            <th scope="col">{nameHeader}</th>
            {columns.map((c) => (
              <th key={c.header} scope="col" className="num">
                {c.header}
              </th>
            ))}
            <th scope="col" className="manage-table__actions-col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = editing?.id === row.id;
            const blocked = deleteBlockedReason?.(row) ?? null;
            const errorId = `rename-error-${row.id}`;
            const classes = [
              row.id === dragId && "is-dragging",
              row.id === overId && row.id !== dragId && "is-drop-target",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <tr
                key={row.id}
                className={classes || undefined}
                onDragOver={(e) => onDragOver(e, row)}
                onDragLeave={() => overId === row.id && setOverId(null)}
                onDrop={(e) => onDrop(e, row)}
              >
                <td>
                  {!row.locked && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--handle"
                      aria-label={`Reorder ${row.name}`}
                      aria-describedby="reorder-help"
                      draggable
                      onDragStart={(e) => onDragStart(e, row)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                      onKeyDown={(e) => onHandleKey(e, row)}
                      ref={(el) => {
                        if (el) handles.current.set(row.id, el);
                        else handles.current.delete(row.id);
                      }}
                    >
                      <GripIcon />
                    </button>
                  )}
                </td>
                <th scope="row" className="manage-table__name">
                  {isEditing ? (
                    <form
                      className="manage-table__edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEdit(row);
                      }}
                    >
                      <input
                        className="field field--sm"
                        type="text"
                        aria-label={renameLabel}
                        value={editing.draft}
                        maxLength={100}
                        autoFocus
                        aria-invalid={editing.error ? true : undefined}
                        aria-describedby={editing.error ? errorId : undefined}
                        onChange={(e) => setEditing({ ...editing, draft: e.target.value, error: undefined })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            endEdit(row.id);
                          }
                        }}
                      />
                      <button type="submit" className="btn btn--primary btn--sm" disabled={editing.saving}>
                        Save
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => endEdit(row.id)}>
                        Cancel
                      </button>
                      {editing.error && (
                        <p id={errorId} role="alert" className="manage-table__error">
                          <AlertIcon width={16} height={16} />
                          {editing.error}
                        </p>
                      )}
                    </form>
                  ) : (
                    <span className="manage-table__label">
                      {row.name}
                      {badges?.(row)}
                    </span>
                  )}
                </th>
                {columns.map((c) => (
                  <td key={c.header} className="num tnum">
                    {c.cell(row)}
                  </td>
                ))}
                <td className="manage-table__actions">
                  {row.locked ? (
                    <span className="locked">
                      <LockIcon width={15} height={15} />
                      Locked
                    </span>
                  ) : (
                    <span className="manage-table__buttons">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Rename ${row.name}`}
                        onClick={() => startEdit(row)}
                        disabled={isEditing}
                        ref={(el) => {
                          if (el) renameButtons.current.set(row.id, el);
                          else renameButtons.current.delete(row.id);
                        }}
                      >
                        <PencilIcon />
                      </button>
                      {blocked ? (
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              className="icon-btn icon-btn--info"
                              aria-label={`Why ${row.name} can't be deleted`}
                            >
                              <InfoIcon />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content className="tooltip" side="top" sideOffset={6}>
                              {blocked}
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => onDelete(row)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <th scope="row">{footer.label}</th>
            {footer.cells.map((cell, i) => (
              <td key={i} className="num tnum">
                {cell}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
