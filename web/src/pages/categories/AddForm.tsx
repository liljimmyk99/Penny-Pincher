import { useId, useState } from "react";
import { errorMessage } from "../../api";
import { AlertIcon, PlusIcon } from "../../components/icons";

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
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="add-row__field">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className="field"
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
      <button type="submit" className="btn btn--primary" disabled={pending}>
        <PlusIcon />
        {action}
      </button>
      {error && (
        <p id={`${id}-error`} role="alert" className="add-row__error">
          <AlertIcon width={16} height={16} />
          {error}
        </p>
      )}
    </form>
  );
}
