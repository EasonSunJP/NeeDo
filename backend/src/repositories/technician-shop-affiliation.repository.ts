import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliationMutationRepositoryInput,
  AffiliationMutationRepositoryResult,
  EmployeeListRepositoryInput,
  EmployeeProfileUpdateRepositoryInput,
  EmployeeRelationshipType,
  EmployeeWorkStatus,
  MerchantEmployeePayload,
  TechnicianShopAffiliationRepositoryPort
} from "../services/technician-shop-affiliation.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

const CURRENT_WORK_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;

const employeeAffiliationSelect = Prisma.validator<Prisma.TechnicianShopAffiliationSelect>()({
  id: true,
  relationshipType: true,
  workStatus: true,
  startsAt: true,
  endsAt: true,
  technicianProfile: {
    select: {
      displayName: true,
      bio: true,
      city: true,
      serviceArea: true,
      yearsExperience: true,
      status: true,
      verifiedAt: true,
      updatedAt: true,
      user: {
        select: {
          avatarUrl: true,
          email: true,
          phone: true,
          isActive: true,
          lastLoginAt: true,
          identities: {
            where: {
              type: "technician",
              isActive: true,
              deletedAt: null,
              publicIdentifier: {
                is: { kind: "S", status: "ACTIVE", deletedAt: null }
              }
            },
            orderBy: { id: "asc" },
            take: 1,
            select: {
              publicIdentifier: {
                select: { publicId: true, kind: true, status: true }
              }
            }
          }
        }
      }
    }
  },
  shop: {
    select: {
      id: true,
      name: true,
      publicIdentifier: {
        select: { publicId: true, kind: true, status: true }
      }
    }
  }
});

type EmployeeAffiliationRecord = Prisma.TechnicianShopAffiliationGetPayload<{
  select: typeof employeeAffiliationSelect;
}>;

const toRelationshipType = (value: EmployeeRelationshipType): "EXCLUSIVE" | "PARTNER" =>
  value === "exclusive" ? "EXCLUSIVE" : "PARTNER";

const toWorkStatus = (value: EmployeeWorkStatus): "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "ENDED" => {
  switch (value) {
    case "active":
      return "ACTIVE";
    case "on_leave":
      return "ON_LEAVE";
    case "suspended":
      return "SUSPENDED";
    case "ended":
      return "ENDED";
  }
};

