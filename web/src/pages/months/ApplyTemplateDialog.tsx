import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, useTemplates, type Schemas } from "../../api";
import { AlertIcon } from "../../components/icons";
import { monthName } from "../../lib/dates";
import { defaultTemplate, plural } from "./preview";
import { useApplyTemplate } from "./useApplyTemplate";
import "./months.css";

/**
 * "Apply a template…" for a month that may already have data: pick a
 * template, then copy. A month with entries goes through the full-reset
 * confirmation in `useApplyTemplate`.
 */
export function ApplyTemplateDialog({
  month,
  open,
  onClose,
  onApplied,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  onApplied: (result: Schemas["TemplateApplyResult"]) => void;
}) {
  const templates = useTemplates();
  const list = templates.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = list.find((t) => t.id === picked) ?? defaultTemplate(list);
  const flow = useApplyTemplate(month, onApplied);
  const name = monthName(month);
  const items = (t: Schemas["TemplateSummary"]) => t.expense_item_count + t.income_item_count;

  return (
    <>
      <Dialog.Root open={open && !flow.confirmingReset} onOpenChange={(next) => !next && !flow.pending && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content className="dialog edit-dialog" aria-modal="true">
            <div className="dialog__text">
              <Dialog.Title className="dialog__title">Apply a template to {name}</Dialog.Title>
              <Dialog.Description className="dialog__body">
                Every item is copied into {name} on its day of the month, unconfirmed until you check it.
              </Dialog.Description>
            </div>
            {templates.isPending && <p className="new-month__status">Loading your templates…</p>}
            {templates.isError && (
              <p role="alert" className="alert alert--danger">
                <AlertIcon width={18} height={18} />
                Couldn’t load your templates. {errorMessage(templates.error)}
              </p>
            )}
            {templates.isSuccess && list.length === 0 && (
              <p className="new-month__status">
                You have no templates yet. <Link to="/templates">Build a template month</Link> first.
              </p>
            )}
            {list.length > 0 && (
              <div role="radiogroup" aria-label="Template" className="apply-pick">
                {list.map((t) => {
                  const on = t.id === chosen?.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={on ? "apply-pick__opt is-on" : "apply-pick__opt"}
                      onClick={() => setPicked(t.id)}
                    >
                      <span className="apply-pick__name">{t.name}</span>
                      <span className="apply-pick__count">{plural(items(t), "item", "items")}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {flow.error && (
              <p role="alert" className="alert alert--danger">
                <AlertIcon width={18} height={18} />
                {flow.error}
              </p>
            )}
            <div className="dialog__actions">
              <Dialog.Close className="btn btn--ghost" type="button" disabled={flow.pending}>
                Cancel
              </Dialog.Close>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!chosen || items(chosen) === 0 || flow.pending}
                onClick={() => chosen && void flow.apply(chosen)}
              >
                {flow.pending ? "Copying…" : `Copy into ${name}`}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {flow.dialog}
    </>
  );
}
