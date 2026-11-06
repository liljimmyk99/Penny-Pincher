import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useMerchantSearch, type Schemas } from "../api";
import { MERCHANT_MAX } from "../lib/limits";
import "./MerchantCombobox.css";

/** Matches max-height in MerchantCombobox.css. */
const LIST_MAX_HEIGHT = 260;

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
  autoFocus?: boolean;
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
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const search = useMerchantSearch(open ? value : "");
  const found = search.data ?? [];
  // Hide the list once the field already holds exactly the only suggestion.
  const options = found.length === 1 && found[0].name === value.trim() ? [] : found;
  const expanded = open && options.length > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>();
  const listId = `${id}-list`;

  // The list is position: fixed (so the batch table's scroll box can't clip
  // it); keep it under the input, or above it when there's no room below.
  useLayoutEffect(() => {
    if (!expanded) return;
    function update() {
      const box = wrapRef.current?.getBoundingClientRect();
      if (!box) return;
      const gap = 4;
      const margin = 8;
      const below = window.innerHeight - box.bottom - gap - margin;
      const above = box.top - gap - margin;
      const up = below < 160 && above > below;
      setPlace({
        left: box.left,
        minWidth: box.width,
        maxHeight: Math.max(0, Math.min(LIST_MAX_HEIGHT, up ? above : below)),
        ...(up ? { bottom: window.innerHeight - box.top + gap } : { top: box.bottom + gap }),
      });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [expanded]);
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
    <div className="combo" ref={wrapRef}>
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
        autoFocus={autoFocus}
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
      <ul id={listId} role="listbox" aria-label="Past merchants" className="combo__list"
        style={place}
        hidden={!expanded}
      >
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
