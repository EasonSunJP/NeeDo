import {
  appendCompensationBasis,
  readCompensationBasisVersion
} from "../src/services/compensation-basis";

describe("compensation basis snapshot", () => {
  it("adds an immutable rule identifier without removing the service snapshot", () => {
    expect(appendCompensationBasis({ name: "护理", priceAmount: 8_800 }, "shop_default:41"))
      .toEqual({
        name: "护理",
        priceAmount: 8_800,
        compensationBasisVersion: "shop_default:41"
      });
  });

  it("reads only supported persisted rule identifiers", () => {
    expect(readCompensationBasisVersion({ compensationBasisVersion: "technician_override:71" }))
      .toBe("technician_override:71");
    expect(readCompensationBasisVersion({ compensationBasisVersion: "active:71" })).toBeNull();
    expect(readCompensationBasisVersion(null)).toBeNull();
  });
});
