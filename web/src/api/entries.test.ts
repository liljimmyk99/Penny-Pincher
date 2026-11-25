import { exactMerchant, sameMerchantName } from "./entries";
import type { Schemas } from "./types";

const list = [
  { id: "1", name: "Corner Store" },
  { id: "2", name: "Corner Coffee" },
] as Schemas["Merchant"][];

describe("merchant matching", () => {
  it("treats names as the same when only case and surrounding spaces differ", () => {
    expect(sameMerchantName("Corner Store", "  corner STORE ")).toBe(true);
    expect(sameMerchantName("Corner Store", "Corner Stores")).toBe(false);
    expect(sameMerchantName("Corner  Store", "Corner Store")).toBe(false);
  });

  it("finds the exact merchant in a list, or none", () => {
    expect(exactMerchant(list, " corner coffee")).toBe(list[1]);
    expect(exactMerchant(list, "corner")).toBeNull();
    expect(exactMerchant(list, "   ")).toBeNull();
  });
});
