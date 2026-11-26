import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { errorMessage } from "../../api";
import { AlertCircleIcon, GripVerticalIcon, InfoIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div>
      <Table className="min-w-[560px]">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-14 pl-4">
              <span className="sr-only">Reorder</span>
            </TableHead>
            <TableHead scope="col">{nameHeader}</TableHead>
            {columns.map((c) => (
              <TableHead key={c.header} scope="col" numeric>
                {c.header}
              </TableHead>
            ))}
            <TableHead scope="col" className="w-[104px] pr-6">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isEditing = editing?.id === row.id;
            const blocked = deleteBlockedReason?.(row) ?? null;
            const errorId = `rename-error-${row.id}`;
            return (
              <TableRow
                key={row.id}
                data-dragging={row.id === dragId || undefined}
                data-drop-target={(row.id === overId && row.id !== dragId) || undefined}
                className="data-[dragging]:opacity-50 data-[drop-target]:shadow-[inset_0_2px_0_var(--color-ring)]"
                onDragOver={(e) => onDragOver(e, row)}
                onDragLeave={() => overId === row.id && setOverId(null)}
                onDrop={(e) => onDrop(e, row)}
              >
                <TableCell className="pl-4">
                  {!row.locked && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="cursor-grab text-muted-foreground active:cursor-grabbing"
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
                      <GripVerticalIcon aria-hidden="true" />
                    </Button>
                  )}
                </TableCell>
                <TableHead scope="row" className="font-semibold whitespace-normal text-foreground">
                  {isEditing ? (
                    <form
                      className="flex flex-wrap items-center gap-2 py-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEdit(row);
                      }}
                    >
                      <Input
                        className="h-9 max-w-[260px] font-normal"
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
                      <Button type="submit" variant="success" size="sm" disabled={editing.saving}>
                        Save
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => endEdit(row.id)}>
                        Cancel
                      </Button>
                      {editing.error && (
                        <p id={errorId} role="alert" className="m-0 flex basis-full items-center gap-1.5 text-[13px] font-medium text-danger-alert-foreground">
                          <AlertCircleIcon aria-hidden="true" className="size-4" />
                          {editing.error}
                        </p>
                      )}
                    </form>
                  ) : (
                    <span data-slot="manage-name" className="inline-flex flex-wrap items-center gap-2">
                      {row.name}
                      {badges?.(row)}
                    </span>
                  )}
                </TableHead>
                {columns.map((c) => (
                  <TableCell key={c.header} numeric>
                    {c.cell(row)}
                  </TableCell>
                ))}
                <TableCell className="pr-6 text-right">
                  {row.locked ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                      <LockIcon aria-hidden="true" className="size-[15px]" />
                      Locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${row.name}`}
                        onClick={() => startEdit(row)}
                        disabled={isEditing}
                        ref={(el) => {
                          if (el) renameButtons.current.set(row.id, el);
                          else renameButtons.current.delete(row.id);
                        }}
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                      {blocked ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Why ${row.name} can't be deleted`}>
                              <InfoIcon aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            {blocked}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="hover:bg-danger-alert hover:text-danger-alert-foreground"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => onDelete(row)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      )}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-4" />
            <TableHead scope="row" className="text-foreground">{footer.label}</TableHead>
            {footer.cells.map((cell, i) => (
              <TableCell key={i} numeric>
                {cell}
              </TableCell>
            ))}
            <TableCell className="pr-6" />
          </TableRow>
        </TableFooter>
      </Table>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
