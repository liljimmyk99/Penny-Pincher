import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MonthSwitcher } from "./MonthSwitcher";

function Harness({ initial, onChange }: { initial: string; onChange: (m: string) => void }) {
  const [month, setMonth] = useState(initial);
  return (
    <MonthSwitcher
      month={month}
      onChange={(m) => {
        onChange(m);
        setMonth(m);
      }}
    />
  );
}

function setup(initial = "2026-10") {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

describe("MonthSwitcher", () => {
  it("steps to the previous and next month, across a year", async () => {
    const { onChange, user } = setup("2026-01");
    await user.click(screen.getByRole("button", { name: "Previous month, December 2025" }));
    expect(onChange).toHaveBeenLastCalledWith("2025-12");
    await user.click(screen.getByRole("button", { name: "Next month, January 2026" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-01");
  });

  it("jumps to any month from the picker and returns focus to it", async () => {
    const { onChange, user } = setup();
    const trigger = screen.getByRole("button", { name: "Choose month, October 2026" });
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "October 2026" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Previous year, 2025" }));
    await user.click(screen.getByRole("button", { name: "March 2025" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("2025-03");
    expect(screen.queryByRole("button", { name: "March 2025" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose month, March 2025" })).toHaveFocus();
  });

  it("closes on Escape without changing the month, and reopens on the shown year", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("button", { name: "Choose month, October 2026" }));
    await user.click(screen.getByRole("button", { name: "Next year, 2027" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "January 2027" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Choose month, October 2026" }));
    expect(screen.getByRole("button", { name: "October 2026" })).toBeInTheDocument();
  });
});
