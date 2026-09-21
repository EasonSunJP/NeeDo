import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ShopEmployeeDirectoryItem,
  ShopEmployeeDirectoryRepositoryInput,
  ShopEmployeeDirectoryRepositoryPort,
  ShopEmployeeDirectoryRole,
  ShopEmployeeDirectoryStatus
} from "../services/shop-employee-directory.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

const CURRENT_EMPLOYEE_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;
const CURRENT_TECHNICIAN_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;
const CURRENT_TECHNICIAN_STATUS_SET: ReadonlySet<string> = new Set(CURRENT_TECHNICIAN_STATUSES);

const employeeDirectorySelect = Prisma.validator<Prisma.ShopEmployeeSelect>()({
  status: true,
  startsAt: true,
  endsAt: true,
  user: {
    select: {
      needoId: true,
      username: true,
      avatarUrl: true,
      email: true,
      phone: true
    }
  },
  roleAssignments: {
    orderBy: [{ shopEmployeeRole: { code: "asc" } }],
    select: {
      startsAt: true,
      endsAt: true,
      activeKey: true,
      deletedAt: true,
      shopEmployeeRole: {
        select: {
          code: true,
          nameZhHans: true,
          nameZhHant: true,
          nameJa: true,
          nameEn: true,
          nameKo: true,
          isTechnicianRole: true,
          deletedAt: true
        }
      }
    }
  },
  technicianShopAffiliation: {
    select: {
      relationshipType: true,
      workStatus: true,
      startsAt: true,
      endsAt: true,
      activeKey: true,
      deletedAt: true,
      technicianProfile: {
        select: {
          displayName: true,
          deletedAt: true,
          mediaAssets: {
            where: { usageType: "avatar", isActive: true, deletedAt: null },
            orderBy: { id: "desc" },
            take: 1,
            select: { url: true }
          },
          user: {
            select: {
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
                    select: { publicId: true, kind: true, status: true, deletedAt: true }
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

type ShopEmployeeDirectoryRecord = Prisma.ShopEmployeeGetPayload<{
  select: typeof employeeDirectorySelect;
}>;

const currentEndWhere = (now: Date) => [{ endsAt: null }, { endsAt: { gt: now } }];

const currentRoleAssignmentWhere = (
  now: Date,
  roleWhere: Prisma.ShopEmployeeRoleWhereInput
): Prisma.ShopEmployeeRoleAssignmentWhereInput => ({
  startsAt: { lte: now },
  OR: currentEndWhere(now),
  activeKey: { not: null },
  deletedAt: null,
  shopEmployeeRole: {
    ...roleWhere,
    deletedAt: null
  }
});

const statusToDatabase = (
  status: ShopEmployeeDirectoryStatus
): "ACTIVE" | "ON_LEAVE" | "SUSPENDED" => {
  if (status === "on_leave") return "ON_LEAVE";
  if (status === "suspended") return "SUSPENDED";
  return "ACTIVE";
};

export class ShopEmployeeDirectoryRepository implements ShopEmployeeDirectoryRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async listCurrentShopEmployees(input: ShopEmployeeDirectoryRepositoryInput) {
    const now = this.clock();
    const where = this.currentEmployeeWhere(input, now);
    const pagination = toPrismaPagination(input);
    const [records, total] = await Promise.all([
      this.client.shopEmployee.findMany({
        where,
        orderBy: [{ user: { username: "asc" } }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: employeeDirectorySelect
      }),
      this.client.shopEmployee.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapEmployee(record, now)),
      total,
      input
    );
  }

  private currentEmployeeWhere(
    input: ShopEmployeeDirectoryRepositoryInput,
    now: Date
  ): Prisma.ShopEmployeeWhereInput {
    const and: Prisma.ShopEmployeeWhereInput[] = [{ OR: currentEndWhere(now) }];
    const keyword = input.keyword?.trim();
    if (keyword) {
      const roleNameWhere: Prisma.ShopEmployeeRoleWhereInput = {
        OR: [
          { code: { contains: keyword } },
          { nameZhHans: { contains: keyword } },
          { nameZhHant: { contains: keyword } },
          { nameJa: { contains: keyword } },
          { nameEn: { contains: keyword } },
          { nameKo: { contains: keyword } }
        ]
      };
      and.push({
        OR: [
          { user: { needoId: { contains: keyword } } },
          { user: { username: { contains: keyword } } },
          { user: { email: { contains: keyword } } },
          { user: { phone: { contains: keyword } } },
          {
            technicianShopAffiliation: {
              is: { technicianProfile: { displayName: { contains: keyword } } }
            }
          },
          {
            technicianShopAffiliation: {
              is: {
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
            }
          },
          { roleAssignments: { some: currentRoleAssignmentWhere(now, roleNameWhere) } }
        ]
      });
    }

    const where: Prisma.ShopEmployeeWhereInput = {
      shopId: input.shopId,
      status: input.status
        ? statusToDatabase(input.status)
        : { in: [...CURRENT_EMPLOYEE_STATUSES] },
      startsAt: { lte: now },
      activeKey: { not: null },
      deletedAt: null,
      shop: { status: { not: "archived" }, deletedAt: null },
      user: { isActive: true, deletedAt: null },
      AND: and
    };
    const roleCode = input.roleCode?.trim().toUpperCase();
    if (roleCode) {
      where.roleAssignments = {
        some: currentRoleAssignmentWhere(now, { code: roleCode })
      };
    }
    return where;
  }

  private mapEmployee(record: ShopEmployeeDirectoryRecord, now: Date): ShopEmployeeDirectoryItem {
    const roles = record.roleAssignments
      .filter(
        (assignment) =>
          assignment.activeKey !== null &&
          assignment.deletedAt === null &&
          assignment.shopEmployeeRole.deletedAt === null &&
          assignment.startsAt.getTime() <= now.getTime() &&
          (assignment.endsAt === null || assignment.endsAt.getTime() > now.getTime())
      )
      .map(
        (assignment): ShopEmployeeDirectoryRole => ({
          code: assignment.shopEmployeeRole.code,
          names: {
            zhHans: assignment.shopEmployeeRole.nameZhHans,
            zhHant: assignment.shopEmployeeRole.nameZhHant,
            ja: assignment.shopEmployeeRole.nameJa,
            en: assignment.shopEmployeeRole.nameEn,
            ko: assignment.shopEmployeeRole.nameKo
          },
          isTechnicianRole: assignment.shopEmployeeRole.isTechnicianRole
        })
      );
    const affiliation = record.technicianShopAffiliation;
    const technicianIdentifier =
      affiliation?.technicianProfile.user.identities[0]?.publicIdentifier ?? null;
    const technicianIsCurrent =
      affiliation !== null &&
      affiliation.activeKey !== null &&
      affiliation.deletedAt === null &&
      affiliation.technicianProfile.deletedAt === null &&
      CURRENT_TECHNICIAN_STATUS_SET.has(affiliation.workStatus) &&
      affiliation.startsAt.getTime() <= now.getTime() &&
      (affiliation.endsAt === null || affiliation.endsAt.getTime() > now.getTime()) &&
      technicianIdentifier?.kind === "S" &&
      technicianIdentifier.status === "ACTIVE" &&
      technicianIdentifier.deletedAt === null;

    return {
      needoId: record.user.needoId,
      displayName:
        technicianIsCurrent && affiliation
          ? affiliation.technicianProfile.displayName
          : record.user.username,
      avatarUrl:
        technicianIsCurrent && affiliation
          ? (affiliation.technicianProfile.mediaAssets[0]?.url ?? null)
          : record.user.avatarUrl,
      email: record.user.email,
      phone: record.user.phone,
      status: record.status.toLowerCase() as ShopEmployeeDirectoryStatus,
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt?.toISOString() ?? null,
      roles,
      technician:
        technicianIsCurrent && affiliation && technicianIdentifier
          ? {
              needoId: technicianIdentifier.publicId,
              relationshipType: "partner",
              workStatus: affiliation.workStatus.toLowerCase() as ShopEmployeeDirectoryStatus
            }
          : null
    };
  }
}
