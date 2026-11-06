import { useState } from "react";
import { Link } from "react-router";
import { useTemplates } from "../../api";
import { CheckIcon } from "../../components/icons";

const HIDDEN_KEY = "penny.welcome.hidden";
const CHECKED_KEY = "penny.welcome.categoriesChecked";

/** Per-viewer conveniences only; the card still works if storage is unavailable. */
function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function write(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

/**
 * The new-account welcome card (web/AGENTS.md "Empty states → New account"):
 * a 3-step checklist with progress, which can be hidden. Steps: check categories
 * & sources, build a template month, log the first entry.
 */
export function Welcome({ hasEntries }: { hasEntries: boolean }) {
  const templates = useTemplates();
  const [hidden, setHidden] = useState(() => read(HIDDEN_KEY));
  const [categoriesChecked, setCategoriesChecked] = useState(() => read(CHECKED_KEY));
  if (hidden || !templates.data) return null;

  const steps = [
    { done: categoriesChecked, label: "Check your categories & sources", to: "/categories", onGo: () => { write(CHECKED_KEY); setCategoriesChecked(true); } },
    { done: templates.data.some((t) => t.expense_item_count + t.income_item_count > 0), label: "Build a template month", to: "/templates" },
    { done: hasEntries, label: "Log your first entry", to: "/add" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <section className="card welcome" aria-labelledby="welcome-h">
      <div className="welcome__head">
        <div>
          <p className="eyebrow">Welcome</p>
          <h2 id="welcome-h" className="welcome__title">Let’s get you set up</h2>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            write(HIDDEN_KEY);
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <div
        className="welcome__progress"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-valuetext={`${doneCount} of ${steps.length} steps done`}
      >
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="welcome__steps">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "is-done" : undefined}>
            <span className="welcome__tick" aria-hidden="true">{s.done && <CheckIcon width={14} height={14} />}</span>
            <Link to={s.to} onClick={s.onGo}>{s.label}</Link>
            {s.done && <span className="visually-hidden"> (done)</span>}
          </li>
        ))}
      </ol>
      <p className="welcome__note">Yearly and Trends fill in as you log months.</p>
    </section>
  );
}
