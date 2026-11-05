import { moveAmongUnlocked } from "./reorder";

const rows = [
  { id: "a", locked: false },
  { id: "b", locked: false },
  { id: "o", locked: true },
  { id: "c", locked: false },
];

describe("moveAmongUnlocked", () => {
  it("moves a row and keeps locked rows in place", () => {
    expect(moveAmongUnlocked(rows, "a", 2)).toEqual(["b", "c", "o", "a"]);
    expect(moveAmongUnlocked(rows, "c", 0)).toEqual(["c", "a", "o", "b"]);
  });

  it("returns null for no-op or out-of-range moves and locked rows", () => {
    expect(moveAmongUnlocked(rows, "a", 0)).toBeNull();
    expect(moveAmongUnlocked(rows, "a", -1)).toBeNull();
    expect(moveAmongUnlocked(rows, "a", 3)).toBeNull();
    expect(moveAmongUnlocked(rows, "o", 0)).toBeNull();
  });
});
