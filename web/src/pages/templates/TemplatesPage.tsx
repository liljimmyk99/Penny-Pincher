import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, useTemplateMutations, useTemplates, type Schemas } from "../../api";
import { DeleteDialog } from "../../components/DeleteDialog";
import { AlertIcon, PencilIcon, PlusIcon, TrashIcon } from "../../components/icons";
import { Page } from "../Page";
import { EditDialog, FormField } from "../transactions/EditDialog";
import { invalidProps } from "../transactions/form";
import { TemplateEditor } from "./TemplateEditor";
import "./TemplatesPage.css";

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
            <button type="button" className="btn btn--ghost" onClick={() => setRenaming(true)}>
              <PencilIcon width={18} height={18} />
              Rename
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setDeleting(true)}>
              <TrashIcon width={18} height={18} />
              Delete
            </button>
          </>
        )
      }
    >
      <div className="tpl-layout">
        <aside className="card tpl-list" aria-labelledby="tpl-list-h">
          <h2 id="tpl-list-h" className="tpl-list__title">
            Your templates
          </h2>
          {list.isPending && <p className="tpl-status">Loading templates…</p>}
          {list.isError && (
            <div role="alert" className="alert alert--danger">
              <AlertIcon width={18} height={18} />
              <span>
                Couldn’t load templates. {errorMessage(list.error)}{" "}
                <button type="button" className="text-btn" onClick={() => void list.refetch()}>
                  Try again
                </button>
              </span>
            </div>
          )}
          {templates.length > 0 && (
            <ul className="tpl-list__items">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={t.id === selected?.id ? "tpl-pick is-on" : "tpl-pick"}
                    aria-pressed={t.id === selected?.id}
                    onClick={() => select(t.id)}
                  >
                    <span className="tpl-pick__name">{t.name}</span>
                    <span className="tpl-pick__count">{plural(itemCount(t), "item", "items")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <NewTemplate onCreated={(t) => select(t.id)} startOpen={list.isSuccess && templates.length === 0} />
        </aside>

        <section className="tpl-main" aria-label={selected ? `${selected.name} items` : "Template"}>
          {selected ? (
            <TemplateEditor key={selected.id} templateId={selected.id} />
          ) : (
            list.isSuccess && (
              <div className="tpl-empty">
                <h2 className="tpl-empty__title">No templates yet</h2>
                <p>
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
      <button type="button" className="text-btn tpl-list__new" onClick={() => setOpen(true)}>
        <PlusIcon />
        New template
      </button>
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
      className="tpl-new"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="field-label" htmlFor={id}>
        New template name
      </label>
      <input
        id={id}
        className="field"
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
        <p id={`${id}-err`} role="alert" className="tpl-new__error">
          <AlertIcon width={16} height={16} />
          {error}
        </p>
      )}
      <div className="tpl-new__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={create.isPending}>
          Create template
        </button>
        {!startOpen && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
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
        <input
          id={id}
          className="field"
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
