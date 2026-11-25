import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins classes and drops falsy ones", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets a later Tailwind class override a conflicting one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
