import { useState, type KeyboardEvent, type Ref } from "react";
import { useMerchantSearch, type Schemas } from "../api";
import { MERCHANT_MAX } from "../lib/limits";
import "./MerchantCombobox.css";

interface Props {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  /** A suggestion was chosen (click or Enter on the highlighted one). */
  onPick: (merchant: Schemas["Merchant"]) => void;
  /** Focus left the field without picking; the name may still match a merchant. */
  onCommit: () => void;
  /** Keys the combobox didn't use (Enter for "next row" and so on). */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** The input's class: a table cell by default, `field` in a form. */
  className?: string;
}

/**
 * Merchant name with autocomplete from the user's past merchants
 * (an ARIA 1.2 combobox with a listbox popup). Arrow keys move through
 * suggestions, Enter picks the highlighted one, Escape closes the list.
 * Typing a new name is fine: saving creates the merchant.
 */
export function MerchantCombobox({
  id,
  label,
  value,
  invalid,
  describedBy,
  inputRef,
  onChange,
  onPick,
  onCommit,
  onKeyDown,
  className = "cell-input",
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const search = useMerchantSearch(open ? value : "");
  const found = search.data ?? [];
  // Hide the list once the field already holds exactly the only suggestion.
  const options = found.length === 1 && found[0].name === value.trim() ? [] : found;
  const expanded = open && options.length > 0;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  function pick(m: Schemas["Merchant"]) {
    setOpen(false);
    setActive(-1);
    onPick(m);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (expanded && !e.metaKey && !e.ctrlKey) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        // -1 is "no suggestion highlighted"; wrap through it at both ends.
        setActive((i) => {
          const next = i + step;
          return next < -1 ? options.length - 1 : next >= options.length ? -1 : next;
        });
        return;
      }
      if (e.key === "Enter" && active >= 0 && options[active]) {
        e.preventDefault();
        pick(options[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
        return;
      }
    }
    if (e.key === "ArrowDown" && !expanded && value.trim()) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    onKeyDown?.(e);
  }

  return (
    <div className="combo">
      <input
        id={id}
        ref={inputRef}
        className={className}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        maxLength={MERCHANT_MAX}
        placeholder="Merchant"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
          onCommit();
        }}
      />
      <ul id={listId} role="listbox" aria-label="Past merchants" className="combo__list" hidden={!expanded}>
        {expanded &&
          options.map((m, i) => (
            <li
              key={m.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="combo__option"
              // Keep focus in the input; pick on mousedown so blur doesn't close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              {m.name}
            </li>
          ))}
      </ul>
    </div>
  );
}
