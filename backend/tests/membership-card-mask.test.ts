import { maskMembershipCardNumber } from "../src/utils/membership-card-mask";

describe("maskMembershipCardNumber", () => {
  it.each([
    ["NMC-00112233445566778899AABB", "•••• •••• •••• AABB"],
    ["1234", "•••• •••• •••• 1234"],
    ["123", "••••"],
    ["", "••••"]
  ])("never exposes a prefix from %p", (cardNo, expected) => {
    expect(maskMembershipCardNumber(cardNo)).toBe(expected);
  });
});
