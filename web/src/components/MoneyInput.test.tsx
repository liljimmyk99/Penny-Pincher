import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { FormField } from "@/components/FormField";
import { MoneyInput } from "@/components/MoneyInput";
import { centsToInput } from "@/lib/money";

function Amount({ initial, onCents, error }: { initial: string; onCents: (c: number | null) => void; error?: string }) {
  const [text, setText] = useState(initial);
  return (
    <FormField label="Amount" error={error}>
      {(control) => (
        <MoneyInput
          {...control}
          value={text}
          onValueChange={(t, cents) => {
            setText(t);
            onCents(cents);
          }}
        />
      )}
    </FormField>
  );
}

describe("MoneyInput", () => {
  it("is labelled, right-aligned with tabular numerals, and hides the $ from assistive tech", () => {
    render(<Amount initial="" onCents={() => {}} />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveClass("text-right", "tabular-nums", "h-11");
    expect(screen.getByText("$")).toHaveAttribute("aria-hidden", "true");
  });

  it("reports integer cents as the user types, keeping their text", async () => {
    const user = userEvent.setup();
    const onCents = vi.fn();
    render(<Amount initial="" onCents={onCents} />);
    const input = screen.getByLabelText("Amount");
    await user.type(input, "1,234.5");
    expect(input).toHaveValue("1,234.5");
    expect(onCents).toHaveBeenLastCalledWith(123450);
    await user.type(input, "x");
    expect(onCents).toHaveBeenLastCalledWith(null);
  });

  it("is seeded from cents and marks itself invalid", () => {
    render(<Amount initial={centsToInput(-2499)} onCents={() => {}} error="Enter an amount" />);
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveValue("-24.99");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Enter an amount");
  });
});
