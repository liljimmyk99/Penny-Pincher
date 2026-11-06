import { changeTone, describeChange } from "./change";

describe("changeTone", () => {
  it("is worse when ordinary spending goes up and better when it goes down", () => {
    expect(changeTone(500, false)).toBe("worse");
    expect(changeTone(-500, false)).toBe("better");
  });

  it("flips for Saving: saving more is better, saving less is worse", () => {
    expect(changeTone(500, true)).toBe("better");
    expect(changeTone(-500, true)).toBe("worse");
  });

  it("is neutral when nothing changed", () => {
    expect(changeTone(0, false)).toBe("none");
    expect(changeTone(0, true)).toBe("none");
  });
});

describe("describeChange", () => {
  it("pairs the colour with an arrow, a sign and a percent", () => {
    expect(describeChange(11000, 10000)).toEqual({ tone: "worse", arrow: "▲", amount: "+$10.00", percent: "+10%" });
    expect(describeChange(9000, 10000)).toEqual({ tone: "better", arrow: "▼", amount: "−$10.00", percent: "−10%" });
  });

  it("flips the colour but not the arrow or sign for Saving", () => {
    expect(describeChange(11000, 10000, true)).toEqual({ tone: "better", arrow: "▲", amount: "+$10.00", percent: "+10%" });
    expect(describeChange(9000, 10000, true)).toEqual({ tone: "worse", arrow: "▼", amount: "−$10.00", percent: "−10%" });
  });

  it("has no percent without a previous amount, and no arrow without a change", () => {
    expect(describeChange(2500, 0).percent).toBeNull();
    expect(describeChange(0, 0)).toEqual({ tone: "none", arrow: "", amount: "$0.00", percent: null });
  });
});
