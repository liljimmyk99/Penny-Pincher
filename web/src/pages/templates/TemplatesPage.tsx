import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, useTemplateMutations, useTemplates, type Schemas } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { AlertCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { LoadError } from "../../components/LoadError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Page } from "../Page";
import { EditDialog, FormField } from "../transactions/EditDialog";
import { invalidProps } from "../transactions/form";
import { TemplateEditor } from "./TemplateEditor";

const count = new Intl.NumberFormat("en-US");
const itemCount = (t: Schemas["TemplateSummary"]) => t.expense_item_count + t.income_item_count;
const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

/**
 * "Your templates" and the editor for the chosen one (web/AGENTS.md "Templates").
 * The chosen template is in the address (`?template=<id>`); without one, the first.
 */
export function TemplatesPage() {
  const list = useTemplates();
  const [params, setParams] = useSearchParams();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const templates = list.data ?? [];
  const wanted = params.get("template");
  const selected = templates.find((t) => t.id === wanted) ?? templates[0] ?? null;

  const select = (id: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set("template", id);
        else next.delete("template");
        return next;
      },
      { replace: true },
    );

  return (
    <Page
      title={selected?.name ?? "Templates"}
      eyebrow={selected ? "Templates" : undefined}
      actions={
        selected && (
          <>
            <Button variant="ghost" onClick={() => setRenaming(true)}>
              <PencilIcon aria-hidden="true" />
              Rename
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          </>
        )
      }
    >
      {/* Below 1400px the item rows need the full width: the list moves above the editor. */}
      <div className="group/tpl grid items-start gap-6 min-[1401px]:grid-cols-[260px_minmax(0,1fr)]">
        {/* Drawn as the Card (ui/card's classes) but kept an <aside> landmark. */}
        <aside
          data-slot="card"
          aria-labelledby="tpl-list-h"
          className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3.5 py-[18px] text-card-foreground"
        >
            <h2 id="tpl-list-h" data-slot="section-label" className="mx-1.5 mb-1.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Your templates
            </h2>
            {list.isPending && <p className="m-0 text-muted-foreground">Loading templates…</p>}
            {list.isError && <LoadError what="templates" error={list.error} retry={() => void list.refetch()} />}
            {templates.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 max-[1400px]:flex-row max-[1400px]:flex-wrap">
                {templates.map((t) => {
                  const on = t.id === selected?.id;
                  return (
                    <li key={t.id}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-auto min-h-12 w-full justify-between gap-2 border border-solid border-transparent px-3.5 text-left whitespace-normal max-[1400px]:w-auto max-[1400px]:gap-4",
                          on && "border-ring bg-selected text-selected-foreground hover:bg-selected hover:text-selected-foreground",
                        )}
                        aria-pressed={on}
                        onClick={() => select(t.id)}
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{t.name}</span>
                        <span className={cn("flex-none text-xs font-medium", on ? "text-inherit" : "text-muted-foreground")}>
                          {plural(itemCount(t), "item", "items")}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <NewTemplate onCreated={(t) => select(t.id)} startOpen={list.isSuccess && templates.length === 0} />
        </aside>

        <section className="min-w-0" aria-label={selected ? `${selected.name} items` : "Template"}>
          {selected ? (
            <TemplateEditor key={selected.id} templateId={selected.id} />
          ) : (
            list.isSuccess && (
              <div className="rounded-xl border border-dashed border-input p-6 text-muted-foreground">
                <h2 className="m-0 mb-2 text-lg font-semibold text-foreground">No templates yet</h2>
                <p className="m-0 max-w-[60ch]">
                  A template is a filled-out month: the paychecks and bills you expect, each on its day of the month.
                  Create one, then start any month from it.
                </p>
              </div>
            )
          )}
        </section>
      </div>

      {selected && (
        <RenameDialog
          key={`${selected.id}-${renaming}`}
          open={renaming}
          template={selected}
          onClose={() => setRenaming(false)}
        />
      )}
      {selected && (
        <DeleteTemplate
          open={deleting}
          template={selected}
          onClose={() => setDeleting(false)}
          onDeleted={() => select(null)}
        />
      )}
    </Page>
  );
}

function NewTemplate({ onCreated, startOpen }: { onCreated: (t: Schemas["Template"]) => void; startOpen: boolean }) {
  const id = useId();
  const { create } = useTemplateMutations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const showing = open || startOpen;

  if (!showing) {
    return (
      <Button variant="link" className="self-start px-1.5" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden="true" />
        New template
      </Button>
    );
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setError(null);
    try {
      const created = await create.mutateAsync(trimmed);
      setName("");
      setOpen(false);
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form
      className="flex flex-col gap-2 px-1 pt-2 max-[1400px]:max-w-[360px]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Label htmlFor={id}>New template name</Label>
      <Input
        id={id}
        type="text"
        value={name}
        maxLength={100}
        placeholder="e.g. Standard month"
        autoFocus={open}
        {...invalidProps(id, error ?? undefined)}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !startOpen) setOpen(false);
        }}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="m-0 flex items-center gap-1.5 text-[13px] font-medium text-danger-alert-foreground">
          <AlertCircleIcon aria-hidden="true" className="size-4" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          Create template
        </Button>
        {!startOpen && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function RenameDialog({
  open,
  template,
  onClose,
}: {
  open: boolean;
  template: Schemas["TemplateSummary"];
  onClose: () => void;
}) {
  const id = useId();
  const { rename } = useTemplateMutations();
  const [name, setName] = useState(template.name);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    if (trimmed === template.name) return onClose();
    try {
      await rename.mutateAsync({ id: template.id, name: trimmed });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <EditDialog
      open={open}
      title="Rename template"
      description="Months already started from it keep their entries."
      pending={rename.isPending}
      alert={null}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <FormField id={id} label="Template name" error={error} wide>
        <Input
          id={id}
          type="text"
          value={name}
          maxLength={100}
          {...invalidProps(id, error)}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
        />
      </FormField>
    </EditDialog>
  );
}

function DeleteTemplate({
  open,
  template,
  onClose,
  onDeleted,
}: {
  open: boolean;
  template: Schemas["TemplateSummary"];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { remove } = useTemplateMutations();
  const [error, setError] = useState<string | null>(null);
  const items = itemCount(template);

  async function confirm() {
    setError(null);
    try {
      await remove.mutateAsync(template.id);
      onClose();
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <DeleteDialog
      open={open}
      title={`Delete “${template.name}”?`}
      body={items === 0 ? "It has no items." : `Its ${plural(items, "item", "items")} will be deleted with it.`}
      extra="Entries already copied into months stay as they are."
      confirmLabel="Delete template"
      pending={remove.isPending}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={() => {
        setError(null);
        onClose();
      }}
    />
  );
}
