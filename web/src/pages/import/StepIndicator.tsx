const STEPS = ["Get template", "Upload", "Review", "Import"];

/** Where the user is: 0 = Get template … 3 = Import. */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="import-steps" aria-label="Import steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`import-steps__step${i === current ? " import-steps__step--current" : ""}${i < current ? " import-steps__step--done" : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="import-steps__num" aria-hidden="true">
            {i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
