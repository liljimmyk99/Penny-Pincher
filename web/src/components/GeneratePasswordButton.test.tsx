import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { newPasswordRules } from "@/lib/password";
import { GeneratePasswordButton } from "./GeneratePasswordButton";

describe("GeneratePasswordButton", () => {
  it("hands a fresh password that meets the rules to the caller, and stores nothing", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const onGenerate = vi.fn();
    render(<GeneratePasswordButton onGenerate={onGenerate} />);
    const button = screen.getByRole("button", { name: "Generate" });
    expect(button).toHaveAttribute("type", "button");

    await userEvent.click(button);
    await userEvent.click(button);
    expect(onGenerate).toHaveBeenCalledTimes(2);
    const [first, second] = onGenerate.mock.calls.map(([p]) => p as string);
    expect(newPasswordRules({ next: first! }).every((r) => r.ok)).toBe(true);
    expect(first).not.toBe(second);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(first!);
    setItem.mockRestore();
  });
});
