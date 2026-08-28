import { affiliateAllianceCreateBodySchema } from "../src/validators/affiliate-alliance.validator";

describe("affiliate alliance create validator", () => {
  it("accepts the exact create contract and trims user-entered text", () => {
    expect(
      affiliateAllianceCreateBodySchema.parse({
        name: "  东京美容联盟  ",
        description: "  面向东京地区  ",
        defaultPromoterShareBps: 8000
      })
    ).toEqual({
      name: "东京美容联盟",
      description: "面向东京地区",
      defaultPromoterShareBps: 8000
    });
    expect(
      affiliateAllianceCreateBodySchema.safeParse({
        name: "东京联盟",
        description: null,
        defaultPromoterShareBps: 0
      }).success
    ).toBe(true);
  });

  it.each([
    [{ name: "A", defaultPromoterShareBps: 8000 }],
    [{ name: " ", defaultPromoterShareBps: 8000 }],
    [{ name: "A".repeat(121), defaultPromoterShareBps: 8000 }],
    [{ name: "东京联盟", description: " ", defaultPromoterShareBps: 8000 }],
    [{ name: "东京联盟", description: "A".repeat(501), defaultPromoterShareBps: 8000 }],
    [{ name: "东京联盟", defaultPromoterShareBps: -1 }],
    [{ name: "东京联盟", defaultPromoterShareBps: 10001 }],
    [{ name: "东京联盟", defaultPromoterShareBps: 8000.5 }],
    [{ name: "东京联盟", defaultPromoterShareBps: 8000, ownerUserId: 7 }]
  ])("rejects invalid or unknown input %#", (input) => {
    expect(affiliateAllianceCreateBodySchema.safeParse(input).success).toBe(false);
  });
});
