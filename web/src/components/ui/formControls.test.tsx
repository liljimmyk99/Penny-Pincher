import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { FormField } from "@/components/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const focusRing = ["focus-visible:ring-[3px]", "focus-visible:ring-ring/35"];
const invalid = ["aria-invalid:border-danger-alert-line"];

describe("Input", () => {
  it("is 44px with the focus ring and invalid styles", () => {
    render(<Input aria-label="Note" />);
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveClass("h-11", "rounded-md", ...focusRing, ...invalid);
  });

  it("is disabled", () => {
    render(<Input aria-label="Note" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("keeps a date as a YYYY-MM-DD string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input type="date" aria-label="Date" onChange={(e) => onChange(e.target.value)} />);
    await user.type(screen.getByLabelText("Date"), "2026-03-31");
    expect(onChange).toHaveBeenLastCalledWith("2026-03-31");
  });
});

describe("FormField", () => {
  it("labels its control and wires the error to it", () => {
    render(
      <FormField label="Merchant" description="As on the receipt" error="Enter a merchant">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText("Merchant");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("As on the receipt Enter a merchant");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a merchant");
  });

  it("is valid with no error", () => {
    render(<FormField label="Merchant">{(control) => <Input {...control} />}</FormField>);
    expect(screen.getByLabelText("Merchant")).toBeValid();
    expect(screen.getByLabelText("Merchant")).not.toHaveAttribute("aria-describedby");
  });

  it("can be invalid with its message elsewhere", () => {
    render(
      <>
        <p id="form-error">Wrong username or password.</p>
        <FormField label="Password" invalid describedBy="form-error">
          {(control) => <Input {...control} type="password" />}
        </FormField>
      </>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Wrong username or password.");
  });
});

describe("Textarea", () => {
  it("has the label, focus ring and invalid styles", () => {
    render(
      <>
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" aria-invalid />
      </>,
    );
    const area = screen.getByLabelText("Note");
    expect(area).toHaveClass(...focusRing, ...invalid);
    expect(area).toBeInvalid();
  });
});

describe("Checkbox", () => {
  it("toggles with Space and is named by its label", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Checkbox id="must-change" defaultChecked />
        <Label htmlFor="must-change">Ask them to choose their own password</Label>
      </div>,
    );
    const box = screen.getByRole("checkbox", { name: "Ask them to choose their own password" });
    expect(box).toBeChecked();
    expect(box).toHaveClass(...focusRing);
    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
    await user.click(screen.getByText("Ask them to choose their own password"));
    expect(box).toBeChecked();
  });

  it("does not toggle while disabled", async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Confirmed" disabled />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

describe("Select", () => {
  function Category() {
    const [value, setValue] = useState("food");
    return (
      <FormField label="Category">
        {(control) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger {...control}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="food">Food</SelectItem>
              <SelectItem value="housing">Housing</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>
    );
  }

  it("is 44px, labelled, and picks an option with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Category />);
    const trigger = screen.getByRole("combobox", { name: "Category" });
    expect(trigger).toHaveClass("data-[size=default]:h-11", ...focusRing);
    expect(trigger).toHaveTextContent("Food");

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Housing" }));
    expect(trigger).toHaveTextContent("Housing");
  });
});

describe("cell variants (#175)", () => {
  it("Input cell is the quiet 38px table-cell input, still with the focus ring and invalid styles", () => {
    render(<Input aria-label="Note, row 1" variant="cell" />);
    const input = screen.getByRole("textbox", { name: "Note, row 1" });
    expect(input).toHaveClass("h-9.5", "border-transparent", "bg-transparent", "hover:border-input", ...focusRing, ...invalid);
    expect(input).not.toHaveClass("h-11");
  });

  it("SelectTrigger cell fills its cell and keeps its 38px height over the default size", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Category, row 1" variant="cell">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "Category, row 1" });
    expect(trigger).toHaveClass("w-full", "border-transparent", "data-[size=default]:h-9.5", ...focusRing);
    expect(trigger).not.toHaveClass("data-[size=default]:h-11");
  });
});
