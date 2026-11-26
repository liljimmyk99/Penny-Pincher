import { useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Plus } from "lucide-react";
import { exactMerchant, useMerchantSearch, type Schemas } from "../api";
import { inputVariants } from "./ui/input";
import { MERCHANT_MAX } from "../lib/limits";
import { Command, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

/** The value of the "Create …" item; merchant items use the merchant's id. */
const CREATE = "__create__";

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
  /** Focus left the field, or "Create …" was chosen; the name may still match a merchant. */
  onCommit: () => void;
  /** Keys the combobox didn't use (Enter for "next row" and so on). */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** The input's class: the Input's `cell` variant by default, `inputVariants()` in a form. */
  className?: string;
  autoFocus?: boolean;
}

/**
 * Merchant name with autocomplete from the user's past merchants
 * (an ARIA 1.2 combobox with a listbox popup). Arrow keys move through
 * suggestions, Enter picks the highlighted one, Escape closes the list.
 * Typing a new name is fine: saving creates the merchant ("Create …").
 *
 * The list is cmdk in a Radix Popover, but the input is ours, outside the
 * Command tree: cmdk's own input replaces the id, always says
 * aria-expanded and takes Enter, which would stop Enter moving to the next
 * row when nothing is highlighted. The input drives cmdk's highlight
 * through Command's controlled `value` ("" is none).
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
  className = inputVariants({ variant: "cell" }),
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const search = useMerchantSearch(open ? value : "");
  const found = search.data ?? [];
  const exact = exactMerchant(found, value);
  // Hide the list once the field already shows the only suggestion, spelled
  // the same way. A different case still offers it ("rent" → "Rent"), so the
  // user can take the existing spelling; it just gets no "Create".
  const options = found.length === 1 && found[0].name === value.trim() ? [] : found;
  // Offer "Create" only once the search has answered, so it doesn't flash
  // up for a name that turns out to exist.
  const createName = !exact && search.isSuccess && value.trim() ? value.trim() : null;
  const values = [...options.map((m) => m.id), ...(createName ? [CREATE] : [])];
  const expanded = open && values.length > 0;
  const highlighted = values.includes(active) ? active : "";

  const wrapRef = useRef<HTMLDivElement>(null);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);

  // cmdk generates the listbox's and options' ids (and ignores ours), so
  // aria-controls and aria-activedescendant are read from its DOM. The same
  // pass keeps the highlighted option in view, which cmdk only does for
  // its own keyboard handling.
  const valuesKey = values.join("\n");
  useLayoutEffect(() => {
    const input = wrapRef.current?.querySelector("input");
    if (!input) return;
    const list = expanded ? listEl : null;
    // By value, not aria-selected: cmdk re-renders its items after this runs.
    const option = highlighted
      ? list?.querySelector<HTMLElement>(`[cmdk-item][data-value="${CSS.escape(highlighted)}"]`)
      : null;
    setAttr(input, "aria-controls", list?.id);
    setAttr(input, "aria-activedescendant", option?.id);
    option?.scrollIntoView?.({ block: "nearest" });
  }, [expanded, listEl, highlighted, valuesKey]);

  function close() {
    setOpen(false);
    setActive("");
  }

  function pick(m: Schemas["Merchant"]) {
    close();
    onPick(m);
  }

  function create() {
    close();
    onCommit();
  }

  function choose(v: string) {
    if (v === CREATE) return create();
    const m = options.find((o) => o.id === v);
    if (m) pick(m);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (expanded && !e.metaKey && !e.ctrlKey) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        // -1 is "nothing highlighted"; wrap through it at both ends.
        const i = values.indexOf(highlighted);
        const next = i + (e.key === "ArrowDown" ? 1 : -1);
        setActive(next < -1 ? values[values.length - 1] : next >= values.length || next < 0 ? "" : values[next]);
        return;
      }
      if (e.key === "Enter" && highlighted) {
        e.preventDefault();
        choose(highlighted);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
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
    <Popover open={expanded} onOpenChange={(next) => !next && close()} modal={false}>
      <PopoverAnchor asChild>
        <div className="relative" ref={wrapRef}>
          <input
            id={id}
            ref={inputRef}
            className={className}
            // Drawn with the Input's classes (inputVariants), so it takes the
            // shadcn controls' base reset rather than the old element rules (#176).
            data-slot="input"
            type="text"
            role="combobox"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={expanded}
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
              setActive("");
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              close();
              onCommit();
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-auto min-w-(--radix-popover-trigger-width) max-w-[min(420px,calc(100vw-16px))] p-1"
        // Focus stays in the input the whole time.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Clicking the input isn't "outside"; it keeps the list open.
        onInteractOutside={(e) => {
          if (wrapRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        // Keep focus in the input so its blur doesn't close the list before a click lands.
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* cmdk would highlight the first item on its own (and Enter would pick
            it), so the highlight is only ours: its value changes are ignored
            and the pointer is tracked on the items. */}
        <Command label="Past merchants" shouldFilter={false} value={highlighted} disablePointerSelection>
          <CommandList
            ref={setListEl}
            label="Past merchants"
            className="max-h-[min(260px,var(--radix-popover-content-available-height))]"
          >
            {options.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => pick(m)}
                onMouseMove={() => setActive(m.id)}
                className="cursor-pointer font-semibold whitespace-nowrap data-[selected=true]:bg-selected data-[selected=true]:text-selected-foreground"
              >
                {m.name}
              </CommandItem>
            ))}
            {createName && (
              <CommandItem
                value={CREATE}
                onSelect={create}
                onMouseMove={() => setActive(CREATE)}
                className="cursor-pointer whitespace-nowrap data-[selected=true]:bg-selected data-[selected=true]:text-selected-foreground"
              >
                <Plus aria-hidden="true" />
                Create “{createName}”
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function setAttr(el: HTMLElement, name: string, value: string | undefined) {
  if (value) el.setAttribute(name, value);
  else el.removeAttribute(name);
}
