import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FormField } from "./FormField";
import { PasswordInput } from "./PasswordInput";

function Field({ error, autoComplete = "current-password" }: { error?: string; autoComplete?: "current-password" | "new-password" }) {
  const [value, setValue] = useState("");
  return (
    <FormField label="Password" error={error}>
      {(control) => <PasswordInput {...control} autoComplete={autoComplete} value={value} onChange={(e) => setValue(e.target.value)} />}
    </FormField>
  );
}

describe("PasswordInput", () => {
  it("shows and hides the password with a pressed text button", async () => {
    const user = userEvent.setup();
    render(<Field />);
    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("aria-controls", input.id);
    expect(toggle).toHaveTextContent(/^Show/);

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    expect(hide).toHaveTextContent(/^Hide/);

    await user.click(hide);
    expect(input).toHaveAttribute("type", "password");
  });

  it("keeps focus and the cursor in the field when toggled", async () => {
    const user = userEvent.setup();
    render(<Field />);
    const input = screen.getByLabelText<HTMLInputElement>("Password");
    await user.type(input, "correct horse");
    input.setSelectionRange(3, 7);

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 7]);

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 7]);
    expect(input).toHaveValue("correct horse");
  });

  it("passes autocomplete through so password managers can fill it", () => {
    render(<Field autoComplete="new-password" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("is marked invalid and described by its inline error", () => {
    render(<Field error="That isn't your current password." />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("That isn't your current password.");
  });

  it("can leave the toggle to another field and follow its visibility", () => {
    render(
      <>
        <label htmlFor="a">A</label>
        <PasswordInput id="a" autoComplete="new-password" visible toggle={false} readOnly value="" />
      </>,
    );
    expect(screen.getByLabelText("A")).toHaveAttribute("type", "text");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
