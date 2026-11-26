import { useId, useState } from "react";
import { errorMessage } from "../../api";
import { AlertCircleIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  /** Visible field label, e.g. "New category name". */
  label: string;
  placeholder: string;
  /** Button text, e.g. "Add category". */
  action: string;
  onAdd: (name: string) => Promise<unknown>;
}

/** The "Add category" / "Add source" field under each table. */
export function AddForm({ label, placeholder, action, onAdd }: Props) {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 px-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 sm:max-w-[360px]">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="text"
          value={name}
          maxLength={100}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <Button type="submit" disabled={pending}>
        <PlusIcon aria-hidden="true" />
        {action}
      </Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 flex basis-full items-center gap-1.5 text-[13px] font-medium text-danger-alert-foreground">
          <AlertCircleIcon aria-hidden="true" className="size-4" />
          {error}
        </p>
      )}
    </form>
  );
}
