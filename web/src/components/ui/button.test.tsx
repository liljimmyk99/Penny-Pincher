import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

// Proves the shadcn/ui pipeline (the `@/` alias, cva and cn) works in tests (#166).
describe("Button", () => {
  it("renders a button with the default variant and size", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button).toHaveAttribute("data-size", "default");
  });

  it("applies a variant and merges a passed class over the variant's", () => {
    render(
      <Button variant="outline" size="sm" className="px-8">
        Cancel
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveAttribute("data-variant", "outline");
    expect(button).toHaveClass("h-8", "px-8");
    expect(button).not.toHaveClass("px-3");
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
