import { describe, expect, it } from "vitest";
import { isPartyPackValueMeterRowComplete } from "./partyPackRules";

describe("party pack value meter", () => {
  it("requires both a number and a reason before counting a response", () => {
    expect(isPartyPackValueMeterRowComplete("理由", "42")).toBe(true);
    expect(isPartyPackValueMeterRowComplete("", "42")).toBe(false);
    expect(isPartyPackValueMeterRowComplete("理由", "")).toBe(false);
    expect(isPartyPackValueMeterRowComplete("  ", "  ")).toBe(false);
  });
});
