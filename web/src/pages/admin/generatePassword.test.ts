import { describe, expect, it } from "vitest";
import { generatePassword } from "./generatePassword";

describe("generatePassword", () => {
  it("is at least 12 characters with every class", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p.length).toBeGreaterThanOrEqual(12);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[-_.!@#%+=]/);
    }
  });
  it("never goes below 12 and differs between calls", () => {
    expect(generatePassword(4).length).toBe(12);
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
