import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { newPasswordRules } from "@/lib/password";
import { PasswordRequirements } from "./PasswordRequirements";

function Harness() {
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  return (
    <>
      <input aria-label="New" value={next} onChange={(e) => setNext(e.target.value)} />
      <input aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      <PasswordRequirements rules={newPasswordRules({ next, current: "the-current-one", repeat })} />
    </>
  );
}

describe("PasswordRequirements", () => {
  it("is a named list announced politely", () => {
    render(<Harness />);
    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(list).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("updates each rule's text status as you type", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [length, different, match] = screen.getAllByRole("listitem");
    expect(length).toHaveTextContent("At least 12 characters (not met)");
    expect(different).toHaveTextContent("Different from your current password (not met)");
    expect(match).toHaveTextContent("Both new passwords match (not met)");

    await user.type(screen.getByLabelText("New"), "short");
    expect(length).toHaveTextContent("(not met)");
    expect(different).toHaveTextContent("Different from your current password (met)");

    await user.type(screen.getByLabelText("New"), "-but-now-long");
    expect(length).toHaveTextContent("At least 12 characters (met)");
    expect(match).toHaveTextContent("(not met)");

    await user.type(screen.getByLabelText("Repeat"), "short-but-now-long");
    expect(match).toHaveTextContent("Both new passwords match (met)");
  });
});
