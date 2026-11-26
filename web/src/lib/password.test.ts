import { describe, expect, it } from "vitest";
import { generatePassword, MIN_PASSWORD_LENGTH, newPasswordRules } from "./password";

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

describe("newPasswordRules", () => {
  const ok = (rules: { ok: boolean }[]) => rules.map((r) => r.ok);

  it("checks only the length when there is no current or repeat password", () => {
    expect(newPasswordRules({ next: "" })).toEqual([{ ok: false, label: `At least ${MIN_PASSWORD_LENGTH} characters` }]);
    expect(ok(newPasswordRules({ next: "x".repeat(MIN_PASSWORD_LENGTH - 1) }))).toEqual([false]);
    expect(ok(newPasswordRules({ next: "x".repeat(MIN_PASSWORD_LENGTH) }))).toEqual([true]);
  });

  it("needs a new password that differs from the current one and matches the repeat", () => {
    const labels = newPasswordRules({ next: "", current: "", repeat: "" }).map((r) => r.label);
    expect(labels).toEqual(["At least 12 characters", "Different from your current password", "Both new passwords match"]);
    // Empty fields never count as met, even though "" === "".
    expect(ok(newPasswordRules({ next: "", current: "", repeat: "" }))).toEqual([false, false, false]);
    expect(ok(newPasswordRules({ next: "same-old-password", current: "same-old-password", repeat: "other" }))).toEqual([
      true,
      false,
      false,
    ]);
    expect(ok(newPasswordRules({ next: "a-brand-new-password", current: "old", repeat: "a-brand-new-password" }))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("passes every generated password", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(newPasswordRules({ next: p, current: "a-current-password", repeat: p }).every((r) => r.ok)).toBe(true);
    }
  });
});
