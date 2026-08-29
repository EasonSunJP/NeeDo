import {
  affiliateAllianceCreateBodySchema,
  affiliateAllianceInvitationCreateBodySchema,
  affiliateAllianceInvitationIdParamSchema,
  affiliateAllianceInvitationListQuerySchema,
  affiliateAllianceInvitationRespondBodySchema,
  affiliateAllianceListQuerySchema
} from "../src/validators/affiliate-alliance.validator";

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

describe("affiliate alliance invitation validators", () => {
  it("normalizes paginated candidate search with safe defaults", () => {
    expect(affiliateAllianceListQuerySchema.parse({ q: "  山田  " })).toEqual({
      page: 1,
      pageSize: 20,
      q: "山田"
    });
    expect(
      affiliateAllianceListQuerySchema.parse({ page: "2", pageSize: "100" })
    ).toEqual({ page: 2, pageSize: 100 });
  });

  it("accepts only supported invitation status filters", () => {
    for (const status of ["pending", "accepted", "rejected", "expired"] as const) {
      expect(affiliateAllianceInvitationListQuerySchema.parse({ status })).toEqual({
        page: 1,
        pageSize: 20,
        status
      });
    }
    expect(
      affiliateAllianceInvitationListQuerySchema.safeParse({ status: "cancelled" }).success
    ).toBe(false);
  });

  it("enforces partner and subordinate parent combinations", () => {
    expect(
      affiliateAllianceInvitationCreateBodySchema.parse({
        inviteeNeedoId: "u0000000008",
        role: "partner"
      })
    ).toEqual({
      inviteeNeedoId: "u0000000008",
      role: "partner"
    });
    expect(
      affiliateAllianceInvitationCreateBodySchema.parse({
        inviteeNeedoId: "u0000000008",
        role: "subordinate",
        proposedParentMemberId: 91
      })
    ).toEqual({
      inviteeNeedoId: "u0000000008",
      role: "subordinate",
      proposedParentMemberId: 91
    });

    for (const input of [
      { inviteeNeedoId: "u0000000008", role: "partner", proposedParentMemberId: 91 },
      { inviteeNeedoId: "u0000000008", role: "subordinate" },
      { inviteeNeedoId: "s0000000008", role: "partner" },
      { inviteeNeedoId: "u8", role: "partner" },
      { inviteeNeedoId: "u0000000008", role: "owner" },
      { inviteeNeedoId: "u0000000008", role: "partner", userId: 8 }
    ]) {
      expect(affiliateAllianceInvitationCreateBodySchema.safeParse(input).success).toBe(false);
    }
  });

  it("accepts positive invitation IDs and strict empty response bodies", () => {
    expect(affiliateAllianceInvitationIdParamSchema.parse({ id: "71" })).toEqual({ id: 71 });
    expect(affiliateAllianceInvitationRespondBodySchema.parse({})).toEqual({});
    expect(affiliateAllianceInvitationIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(
      affiliateAllianceInvitationRespondBodySchema.safeParse({ allianceId: 42 }).success
    ).toBe(false);
  });

  it.each([
    { page: 0 },
    { pageSize: 101 },
    { q: "x".repeat(81) },
    { page: 1, unknown: true }
  ])("rejects invalid list input %#", (input) => {
    expect(affiliateAllianceListQuerySchema.safeParse(input).success).toBe(false);
  });
});
