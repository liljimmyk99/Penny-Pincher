import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, findMerchant, useApi, useCategories, useSavedTrendMutations, type Schemas } from "../../api";
import { MerchantCombobox } from "../../components/MerchantCombobox";
import { FormField } from "@/components/FormField";
import { Segmented } from "@/components/Segmented";
import { Input, inputVariants } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditDialog } from "../transactions/EditDialog";

type MatchType = Schemas["TrendMatchType"];
type Measure = Schemas["TrendMeasure"];

const MEASURES = [
  { value: "amount", label: "Amount" },
  { value: "count", label: "Count" },
] as const;

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
      <FormField label="Name" error={errors.name}>
        {(control) => <Input {...control} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <FormField label="Match by">
        {(control) => (
          <Select
            value={match}
            onValueChange={(v) => {
              setMatch(v as MatchType);
              setErrors((x) => ({ ...x, value: undefined }));
            }}
          >
            <SelectTrigger {...control} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCHES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={match === "merchant" ? "Merchant" : match === "category" ? "Category" : "Note contains"} error={errors.value}>
        {(control) =>
          match === "merchant" ? (
            <MerchantCombobox
              id={control.id}
              label="Merchant"
              className={inputVariants()}
              value={merchant}
              invalid={!!errors.value}
              describedBy={control["aria-describedby"]}
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
            <Select value={categoryId || undefined} onValueChange={setCategoryId}>
              <SelectTrigger {...control} className="w-full">
                <SelectValue placeholder="Choose a category…" />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input {...control} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
          )
        }
      </FormField>
      <div className="flex flex-col gap-1.5">
        {/* The visible label; the radiogroup carries the same name. */}
        <span className="text-[13px] font-medium" aria-hidden="true">Measure</span>
        <Segmented label="Measure" value={measure} options={MEASURES} onChange={setMeasure} />
      </div>
    </EditDialog>
  );
}
