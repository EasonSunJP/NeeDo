import { buildMerchantNoticeRecipientWhere } from "../src/repositories/merchant-notice-audience";

describe("merchant notice audience predicates", () => {
  const now = new Date("2026-09-05T00:00:00.000Z");

  it("requires an active issued unexpired card for this shop's customer identities", () => {
    expect(buildMerchantNoticeRecipientWhere(11, { type: "shop_card_holders" }, now)).toEqual({
      type: "customer",
      isActive: true,
      deletedAt: null,
      user: {
        is: {
          isActive: true,
          deletedAt: null,
          customerProfile: {
            is: {
              deletedAt: null,
              shopMemberships: {
                some: {
                  shopId: 11,
                  status: "ACTIVE",
                  activeKey: { not: null },
                  startedAt: { lte: now },
                  deletedAt: null,
                  AND: [{ OR: [{ endedAt: null }, { endedAt: { gt: now } }] }],
                  cards: {
                    some: {
                      status: "ACTIVE",
                      issuedAt: { lte: now },
                      deletedAt: null,
                      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  it("targets every active identity owned by a current employee account", () => {
    expect(
      buildMerchantNoticeRecipientWhere(11, { type: "shop_employees" }, now)
    ).toMatchObject({
      isActive: true,
      deletedAt: null,
      user: {
        is: {
          isActive: true,
          deletedAt: null,
          shopEmployees: {
            some: {
              shopId: 11,
              status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
              startsAt: { lte: now },
              activeKey: { not: null },
              deletedAt: null,
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }]
            }
          }
        }
      }
    });
  });

  it("requires the employee's current technician role and linked current affiliation", () => {
    expect(
      buildMerchantNoticeRecipientWhere(11, { type: "shop_technicians" }, now)
    ).toMatchObject({
      isActive: true,
      deletedAt: null,
      user: {
        is: {
          isActive: true,
          deletedAt: null,
          technicianProfile: {
            is: {
              deletedAt: null,
              technicianShopAffiliations: {
                some: {
                  shopId: 11,
                  workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
                  startsAt: { lte: now },
                  activeKey: { not: null },
                  deletedAt: null,
                  AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  shopEmployee: {
                    is: {
                      shopId: 11,
                      status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
                      startsAt: { lte: now },
                      activeKey: { not: null },
                      deletedAt: null,
                      roleAssignments: {
                        some: {
                          startsAt: { lte: now },
                          activeKey: { not: null },
                          deletedAt: null,
                          shopEmployeeRole: {
                            isTechnicianRole: true,
                            deletedAt: null
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  });
});
