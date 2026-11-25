import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders the default variant 44px tall", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button).toHaveAttribute("data-size", "default");
    expect(button).toHaveClass("h-11", "bg-primary", "hover:bg-primary-hover");
  });

  it("has a 3px focus ring of the ring colour", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveClass("focus-visible:ring-[3px]", "focus-visible:ring-ring/35");
  });

  it.each([
    ["success", "bg-success"],
    ["destructive", "bg-destructive"],
    ["outline", "border-input"],
    ["secondary", "bg-secondary"],
    ["ghost", "bg-transparent"],
  ] as const)("renders the %s variant", (variant, cls) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button")).toHaveClass(cls);
  });

  it("applies the small size and merges a passed class over the variant's", () => {
    render(
      <Button variant="outline" size="sm" className="px-8">
        Cancel
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveAttribute("data-variant", "outline");
    expect(button).toHaveClass("h-9", "px-8");
    expect(button).not.toHaveClass("px-3");
  });

  it("names an icon-only button with its aria-label", () => {
    render(
      <Button size="icon" aria-label="Delete row">
        <svg />
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Delete row" })).toHaveClass("size-11");
  });

  it("requires an aria-label on icon sizes (type check)", () => {
    // @ts-expect-error an icon-only button must have an aria-label
    const missing = <Button size="icon-sm" />;
    expect(missing).toBeTruthy();
  });

  it("activates with Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders its child element with asChild", () => {
    render(
      <Button asChild>
        <a href="/summary">Summary</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Summary" })).toHaveAttribute("data-slot", "button");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