export class TechnicianShopAffiliationRepository implements TechnicianShopAffiliationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listCurrentShopEmployees(
    input: EmployeeListRepositoryInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<MerchantEmployeePayload>>> {
    const pagination = toPrismaPagination(input);
    const where = this.currentEmployeeWhere(input.shopId);
    if (input.relationshipType) {
      where.relationshipType = toRelationshipType(input.relationshipType);
    }
    if (input.workStatus) {
      where.workStatus = toWorkStatus(input.workStatus);
    }
    if (input.keyword?.trim()) {
      const keyword = input.keyword.trim();
      where.AND = [
        {
          OR: [
            { technicianProfile: { displayName: { contains: keyword } } },
            { technicianProfile: { user: { email: { contains: keyword } } } },
            { technicianProfile: { user: { phone: { contains: keyword } } } },
            {
              technicianProfile: {
                user: {
                  identities: {
                    some: {
                      type: "technician",
                      isActive: true,
                      deletedAt: null,
                      publicIdentifier: {
                        is: {
                          publicId: { contains: keyword },
                          kind: "S",
                          status: "ACTIVE",
                          deletedAt: null
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      ];
    }

    const [records, total] = await Promise.all([
      this.client.technicianShopAffiliation.findMany({
        where,
        orderBy: [{ technicianProfile: { displayName: "asc" } }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: employeeAffiliationSelect
      }),
      this.client.technicianShopAffiliation.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapEmployee(record)),
      total,
      input
    );
  }

  public async findCurrentShopEmployee(
    shopId: number,
    technicianIdentityId: number
  ): Promise<MerchantEmployeePayload | null> {
    const record = await this.client.technicianShopAffiliation.findFirst({
      where: {
        ...this.currentEmployeeWhere(shopId),
        technicianProfile: {
          deletedAt: null,
          user: {
            isActive: true,
            deletedAt: null,
            identities: {
              some: {
                id: technicianIdentityId,
                type: "technician",
                isActive: true,
                deletedAt: null,
                publicIdentifier: {
                  is: { kind: "S", status: "ACTIVE", deletedAt: null }
                }
              }
            }
          }
        }
      },
      select: employeeAffiliationSelect
    });
    return record ? this.mapEmployee(record) : null;
  }

  public async updateCurrentShopEmployeeProfile(
    input: EmployeeProfileUpdateRepositoryInput
  ): Promise<MerchantEmployeePayload | null> {
    return this.client.$transaction(async (transaction) => {
      const identity = await transaction.userIdentity.findFirst({
        where: {
          id: input.technicianIdentityId,
          type: "technician",
          isActive: true,
          deletedAt: null,
          publicIdentifier: {
            is: { kind: "S", status: "ACTIVE", deletedAt: null }
          },
          user: { isActive: true, deletedAt: null }
        },
        select: {
          user: {
            select: {
              technicianProfile: {
                select: { id: true }
              }
            }
          }
        }
      });
      const technicianProfileId = identity?.user.technicianProfile?.id;
      if (!technicianProfileId) return null;

      const lockedProfiles = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM technician_profiles WHERE id = ${technicianProfileId} AND deleted_at IS NULL FOR UPDATE`
      );
      if (lockedProfiles.length !== 1) return null;

      const affiliation = await transaction.technicianShopAffiliation.findFirst({
        where: {
          shopId: input.shopId,
          technicianProfileId,
          activeKey: { not: null },
          workStatus: { in: [...CURRENT_WORK_STATUSES] },
          endsAt: null,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!affiliation) return null;

      await transaction.technicianProfile.update({
        where: { id: technicianProfileId },
        data: input.profile
      });
      const record = await transaction.technicianShopAffiliation.findFirst({
        where: { id: affiliation.id, ...this.currentEmployeeWhere(input.shopId) },
        select: employeeAffiliationSelect
      });
      return record ? this.mapEmployee(record) : null;
    });
  }

  public async upsertCurrentAffiliation(
    input: AffiliationMutationRepositoryInput
  ): Promise<AffiliationMutationRepositoryResult> {
    return this.client.$transaction(async (transaction) => {
      const identity = await transaction.userIdentity.findFirst({
        where: {
          id: input.technicianIdentityId,
          type: "technician",
          isActive: true,
          deletedAt: null,
          publicIdentifier: {
            is: { kind: "S", status: "ACTIVE", deletedAt: null }
          },
          user: { isActive: true, deletedAt: null }
        },
        select: {
          user: {
            select: {
              technicianProfile: {
                select: { id: true }
              }
            }
          }
        }
      });
      const technicianProfileId = identity?.user.technicianProfile?.id;
      if (!technicianProfileId) return "not_found";

      const lockedProfiles = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM technician_profiles WHERE id = ${technicianProfileId} AND deleted_at IS NULL FOR UPDATE`
      );
      if (lockedProfiles.length !== 1) return "not_found";

      const shop = await transaction.shop.findFirst({
        where: {
          id: input.shopId,
          status: { not: "archived" },
          deletedAt: null,
          publicIdentifier: {
            is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
          }
        },
        select: { id: true }
      });
      if (!shop) return "not_found";

      const currentAffiliations = await transaction.technicianShopAffiliation.findMany({
        where: {
          technicianProfileId,
          activeKey: { not: null },
          workStatus: { in: [...CURRENT_WORK_STATUSES] },
          endsAt: null,
          deletedAt: null
        },
        select: { id: true, shopId: true, relationshipType: true }
      });
      const currentShopAffiliation = currentAffiliations.find(
        (affiliation) => affiliation.shopId === input.shopId
      );

      if (input.workStatus === "ended") {
        if (!currentShopAffiliation) return "not_found";
        const record = await transaction.technicianShopAffiliation.update({
          where: { id: currentShopAffiliation.id },
          data: {
            workStatus: "ENDED",
            endsAt: input.endsAt,
            activeKey: null,
            updatedById: input.actorUserId
          },
          select: employeeAffiliationSelect
        });
        return this.mapEmployee(record);
      }

      const otherAffiliations = currentAffiliations.filter(
        (affiliation) => affiliation.shopId !== input.shopId
      );
      if (
        (input.relationshipType === "exclusive" && otherAffiliations.length > 0) ||
        (input.relationshipType === "partner" &&
          otherAffiliations.some((affiliation) => affiliation.relationshipType === "EXCLUSIVE"))
      ) {
        return "exclusive_conflict";
      }

      const data = {
        relationshipType: toRelationshipType(input.relationshipType),
        workStatus: toWorkStatus(input.workStatus),
        startsAt: input.startsAt,
        endsAt: null,
        activeKey: `technician:${technicianProfileId}:shop:${input.shopId}`,
        updatedById: input.actorUserId
      } as const;
      const record = currentShopAffiliation
        ? await transaction.technicianShopAffiliation.update({
            where: { id: currentShopAffiliation.id },
            data,
            select: employeeAffiliationSelect
          })
        : await transaction.technicianShopAffiliation.create({
            data: {
              technicianProfileId,
              shopId: input.shopId,
              createdById: input.actorUserId,
              ...data
            },
            select: employeeAffiliationSelect
          });
      return this.mapEmployee(record);
    });
  }

  private currentEmployeeWhere(shopId: number): Prisma.TechnicianShopAffiliationWhereInput {
    return {
      shopId,
      activeKey: { not: null },
      workStatus: { in: [...CURRENT_WORK_STATUSES] },
      endsAt: null,
      deletedAt: null,
      shop: {
        status: { not: "archived" },
        deletedAt: null,
        publicIdentifier: {
          is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
        }
      },
      technicianProfile: {
        deletedAt: null,
        user: {
          isActive: true,
          deletedAt: null,
          identities: {
            some: {
              type: "technician",
              isActive: true,
              deletedAt: null,
              publicIdentifier: {
                is: { kind: "S", status: "ACTIVE", deletedAt: null }
              }
            }
          }
        }
      }
    };
  }

  private mapEmployee(record: EmployeeAffiliationRecord): MerchantEmployeePayload {
    const technicianIdentifier = record.technicianProfile.user.identities[0]?.publicIdentifier;
    const shopIdentifier = record.shop.publicIdentifier;
    if (
      !technicianIdentifier ||
      technicianIdentifier.kind !== "S" ||
      technicianIdentifier.status !== "ACTIVE" ||
      !shopIdentifier ||
      shopIdentifier.kind !== "SHOP" ||
      shopIdentifier.status !== "ACTIVE"
    ) {
      throw new Error("Active employee affiliation is missing a canonical public identifier");
    }

    return {
      needoId: technicianIdentifier.publicId,
      displayName: record.technicianProfile.displayName,
      avatarUrl: record.technicianProfile.user.avatarUrl,
      email: record.technicianProfile.user.email,
      phone: record.technicianProfile.user.phone,
      profileStatus: record.technicianProfile.status,
      verifiedAt: record.technicianProfile.verifiedAt?.toISOString() ?? null,
      profile: {
        bio: record.technicianProfile.bio,
        city: record.technicianProfile.city,
        serviceArea: record.technicianProfile.serviceArea,
        yearsExperience: record.technicianProfile.yearsExperience,
        updatedAt: record.technicianProfile.updatedAt.toISOString()
      },
      account: {
        isActive: record.technicianProfile.user.isActive,
        lastLoginAt: record.technicianProfile.user.lastLoginAt?.toISOString() ?? null
      },
      affiliation: {
        id: record.id,
        relationshipType: record.relationshipType.toLowerCase() as EmployeeRelationshipType,
        workStatus: record.workStatus.toLowerCase() as EmployeeWorkStatus,
        startsAt: record.startsAt.toISOString(),
        endsAt: record.endsAt?.toISOString() ?? null,
        shop: {
          id: record.shop.id,
          publicId: shopIdentifier.publicId,
          name: record.shop.name
        }
      }
    };
  }
}
