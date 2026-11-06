import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, findMerchant, useApi, useCategories, useSavedTrendMutations, type Schemas } from "../../api";
import { MerchantCombobox } from "../../components/MerchantCombobox";
import { EditDialog, FormField } from "../transactions/EditDialog";
import { invalidProps } from "../transactions/form";

type MatchType = Schemas["TrendMatchType"];
type Measure = Schemas["TrendMeasure"];

const MATCHES: { value: MatchType; label: string }[] = [
  { value: "merchant", label: "Merchant" },
  { value: "category", label: "Category" },
  { value: "note", label: "Note contains" },
];

/** "New trend": name, what to match (merchant / category / note text) and the measure. */
export function NewTrendDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (trend: Schemas["SavedTrend"]) => void;
}) {
  const id = useId();
  const api = useApi();
  const qc = useQueryClient();
  const categories = useCategories();
  const { create } = useSavedTrendMutations();
  const [name, setName] = useState("");
  const [match, setMatch] = useState<MatchType>("merchant");
  const [merchant, setMerchant] = useState("");
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [text, setText] = useState("");
  const [measure, setMeasure] = useState<Measure>("amount");
  const [errors, setErrors] = useState<{ name?: string; value?: string }>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  async function submit() {
    setAlert(null);
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = "Enter a name for the trend.";
    let body: Schemas["SavedTrendCreate"] | null = null;
    if (match === "merchant") {
      let picked = merchantId;
      if (!picked && merchant.trim()) {
        setResolving(true);
        try {
          picked = (await findMerchant(qc, api, merchant))?.id ?? null;
        } catch (err) {
          setAlert(errorMessage(err));
          return;
        } finally {
          setResolving(false);
        }
      }
      if (!picked) next.value = merchant.trim() ? "No merchant has that name. Pick one from the list." : "Choose a merchant.";
      else body = { name: trimmed, match_type: "merchant", merchant_id: picked, measure };
    } else if (match === "category") {
      if (!categoryId) next.value = "Choose a category.";
      else body = { name: trimmed, match_type: "category", category_id: categoryId, measure };
    } else if (!text.trim()) next.value = "Enter the text to look for.";
    else body = { name: trimmed, match_type: "note", match_text: text.trim(), measure };
    setErrors(next);
    if (!body || next.name) return;
    try {
      onCreated(await create.mutateAsync(body));
      setName("");
      setMerchant("");
      setMerchantId(null);
      setCategoryId("");
      setText("");
    } catch (err) {
      if (err instanceof ApiError && err.details.some((d) => d.field === "name")) setErrors({ name: errorMessage(err) });
      else setAlert(errorMessage(err));
    }
  }

  const valueId = `${id}-value`;
  return (
    <EditDialog
      open={open}
      title="New trend"
      description="Track one merchant, category or note text month by month. Saved trends appear in the list."
      pending={create.isPending || resolving}
      alert={alert}
      onSubmit={() => void submit()}
      onClose={onClose}
      submitLabel="Save trend"
    >
      <FormField id={`${id}-name`} label="Name" error={errors.name} wide>
        <input
          id={`${id}-name`}
          className="field"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          {...invalidProps(`${id}-name`, errors.name)}
        />
      </FormField>
      <FormField id={`${id}-match`} label="Match by">
        <select
          id={`${id}-match`}
          className="field"
          value={match}
          onChange={(e) => {
            setMatch(e.target.value as MatchType);
            setErrors((x) => ({ ...x, value: undefined }));
          }}
        >
          {MATCHES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </FormField>
      <FormField id={`${id}-measure`} label="Measure">
        <select id={`${id}-measure`} className="field" value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
          <option value="amount">Amount</option>
          <option value="count">Count</option>
        </select>
      </FormField>
      <FormField id={valueId} label={match === "merchant" ? "Merchant" : match === "category" ? "Category" : "Note contains"} error={errors.value} wide>
        {match === "merchant" ? (
          <MerchantCombobox
            id={valueId}
            label="Merchant"
            className="field"
            value={merchant}
            invalid={!!errors.value}
            describedBy={errors.value ? `${valueId}-err` : undefined}
            onChange={(v) => {
              setMerchant(v);
              setMerchantId(null);
            }}
            onPick={(m) => {
              setMerchant(m.name);
              setMerchantId(m.id);
            }}
            onCommit={() => {}}
          />
        ) : match === "category" ? (
          <select
            id={valueId}
            className="field"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            {...invalidProps(valueId, errors.value)}
          >
            <option value="">Choose a category…</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <input
            id={valueId}
            className="field"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            {...invalidProps(valueId, errors.value)}
          />
        )}
      </FormField>
    </EditDialog>
  );
}
