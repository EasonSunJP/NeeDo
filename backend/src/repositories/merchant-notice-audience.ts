import type { Prisma } from "@prisma/client";
import type { MerchantNoticeAudienceInput } from "../validators/official-notice.validator";

const currentEndWhere = (now: Date) => [{ endsAt: null }, { endsAt: { gt: now } }];

const currentAffiliationWhere = (
  shopId: number,
  now: Date
): Prisma.TechnicianShopAffiliationWhereInput => ({
  shopId,
  workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
  startsAt: { lte: now },
  AND: [{ OR: currentEndWhere(now) }],
  activeKey: { not: null },
  deletedAt: null
});

const currentEmployeeWhere = (
  shopId: number,
  now: Date
): Prisma.ShopEmployeeWhereInput => ({
  shopId,
  status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
  startsAt: { lte: now },
  AND: [{ OR: currentEndWhere(now) }],
  activeKey: { not: null },
  deletedAt: null
});

export function buildActiveMerchantNoticePublisherWhere(
  shopId: number,
  userId: number,
  now: Date
): Prisma.ShopEmployeeWhereInput {
  return {
    shopId,
    userId,
    status: "ACTIVE",
    startsAt: { lte: now },
    OR: currentEndWhere(now),
    activeKey: { not: null },
    deletedAt: null,
    shop: { status: { not: "archived" }, deletedAt: null },
    user: { isActive: true, deletedAt: null }
  };
}

export function buildMerchantNoticeRecipientWhere(
  shopId: number,
  audience: MerchantNoticeAudienceInput | MerchantNoticeAudienceInput["type"],
  now: Date
): Prisma.UserIdentityWhereInput {
  const audienceType = typeof audience === "string" ? audience : audience.type;
  const base: Prisma.UserIdentityWhereInput = {
    isActive: true,
    deletedAt: null
  };
  if (audienceType === "shop_card_holders") {
    return {
      ...base,
      type: "customer",
      user: {
        is: {
          isActive: true,
          deletedAt: null,
          customerProfile: {
            is: {
              deletedAt: null,
              shopMemberships: {
                some: {
                  shopId,
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
    };
  }

  const employeeWhere = currentEmployeeWhere(shopId, now);
  if (audienceType === "shop_technicians") {
    const affiliationWhere = currentAffiliationWhere(shopId, now);
    return {
      ...base,
      user: {
        is: {
          isActive: true,
          deletedAt: null,
          technicianProfile: {
            is: {
              deletedAt: null,
              technicianShopAffiliations: {
                some: {
                  ...affiliationWhere,
                  shopEmployee: {
                    is: {
                      ...employeeWhere,
                      roleAssignments: {
                        some: {
                          startsAt: { lte: now },
                          activeKey: { not: null },
                          deletedAt: null,
                          AND: [{ OR: currentEndWhere(now) }],
                          shopEmployeeRole: { isTechnicianRole: true, deletedAt: null }
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
    };
  }

  return {
    ...base,
    user: {
      is: {
        isActive: true,
        deletedAt: null,
        shopEmployees: {
          some: {
            ...employeeWhere
          }
        }
      }
    }
  };
}
