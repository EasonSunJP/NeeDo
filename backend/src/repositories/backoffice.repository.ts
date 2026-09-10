import { accountLogPagination } from "../domain/account-user-log";
import { buildManagedUserTierWhere } from "./managed-user-tier-filter";
import { projectWorkStatuses } from './work-status.repository';
import {
  BookingOrderStatus,
  OrderServiceEventType,
  OrderPerformanceOutcome,
  OrderPerformanceRevisionAction,
  OrderPerformanceTreatment,
  Prisma,
  PlatformMembershipTierCode,
  TechnicianEmploymentType,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { UserBootstrapKeyAllocator } from "../services/user-bootstrap-key.service";
import { IdentifierAllocator, formatPersonId } from "../services/public-identifier.service";
import { PublicIdentifierRepository } from "./public-identifier.repository";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError, createInternalError } from "../utils/app-error";
import { assertShopServiceQuota } from "../services/shop-service-policy";
import { resolveEffectiveCustomerMembershipLevel } from "../services/customer-membership.service";
import { LedgerCurrencyService } from "../services/ledger-currency.service";
import { persistIdentityAvatar } from "./identity-avatar.repository";
import type {
  DashboardAggregateFacts,
  DashboardAggregateInput,
  DashboardHeadlineSeriesPoint
} from "../domain/dashboard";
import { DashboardRepository } from "./dashboard.repository";
import { formatExperienceUnits } from "../domain/user-experience-levels";
import { buildManagedUserNumericPageQuery } from "./managed-user-numeric-sort";
import {
  AdministrativeRegionRepository,
  type AdministrativeRegionRepositoryPort,
  type VerifiedAdministrativeRegionScope
} from "./administrative-region.repository";
import {
  type BackofficeCsvExportPayload,
  type BackofficeAccountPayload,
  type BackofficeActivityAccount,
  type BackofficeAuditEventPayload,
  type BackofficeCompensationProfilePayload,
  type BackofficeCustomerPayload,
  type BackofficeCustomerDetailPayload,
  type BackofficeCustomerMembershipGrantContext,
  type BackofficeFinanceSettlementPayload,
  type BackofficeManagedUserDetailRecord,
  type BackofficeManagedUserPayload,
  type BackofficeNdpAggregate,
  type BackofficeOrderDetailPayload,
  type BackofficeOrderPayload,
  type BackofficeOrderTimelineEventPayload,
  type BackofficeRepositoryPort,
  type BackofficeScheduleSlotPayload,
  type BackofficeServicePayload,
  type BackofficeScope,
  type BackofficeShopCreateData,
  type BackofficeShopMutationContext,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload,
  type BackofficeTechnicianRankingPayload,
  type BackofficeTechnicianDetailPayload,
  type BackofficeTechnicianServiceDetailPayload,
  type ScopedEntityInput,
  type ScopedServiceCreateInput,
  type ScopedServiceUpdateInput,
  type ScopedTechnicianApprovalInput,
  type ScopedTechnicianUpdateInput,
  type TechnicianRankingRepositoryInput
} from "../services/backoffice.service";
import {
  AuditLogRepository,
  type AuditLogCreateInput,
  type TransactionAwareAuditLogRepositoryPort
} from "./audit-log.repository";
import type {
  BackofficeCustomerUpdateBody,
  BackofficeListQuery,
  BackofficeManagedUserListQuery,
  BackofficeManagedUserDetailQuery,
  BackofficeTimelineQuery,
  BackofficeShopUpdateBody
} from "../validators/backoffice.validator";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import { identifierNumberPartSchema } from "../validators/public-identifier.validator";

const managedUserAuditWhere = (input: BackofficeScope & Partial<BackofficeManagedUserDetailQuery>, userId: number): Prisma.AuditLogWhereInput => ({
      deletedAt: null,
      ...(input.audit_from && input.audit_to ? { createdAt: { gte: new Date(input.audit_from), lt: new Date(input.audit_to) } } : {}),
      ...(input.scope === "merchant"
        ? {
            targetType: "User",
            targetId: userId,
            metadata: { path: "$.shopId", equals: input.shopId }
          }
        : {
            OR: [
              { targetType: "User", targetId: userId },
              {
                targetType: {
                  in: [
                    "UserMembershipAdjustment",
                    "OrderReviewAmendment",
                    "OrderRefundAmendment",
                    "OrderTimelineComment",
                    "platform_partner_profile"
                  ]
                },
                metadata: { path: "$.userId", equals: userId }
              }
            ]
          })
    } satisfies Prisma.AuditLogWhereInput);

type DecimalLike = {
  toString: () => string;
};

interface TechnicianRankingDatabaseRow {
  technician_profile_id: number;
  user_id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  shop_id: number | null;
  shop_name: string | null;
  city: string;
  service_area: string | null;
  status: string;
  verified_at: Date | string | null;
  revenue_jpy: bigint | number | string | DecimalLike;
  completed_orders: bigint | number | string | DecimalLike;
  working_days: bigint | number | string | DecimalLike;
  ranking_position: bigint | number | string | DecimalLike;
  total_technicians: bigint | number | string | DecimalLike;
  total_revenue_jpy: bigint | number | string | DecimalLike;
  total_completed_orders: bigint | number | string | DecimalLike;
  total_working_days: bigint | number | string | DecimalLike;
}

interface LockedShopRow {
  id: number;
  shop_no: string | null;
  deleted_at: Date | null;
}

const PROFILE_DETAIL_SERVICE_LIMIT = 50;
const OPERATIONS_ROLE_CODES = ["admin", "operator", "finance", "support", "viewer"];

const visibleManagedIdentityScopeWhere = (scope: BackofficeScope) =>
  scope.scope === "merchant"
    ? {
        OR: [
          { scopeType: "shop", scopeId: scope.shopId },
          { scopeType: "customer_profile", type: "customer" }
        ]
      }
    : {};

const buildManagedUserSelect = (occurredAt: Date, scope: BackofficeScope) =>
  Prisma.validator<Prisma.UserSelect>()({
    id: true,
    needoId: true,
    username: true,
    email: true,
    phone: true,
    emailVerifiedAt: true,
    avatarUrl: true,
    avatarBootstrapUrl: true,
    isActive: true,
    isTestAccount: true,
    primaryIdentityType: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    identities: {
      where:
        scope.scope === "merchant"
          ? {
              deletedAt: null,
              ...visibleManagedIdentityScopeWhere(scope)
            }
          : { deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: {
        type: true, displayName: true, scopeType: true, scopeId: true, isActive: true,
        merchantIdentityProfile: { select: { displayName: true, deletedAt: true } }
      }
    },
    identityApplications: scope.scope === "platform" ? {
      where: { deletedAt: null, type: { in: ["technician", "merchant"] } },
      distinct: ["type"],
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 2,
      select: { type: true, status: true }
    } : false,
    userRoles: {
      where: {
        deletedAt: null,
        role: { deletedAt: null },
        ...(scope.scope === "merchant"
          ? {
              OR: [
                { scopeType: "shop", scopeId: scope.shopId },
                { scopeType: "customer_profile", role: { code: "customer" } }
              ]
            }
          : {})
      },
      orderBy: [{ roleId: "asc" }, { id: "asc" }],
      select: {
        scopeType: true,
        scopeId: true,
        role: {
          select: {
            code: true,
            name: true,
            rolePermissions: {
              where: { deletedAt: null, permission: { deletedAt: null } },
              select: { permission: { select: { code: true } } }
            }
          }
        }
      }
    },
    customerProfile: {
      select: {
        id: true,
        displayName: true,
        bio: true,
        city: true,
        gender: true,
        age: true,
        heightCm: true,
        languages: true,
        visibility: true,
        deletedAt: true
      }
    },
    technicianProfile: {
      select: { id: true, displayName: true, city: true, visibility: true, deletedAt: true }
    },
    ownedShops: { where: { deletedAt: null }, select: { id: true, name: true } },
    experienceAccount: {
      select: { currentLevel: true, totalExpUnits: true, deletedAt: true }
    },
    platformMembershipEntitlements: {
      where: {
        deletedAt: null,
        supersededAt: null,
        startsAt: { lte: occurredAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: occurredAt } }],
        tierVersion: {
          status: "PUBLISHED",
          deletedAt: null,
          effectiveFrom: { lte: occurredAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }],
          tier: { deletedAt: null }
        }
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        publicId: true,
        expiresAt: true,
        lockVersion: true,
        tierVersion: {
          select: {
            publicId: true,
            experienceMultiplier: true,
            tier: { select: { code: true } }
          }
        }
      }
    },
    membershipAdjustments: {
      where: {
        deletedAt: null,
        supersededAt: null,
        effectiveFrom: { lte: occurredAt }
      },
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        multiplierBps: true,
        lockVersion: true,
        tierVersion: {
          select: {
            publicId: true,
            experienceMultiplier: true,
            tier: { select: { code: true } }
          }
        }
      }
    },
    backofficeUserGroupMemberships: {
      where:
        scope.scope === "merchant"
          ? { AND: [{ deletedAt: null }, { deletedAt: { not: null } }] }
          : {
              deletedAt: null,
              group: { status: "ACTIVE", deletedAt: null }
            },
      select: { group: { select: { code: true } } }
    },
    ekycVerifications: {
      where: { deletedAt: null },
      orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
      take: 1,
      select: { status: true, verifiedAt: true }
    },
    externalAccounts: {
      where: { deletedAt: null },
      orderBy: [{ provider: "asc" }, { id: "asc" }],
      select: { provider: true }
    },
    _count: {
      select: {
        bookingOrders: {
          where: {
            deletedAt: null,
            ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {})
          }
        }
      }
    }
  });

type ManagedUserRecord = Prisma.UserGetPayload<{
  select: ReturnType<typeof buildManagedUserSelect>;
}>;

type TechnicianEmploymentPayload = BackofficeTechnicianPayload["employmentType"];

const employmentTypeFromDb = (value: TechnicianEmploymentType): TechnicianEmploymentPayload =>
  value === TechnicianEmploymentType.FULL_TIME
    ? "full_time"
    : value === TechnicianEmploymentType.TEMPORARY
      ? "temporary"
      : "independent";

const employmentTypeToDb: Record<TechnicianEmploymentPayload, TechnicianEmploymentType> = {
  independent: TechnicianEmploymentType.INDEPENDENT,
  full_time: TechnicianEmploymentType.FULL_TIME,
  temporary: TechnicianEmploymentType.TEMPORARY
};

type OrderRecord = Prisma.BookingOrderGetPayload<{
  include: {
    customer: {
      select: {
        username: true;
        email: true;
        customerProfile: {
          select: {
            id: true;
          };
        };
      };
    };
    service: true;
    shop: true;
    technicianProfile: {
      select: {
        displayName: true;
        user: {
          select: {
            identities: {
              select: {
                publicIdentifier: {
                  select: {
                    publicId: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

type OrderDetailRecord = OrderRecord & {
  statusHistory: Array<{
    id: number;
    bookingOrderId: number;
    fromStatus: BookingOrderStatus | null;
    toStatus: BookingOrderStatus;
    actorUserId: number | null;
    actor: { username: string; avatarUrl: string | null; avatarBootstrapUrl: string | null } | null;
    reason: string | null;
    createdAt: Date;
  }>;
  performanceAssessment: {
    id: number;
    bookingOrderId: number;
    technicianProfileId: number;
    outcome: OrderPerformanceOutcome;
    treatment: OrderPerformanceTreatment;
    version: number;
    currentRevisionId: number | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  performanceRevisions: Array<{
    id: number;
    action: OrderPerformanceRevisionAction;
    actorUserId: number | null;
    actor: { username: string; avatarUrl: string | null; avatarBootstrapUrl: string | null } | null;
    publicReason: string | null;
    internalNote: string | null;
    createdAt: Date;
  }>;
  serviceEvents: Array<{
    id: number;
    eventType: OrderServiceEventType;
    actorUserId: number | null;
    actor: { username: string; avatarUrl: string | null; avatarBootstrapUrl: string | null } | null;
    reason: string | null;
    occurredAt: Date;
    orderAddOn: {
      id: number;
      serviceId: number;
      serviceNameSnapshot: string;
      priceAmountJpy: number;
      currency: string;
      durationMinutes: number;
    } | null;
  }>;
};

type ScheduleSlotRecord = Prisma.ScheduleSlotGetPayload<{
  include: {
    service: true;
    shop: true;
    technicianProfile: true;
  };
}>;

type FinanceSettlementRecord = Prisma.OrderFinancialGetPayload<{
  include: {
    bookingOrder: {
      select: {
        id: true;
        orderNo: true;
        shopId: true;
        technicianProfileId: true;
        technicianProfile: {
          select: {
            displayName: true;
          };
        };
        shop: {
          select: {
            name: true;
          };
        };
        checkout: {
          select: {
            payableNdp: true;
          };
        };
      };
    };
  };
}>;

type TechnicianRecord = Prisma.TechnicianProfileGetPayload<{
  include: {
    user: {
      select: {
        needoId: true;
        email: true;
        avatarUrl: true;
        avatarBootstrapUrl: true;
        identities: {
          select: {
            publicIdentifier: {
              select: {
                publicId: true;
                kind: true;
              };
            };
          };
        };
      };
    };
    mediaAssets: true;
    shop: {
      select: {
        name: true;
      };
    };
  };
}>;

type ShopRecord = Prisma.ShopGetPayload<{
  include: {
    owner: {
      select: {
        email: true;
        avatarBootstrapUrl: true;
      };
    };
    mediaAssets: true;
  };
}>;

type CustomerRecord = Prisma.CustomerProfileGetPayload<{
  include: {
    user: {
      select: {
        email: true;
        _count: {
          select: {
            bookingOrders: true;
          };
        };
      };
    };
  };
}>;

type ServiceRecord = Prisma.ServiceGetPayload<{
  include: {
    category: {
      select: {
        name: true;
      };
    };
    shop: {
      select: {
        name: true;
      };
    };
  };
}>;

export class BackofficeRepository implements BackofficeRepositoryPort {
  private readonly dashboardRepository: DashboardRepository;
  private readonly administrativeRegionRepository: AdministrativeRegionRepositoryPort;
  private readonly auditLogRepository: TransactionAwareAuditLogRepositoryPort;

  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly bootstrapKeyAllocator = new UserBootstrapKeyAllocator(),
    private readonly createIdentifierAllocator = (client: Prisma.TransactionClient) =>
      new IdentifierAllocator(new PublicIdentifierRepository(client)),
    administrativeRegionRepository?: AdministrativeRegionRepositoryPort,
    auditLogRepository: TransactionAwareAuditLogRepositoryPort = new AuditLogRepository(client)
  ) {
    this.dashboardRepository = new DashboardRepository(client);
    this.administrativeRegionRepository =
      administrativeRegionRepository ?? new AdministrativeRegionRepository(client);
    this.auditLogRepository = auditLogRepository;
  }

  public async getDashboard(input: DashboardAggregateInput): Promise<DashboardAggregateFacts> {
    return this.dashboardRepository.getDashboard(input);
  }

  public async getHeadlineSeries3d(
    input: DashboardAggregateInput
  ): Promise<DashboardHeadlineSeriesPoint[]> {
    return this.dashboardRepository.getHeadlineSeries3d(input);
  }

  public async listManagedUsers(
    input: BackofficeScope & BackofficeManagedUserListQuery,
    occurredAt: Date
  ): Promise<PaginatedResponse<BackofficeManagedUserPayload>> {
    const pagination = toPrismaPagination(input);
    const where = await this.managedUserWhere(input, occurredAt);
    const loadRows = async () => {
      if (input.sortBy === "ndpBalance" || input.sortBy === "bookingCount") {
        const ordered = await this.client.$queryRaw<Array<{ id: number }>>(
          buildManagedUserNumericPageQuery(where, input, pagination.skip, pagination.take)
        );
        if (!ordered.length) return [];
        const pageRows = await this.client.user.findMany({
          where: { AND: [where, { id: { in: ordered.map((row) => row.id) } }] },
          select: buildManagedUserSelect(occurredAt, input),
          take: pagination.take
        });
        const positions = new Map(ordered.map((row, index) => [row.id, index]));
        return pageRows.sort((left, right) => positions.get(left.id)! - positions.get(right.id)!);
      }
      return this.client.user.findMany({
        where,
        select: buildManagedUserSelect(occurredAt, input),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: this.managedUserOrderBy(input)
      });
    };
    const [rows, total] = await Promise.all([
      loadRows(),
      this.client.user.count({ where })
    ]);
    const balances = await this.managedUserBalances(rows.map((row) => row.id));
    return buildPaginatedResponse(
      rows.map((row) => this.mapManagedUser(row, balances.get(`${row.id}:NDP`), input, balances.get(`${row.id}:TEST_NDP`))),
      total,
      input
    );
  }

  public async findActivityAccount(input: BackofficeScope & { subject: "users" | "technicians"; id: number }) {
    const user = input.subject === "technicians"
      ? (await this.client.technicianProfile.findFirst({
          where: { ...this.technicianMutationWhere(input, input.id), user: { deletedAt: null } },
          select: { user: { select: { id: true, username: true, avatarUrl: true, createdAt: true } } }
        }))?.user
      : await this.client.user.findFirst({
          where: { id: input.id, deletedAt: null, ...(input.scope === "merchant" ? { bookingOrders: { some: { shopId: input.shopId, deletedAt: null } } } : {}) },
          select: { id: true, username: true, avatarUrl: true, createdAt: true }
        });
    return user ? { id: user.id, displayName: user.username, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString() } : null;
  }

  public async getAccountAudit(input: BackofficeScope & { account: BackofficeActivityAccount } & BackofficeManagedUserDetailQuery) {
    const where = managedUserAuditWhere(input, input.account.id);
    const pagination = accountLogPagination(input.account, input);
    const [total, rows] = await Promise.all([
      this.client.auditLog.count({ where }),
      this.client.auditLog.findMany({ where, include: { actor: { select: { username: true, avatarUrl: true } } },
        skip: pagination.skip, take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    ]);
    return { total: total + pagination.extraTotal, page: input.audit_page, page_size: input.audit_page_size, list: [...pagination.origin, ...rows.map((row) => this.mapAuditEvent(row))] };
  }

  public async getManagedUser(
    input: BackofficeScope & { userId: number } & Partial<BackofficeManagedUserDetailQuery>,
    occurredAt: Date
  ): Promise<BackofficeManagedUserDetailRecord | null> {
    const { userId } = input;
    const user = await this.client.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        ...(input.scope === "merchant"
          ? { bookingOrders: { some: { shopId: input.shopId, deletedAt: null } } }
          : {})
      },
      select: buildManagedUserSelect(occurredAt, input)
    });
    if (!user) return null;
    const bookingWhere = {
      customerUserId: userId,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {}),
      deletedAt: null
    };
    const auditWhere = managedUserAuditWhere(input, userId);
    const auditPagination = accountLogPagination({ id: user.id, displayName: user.username, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString() }, input);
    const reviewWhere: Prisma.OrderReviewWhereInput | null = user.customerProfile
      ? {
          customerProfileId: user.customerProfile.id,
          deletedAt: null,
          bookingOrder: {
            status: BookingOrderStatus.COMPLETED,
            deletedAt: null,
            ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
          }
        }
      : null;
    const creditPromise: Promise<
      Array<{ rating: number; createdAt: Date; amendments: Array<{ rating: number | null }> }>
    > = reviewWhere
      ? this.client.orderReview.findMany({
          where: reviewWhere,
          select: {
            rating: true,
            createdAt: true,
            amendments: {
              where: { deletedAt: null },
              orderBy: [{ version: "desc" }, { id: "desc" }],
              take: 1,
              select: { rating: true }
            }
          }
        })
      : Promise.resolve([]);
    const [balances, totalBookings, completedBookings, completedSpend, credit, auditTotal, auditRows] =
      await Promise.all([
        this.managedUserBalances([userId]),
        this.client.bookingOrder.count({ where: bookingWhere }),
        this.client.bookingOrder.count({
          where: { ...bookingWhere, status: "COMPLETED" }
        }),
        this.client.bookingOrder.aggregate({
          where: {
            ...bookingWhere,
            status: "COMPLETED",
            paymentStatus: "CONFIRMED"
          },
          _sum: { paymentAmountJpy: true }
        }),
        creditPromise,
        this.client.auditLog.count({ where: auditWhere }),
        this.client.auditLog.findMany({
          where: auditWhere,
          include: { actor: { select: { username: true, avatarUrl: true } } },
          skip: auditPagination.skip,
          take: auditPagination.take,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        })
      ]);
    const summary = this.mapManagedUser(user, balances.get(`${userId}:NDP`), input, balances.get(`${userId}:TEST_NDP`));
    const effectiveRatings = credit.map((review) => review.amendments[0]?.rating ?? review.rating);
    const latestReviewAt = credit.reduce<Date | null>(
      (latest, review) => (!latest || review.createdAt > latest ? review.createdAt : latest),
      null
    );
    const customer = user.customerProfile?.deletedAt ? null : user.customerProfile;
    return {
      ...summary,
      profile: customer
        ? {
            displayName: customer.displayName,
            bio: customer.bio,
            city: customer.city,
            gender: customer.gender,
            age: customer.age,
            heightCm: customer.heightCm?.toString() ?? null,
            languages: Array.isArray(customer.languages) ? customer.languages : []
          }
        : null,
      account: {
        roles: this.visibleRoleAssignments(user, input).map((assignment) => ({
          code: assignment.role.code,
          name: assignment.role.name,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          permissions: assignment.role.rolePermissions.map((item) => item.permission.code).sort()
        }))
      },
      bookingSpend: {
        totalBookings,
        completedBookings,
        completedSpendJpy: completedSpend._sum.paymentAmountJpy ?? 0
      },
      metrics: {
        ndpAvailable: summary.ndpBalance.available,
        usageCount: totalBookings,
        credit: {
          ratingAverage:
            effectiveRatings.length > 0
              ? effectiveRatings.reduce((total, rating) => total + rating, 0) /
                effectiveRatings.length
              : 0,
          reviewCount: effectiveRatings.length,
          latestReviewAt: latestReviewAt?.toISOString() ?? null
        }
      },
      audit: {
        page: input.audit_page ?? 1,
        page_size: input.audit_page_size ?? 10,
        total: auditTotal + auditPagination.extraTotal,
        list: [...auditPagination.origin, ...auditRows.map((row) => this.mapAuditEvent(row))]
      }
    };
  }

  public async listOrders(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeOrderPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.orderWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        include: this.orderInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((order) => this.mapOrder(order)),
      total,
      input
    );
  }

  public async findOrderById(
    input: BackofficeScope & { id: number }
  ): Promise<BackofficeOrderDetailPayload | null> {
    const order = await this.client.bookingOrder.findFirst({
      where: {
        id: input.id,
        deletedAt: null,
        ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
      },
      include: this.orderDetailInclude()
    });

    return order ? this.mapOrderDetail(order, input.scope === "platform") : null;
  }

  public async listSchedule(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.scheduleWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where,
        include: this.scheduleInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.scheduleSlot.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((slot) => this.mapScheduleSlot(slot)),
      total,
      input
    );
  }

  public async listFinanceSettlements(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.financeWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.orderFinancial.findMany({
        where,
        include: this.financeInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.orderFinancial.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((settlement) => this.mapFinanceSettlement(settlement)),
      total,
      input
    );
  }

  public async exportFinanceSettlements(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<BackofficeCsvExportPayload> {
    const where: Prisma.OrderFinancialWhereInput = {
      ...this.financeWhere(input, input),
      ndpCurrency: "NDP"
    };
    const rows = await this.client.orderFinancial.findMany({
      where,
      include: this.financeInclude(),
      take: 1000,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const header = [
      "id",
      "orderType",
      "orderNo",
      "shopName",
      "status",
      "serviceIncomeStatus",
      "paymentChannel",
      "technicianProfileId",
      "technicianName",
      "estimatedServiceGmvJpy",
      "platformCollectedServiceAmountJpy",
      "offlineReportedServiceAmountJpy",
      "unknownOrUnreportedServiceAmountJpy",
      "platformNdpRevenue",
      "cRequestFeeHoldNdp",
      "cRequestFeeActualNdp",
      "requestFeeNdpRevenue",
      "userRewardNdpCost",
      "pendingHoldNdp",
      "campaignDiscountNdp",
      "releasedNdp",
      "penaltyNdp",
      "compensationToUserNdp",
      "technicianEstimatedIncomeJpy",
      "shopEstimatedGrossProfitJpy",
      "moneyTimelineStatus",
      "createdAt"
    ];
    const content = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          this.orderType(row.orderType),
          row.bookingOrder.orderNo,
          row.bookingOrder.shop.name,
          row.settlementStatus,
          row.serviceIncomeStatus,
          row.paymentChannel,
          row.technicianProfileId ?? "",
          row.bookingOrder.technicianProfile?.displayName ?? "",
          row.serviceAmountJpy,
          row.platformCollectedServiceAmountJpy,
          row.offlineReportedServiceAmountJpy,
          row.unknownOrUnreportedServiceAmountJpy,
          this.platformNdpRevenue(row),
          row.cRequestFeeHoldNdp,
          row.cRequestFeeActualNdp,
          row.cRequestFeeActualNdp,
          row.userRewardNdp,
          this.pendingHoldNdp(row),
          row.campaignDiscountNdp,
          row.releasedNdp,
          row.penaltyNdp,
          row.compensationToUserNdp,
          this.timelineAmount(row.moneyTimelineJson, "technician_income_estimated"),
          this.shopEstimatedGrossProfit(row),
          this.moneyTimelineStatus(row.serviceIncomeStatus),
          row.createdAt.toISOString()
        ].join(",")
      )
    ].join("\n");

    return {
      filename:
        input.scope === "merchant"
          ? `merchant-${input.shopId}-finance-settlements.csv`
          : "backoffice-finance-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content
    };
  }

  public async summarizeNdpByCurrency(input: {
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<BackofficeNdpAggregate[]> {
    const rows = await this.client.orderFinancial.groupBy({
      by: ["ndpCurrency"],
      where: {
        deletedAt: null,
        createdAt: {
          gte: input.fromInclusive,
          lt: input.toExclusive
        }
      },
      _sum: {
        bPlatformFeeActualNdp: true,
        cRequestFeeActualNdp: true,
        penaltyNdp: true,
        userRewardNdp: true,
        compensationToUserNdp: true,
        bPlatformFeeHoldNdp: true,
        cRequestFeeHoldNdp: true,
        releasedNdp: true,
        campaignDiscountNdp: true
      }
    });

    return rows.map((row) => ({
      ndpCurrency: LedgerCurrencyService.fromStored(row.ndpCurrency),
      bPlatformFeeActualNdp: row._sum.bPlatformFeeActualNdp ?? 0,
      cRequestFeeActualNdp: row._sum.cRequestFeeActualNdp ?? 0,
      penaltyNdp: row._sum.penaltyNdp ?? 0,
      userRewardNdp: row._sum.userRewardNdp ?? 0,
      compensationToUserNdp: row._sum.compensationToUserNdp ?? 0,
      bPlatformFeeHoldNdp: row._sum.bPlatformFeeHoldNdp ?? 0,
      cRequestFeeHoldNdp: row._sum.cRequestFeeHoldNdp ?? 0,
      releasedNdp: row._sum.releasedNdp ?? 0,
      campaignDiscountNdp: row._sum.campaignDiscountNdp ?? 0
    }));
  }

  public async listTechnicians(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeTechnicianPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.technicianWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.technicianProfile.findMany({
        where,
        include: this.technicianInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.technicianProfile.count({ where })
    ]);

    const statuses = await projectWorkStatuses(this.client, list.map(row => row.id));
    return buildPaginatedResponse(
      list.map((technician) => ({...this.mapTechnician(technician),workStatus:statuses.get(technician.id)!})),
      total,
      input
    );
  }

  public async listTechnicianRankings(
    input: TechnicianRankingRepositoryInput
  ): Promise<BackofficeTechnicianRankingPayload> {
    const pagination = toPrismaPagination(input);
    const filters: Prisma.Sql[] = [
      Prisma.sql`profile.deleted_at IS NULL`,
      Prisma.sql`account.deleted_at IS NULL`,
      Prisma.sql`booking.deleted_at IS NULL`,
      Prisma.sql`booking.status = ${"completed"}`,
      Prisma.sql`booking.payment_status <> ${"refunded"}`
    ];
    if (input.window.fromInclusive) {
      filters.push(Prisma.sql`booking.ends_at >= ${input.window.fromInclusive}`);
    }
    if (input.window.toExclusive) {
      filters.push(Prisma.sql`booking.ends_at < ${input.window.toExclusive}`);
    }
    if (input.keyword) {
      const keyword = `%${input.keyword}%`;
      filters.push(
        Prisma.sql`(
          profile.display_name LIKE ${keyword}
          OR account.email LIKE ${keyword}
          OR shop.name LIKE ${keyword}
        )`
      );
    }
    const scopedShopId = input.shopId;
    if (scopedShopId) {
      filters.push(Prisma.sql`profile.shop_id = ${scopedShopId}`);
    }
    if (input.city) {
      filters.push(Prisma.sql`profile.city = ${input.city}`);
    }
    const orderDirection = input.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const orderBy = {
      revenue: Prisma.sql`revenue_jpy ${orderDirection}, completed_orders DESC, working_days DESC, technician_profile_id ASC`,
      completedOrders: Prisma.sql`completed_orders ${orderDirection}, revenue_jpy DESC, working_days DESC, technician_profile_id ASC`,
      workingDays: Prisma.sql`working_days ${orderDirection}, revenue_jpy DESC, completed_orders DESC, technician_profile_id ASC`
    }[input.sortBy];
    const technicianTotals = Prisma.sql`
      WITH technician_totals AS (
        SELECT
          profile.id AS technician_profile_id,
          profile.user_id AS user_id,
          profile.display_name AS display_name,
          account.email AS email,
          account.avatar_url AS avatar_url,
          profile.shop_id AS shop_id,
          shop.name AS shop_name,
          profile.city AS city,
          profile.service_area AS service_area,
          profile.status AS status,
          profile.verified_at AS verified_at,
          COALESCE(SUM(financial.service_amount_jpy), 0) AS revenue_jpy,
          COUNT(DISTINCT booking.id) AS completed_orders,
          COUNT(DISTINCT DATE(DATE_ADD(booking.ends_at, INTERVAL 9 HOUR))) AS working_days
        FROM technician_profiles AS profile
        INNER JOIN users AS account ON account.id = profile.user_id
        LEFT JOIN shops AS shop ON shop.id = profile.shop_id AND shop.deleted_at IS NULL
        INNER JOIN booking_orders AS booking ON booking.technician_profile_id = profile.id
        LEFT JOIN order_financials AS financial
          ON financial.booking_order_id = booking.id
          AND financial.deleted_at IS NULL
        WHERE ${Prisma.join(filters, " AND ")}
        GROUP BY
          profile.id,
          profile.user_id,
          profile.display_name,
          account.email,
          account.avatar_url,
          profile.shop_id,
          shop.name,
          profile.city,
          profile.service_area,
          profile.status,
          profile.verified_at
      )
    `;
    const rows = await this.client.$queryRaw<TechnicianRankingDatabaseRow[]>(Prisma.sql`
      ${technicianTotals}
      SELECT
        technician_totals.*,
        ROW_NUMBER() OVER (
          ORDER BY ${orderBy}
        ) AS ranking_position,
        COUNT(*) OVER () AS total_technicians,
        COALESCE(SUM(revenue_jpy) OVER (), 0) AS total_revenue_jpy,
        COALESCE(SUM(completed_orders) OVER (), 0) AS total_completed_orders,
        COALESCE(SUM(working_days) OVER (), 0) AS total_working_days
      FROM technician_totals
      ORDER BY ${orderBy}
      LIMIT ${pagination.take} OFFSET ${pagination.skip}
    `);

    const first = rows[0];
    const summary =
      first ??
      (
        await this.client.$queryRaw<
          Array<
            Pick<
              TechnicianRankingDatabaseRow,
              | "total_technicians"
              | "total_revenue_jpy"
              | "total_completed_orders"
              | "total_working_days"
            >
          >
        >(Prisma.sql`
          ${technicianTotals}
          SELECT
            COUNT(*) AS total_technicians,
            COALESCE(SUM(revenue_jpy), 0) AS total_revenue_jpy,
            COALESCE(SUM(completed_orders), 0) AS total_completed_orders,
            COALESCE(SUM(working_days), 0) AS total_working_days
          FROM technician_totals
        `)
      )[0];
    return {
      list: rows.map((row) => ({
        rank: this.toNumber(row.ranking_position),
        technicianProfileId: row.technician_profile_id,
        userId: row.user_id,
        displayName: row.display_name,
        email: row.email,
        avatarUrl: row.avatar_url,
        shopId: row.shop_id,
        shopName: row.shop_name,
        city: row.city,
        serviceArea: row.service_area,
        status: row.status,
        verifiedAt:
          row.verified_at instanceof Date
            ? row.verified_at.toISOString()
            : row.verified_at
              ? new Date(row.verified_at).toISOString()
              : null,
        completedServiceAmountJpy: this.toNumber(row.revenue_jpy),
        completedOrderCount: this.toNumber(row.completed_orders),
        workingDayCount: this.toNumber(row.working_days)
      })),
      summary: {
        technicianCount: this.toNumber(summary?.total_technicians),
        completedServiceAmountJpy: this.toNumber(summary?.total_revenue_jpy),
        completedOrderCount: this.toNumber(summary?.total_completed_orders),
        workingDayCount: this.toNumber(summary?.total_working_days)
      },
      total: this.toNumber(summary?.total_technicians),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  }

  public async getTechnicianDetail(
    input: ScopedEntityInput
  ): Promise<BackofficeTechnicianDetailPayload | null> {
    const profile = await this.client.technicianProfile.findFirst({
      where: {
        ...this.technicianMutationWhere(input, input.id),
        user: this.formalTechnicianUserWhere()
      },
      include: this.technicianDetailInclude(input)
    });
    if (!profile) return null;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysFromMonday = (dayStart.getUTCDay() + 6) % 7;
    const weekStart = new Date(dayStart.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const scheduleWindowStart = weekStart < monthStart ? weekStart : monthStart;
    const scheduleWindowEnd = weekEnd > monthEnd ? weekEnd : monthEnd;
    const bookingWhere = {
      deletedAt: null,
      technicianProfileId: profile.id,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    } satisfies Prisma.BookingOrderWhereInput;
    const scheduleWhere = {
      deletedAt: null,
      technicianProfileId: profile.id,
      startsAt: { lt: scheduleWindowEnd },
      endsAt: { gt: scheduleWindowStart },
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    } satisfies Prisma.ScheduleSlotWhereInput;
    const [
      statusGroups,
      completedRevenue,
      monthSlots,
      upcomingSlots,
      technicianServices,
      legacyServices,
      compensationProfile,
      auditRows
    ] = await Promise.all([
      this.client.bookingOrder.groupBy({
        by: ["status"],
        where: bookingWhere,
        _count: { _all: true }
      }),
      this.client.bookingOrder.aggregate({
        where: { ...bookingWhere, status: "COMPLETED" },
        _sum: { priceAmount: true }
      }),
      this.client.scheduleSlot.findMany({
        where: scheduleWhere,
        select: { startsAt: true, endsAt: true }
      }),
      this.client.scheduleSlot.findMany({
        where: {
          deletedAt: null,
          technicianProfileId: profile.id,
          startsAt: { gte: now },
          ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
        },
        include: this.scheduleInclude(),
        take: 12,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.findMany({
        where: {
          technicianId: profile.id,
          isActive: true,
          deletedAt: null,
          ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
        },
        select: {
          id: true,
          sourceShopServiceId: true,
          name: true,
          description: true,
          categoryId: true,
          priceAmount: true,
          currency: true,
          durationMinutes: true,
          isRecommended: true
        },
        take: PROFILE_DETAIL_SERVICE_LIMIT + 1,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.service.findMany({
        where: {
          technicianProfileId: profile.id,
          status: "published",
          deletedAt: null,
          ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
        },
        select: {
          id: true,
          name: true,
          description: true,
          categoryId: true,
          priceAmount: true,
          currency: true,
          durationMinutes: true,
          isRecommended: true
        },
        take: PROFILE_DETAIL_SERVICE_LIMIT + 1,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianCompensationProfile.findFirst({
        where: {
          technicianProfileId: profile.id,
          status: "active",
          deletedAt: null,
          ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
        },
        orderBy: [{ version: "desc" }, { id: "desc" }]
      }),
      this.findScopedAuditEvents(input, profile.id, profile.userId, "technician")
    ]);

    const statusTotals = this.statusTotals(statusGroups);
    const mergedServices = this.mergeTechnicianServices(technicianServices, legacyServices);
    const servicesTruncated =
      technicianServices.length > PROFILE_DETAIL_SERVICE_LIMIT ||
      legacyServices.length > PROFILE_DETAIL_SERVICE_LIMIT ||
      mergedServices.length > PROFILE_DETAIL_SERVICE_LIMIT;
    const services = mergedServices.slice(0, PROFILE_DETAIL_SERVICE_LIMIT);
    const technician = this.mapTechnician(profile);

    return {
      ...technician,
      workStatus:(await projectWorkStatuses(this.client,[profile.id])).get(profile.id)!,
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      isRecommended: profile.isRecommended,
      updatedAt: profile.updatedAt.toISOString(),
      account: this.mapAccount(profile.user, input, "technician", technician.needoId),
      statistics: {
        bookingCount: Object.values(statusTotals).reduce((total, count) => total + count, 0),
        completedCount: statusTotals.completed ?? 0,
        cancelledCount: statusTotals.cancelled ?? 0,
        completedRevenueJpy: this.toNumber(completedRevenue._sum.priceAmount),
        ...this.scheduleMinutes(monthSlots, now, monthStart, monthEnd)
      },
      reviewSummary: this.mapDetailReviewSummary(profile.reviewSummary),
      services,
      servicesLimit: PROFILE_DETAIL_SERVICE_LIMIT,
      servicesTruncated,
      upcomingSchedule: upcomingSlots.map((slot) => this.mapScheduleSlot(slot)),
      compensationProfile: compensationProfile
        ? this.mapCompensationProfile(compensationProfile)
        : null,
      timeline: this.mergeProfileTimeline(auditRows, profile.createdAt, profile.verifiedAt),
      unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
    };
  }

  public async getCustomerDetail(
    input: ScopedEntityInput
  ): Promise<BackofficeCustomerDetailPayload | null> {
    const profile = await this.client.customerProfile.findFirst({
      where: { ...this.customerWhere(input, {}), id: input.id },
      include: this.customerDetailInclude(input)
    });
    if (!profile) return null;

    const now = new Date();
    const bookingWhere = {
      deletedAt: null,
      customerUserId: profile.userId,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    } satisfies Prisma.BookingOrderWhereInput;
    const [statusGroups, completedSpend, recentBookings, nextBookings, auditRows] =
      await Promise.all([
        this.client.bookingOrder.groupBy({
          by: ["status"],
          where: bookingWhere,
          _count: { _all: true }
        }),
        this.client.bookingOrder.aggregate({
          where: { ...bookingWhere, status: "COMPLETED" },
          _sum: { priceAmount: true }
        }),
        this.client.bookingOrder.findMany({
          where: bookingWhere,
          include: this.orderInclude(),
          take: 10,
          orderBy: [{ startsAt: "desc" }, { id: "desc" }]
        }),
        this.client.bookingOrder.findMany({
          where: {
            ...bookingWhere,
            status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] },
            startsAt: { gte: now }
          },
          include: this.orderInclude(),
          take: 1,
          orderBy: [{ startsAt: "asc" }, { id: "asc" }]
        }),
        this.findScopedAuditEvents(input, profile.id, profile.userId, "customer")
      ]);
    const bookingStatusTotals = this.statusTotals(statusGroups);

    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      email: profile.user.email,
      city: profile.city,
      membershipLevel: resolveEffectiveCustomerMembershipLevel(profile),
      membershipGrantMode:
        profile.membershipGrantMode.toLowerCase() as BackofficeCustomerDetailPayload["membershipGrantMode"],
      membershipDurationUnit: profile.membershipDurationUnit
        ? (profile.membershipDurationUnit.toLowerCase() as BackofficeCustomerDetailPayload["membershipDurationUnit"])
        : null,
      membershipDurationValue: profile.membershipDurationValue,
      membershipStartsAt: profile.membershipStartsAt?.toISOString() ?? null,
      membershipExpiresAt: profile.membershipExpiresAt?.toISOString() ?? null,
      membershipGrantedBy: profile.membershipGrantedBy
        ? {
            needoId: profile.membershipGrantedBy.needoId,
            username: profile.membershipGrantedBy.username
          }
        : null,
      isPublic: profile.isPublic,
      bookingCount: Object.values(bookingStatusTotals).reduce((total, count) => total + count, 0),
      createdAt: profile.createdAt.toISOString(),
      bio: profile.bio,
      updatedAt: profile.updatedAt.toISOString(),
      account: this.mapAccount(profile.user, input, "customer"),
      bookingStatusTotals,
      completedSpendJpy: this.toNumber(completedSpend._sum.priceAmount),
      nextBooking: nextBookings[0] ? this.mapOrder(nextBookings[0]) : null,
      recentBookings: recentBookings.map((booking) => this.mapOrder(booking)),
      reviewSummary: this.mapDetailReviewSummary(profile.reviewSummary),
      timeline: this.mergeProfileTimeline(auditRows, profile.createdAt)
    };
  }

  public async listShops(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeShopPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.shopWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        include: this.shopInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.shop.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((shop) => this.mapShop(shop)),
      total,
      input
    );
  }

  public async findUserByEmail(email: string): Promise<{ id: number } | null> {
    return this.client.user.findUnique({ where: { email }, select: { id: true } });
  }

  public createShop(input: BackofficeShopCreateData): Promise<BackofficeShopPayload> {
    return this.bootstrapKeyAllocator.withNewKey((bootstrapKey) =>
      this.client.$transaction(async (transaction) => {
        const verifiedScope = await this.resolveServiceLocation(input, transaction);
        if (verifiedScope && (!input.verifiedById || !input.serviceLocationAudit)) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.administrative_region.verifier_required",
            statusCode: 400
          });
        }
        const roles = await transaction.role.findMany({
          where: { code: { in: ["customer", "merchant_owner"] }, deletedAt: null },
          select: { id: true, code: true }
        });
        const customerRole = roles.find((role) => role.code === "customer");
        const merchantRole = roles.find((role) => role.code === "merchant_owner");
        if (!customerRole || !merchantRole) {
          throw new Error("Registration roles are missing: customer or merchant_owner");
        }
        const owner = await transaction.user.create({
          data: {
            needoId: bootstrapKey,
            email: input.ownerEmail,
            emailVerifiedAt: new Date(),
            passwordHash: input.ownerPasswordHash,
            username: input.ownerUsername,
            isActive: false
          }
        });
        const customerProfile = await transaction.customerProfile.create({
          data: { userId: owner.id, displayName: input.ownerUsername }
        });
        await transaction.userExperienceAccount.create({
          data: { userId: owner.id, currentLevel: 1, totalExpUnits: 0n }
        });
        const customerIdentity = await transaction.userIdentity.create({
          data: {
            userId: owner.id,
            type: "customer",
            scopeType: "customer_profile",
            scopeId: customerProfile.id,
            displayName: input.ownerUsername,
            isDefault: true,
            isActive: true
          }
        });
        const primaryIdentifier = await this.createIdentifierAllocator(transaction).allocate({
          kind: "U",
          userIdentityId: customerIdentity.id
        });
        await transaction.user.update({
          where: { id: owner.id },
          data: { needoId: primaryIdentifier.publicId }
        });
        await transaction.userRole.create({
          data: {
            userId: owner.id,
            roleId: customerRole.id,
            scopeType: "customer_profile",
            scopeId: customerProfile.id
          }
        });
        const shop = await transaction.shop.create({
          data: {
            ownerUserId: owner.id,
            createdById: input.createdById,
            name: input.name,
            description: input.description ?? null,
            city: input.city,
            address: input.address,
            phone: input.phone ?? null,
            status: "pending_review",
            isRecommended: input.isRecommended ?? false
          }
        });
        if (verifiedScope) {
          const shopNo = await this.provisionShopPublicNumber(transaction, shop.id, shop.name);
          await this.upsertShopServiceLocation(
            transaction,
            shop.id,
            verifiedScope,
            input.verifiedById
          );
          await this.persistServiceLocationAudit(transaction, input.serviceLocationAudit, shopNo);
        }
        const merchantIdentity = await transaction.userIdentity.create({
          data: {
            userId: owner.id,
            type: "merchant_owner",
            scopeType: "shop",
            scopeId: shop.id,
            displayName: input.ownerUsername,
            isDefault: false,
            isActive: false
          }
        });
        await new PublicIdentifierRepository(transaction).createIdentifier({
          publicId: formatPersonId("B", primaryIdentifier.numberPart),
          numberPart: primaryIdentifier.numberPart,
          kind: "B",
          userIdentityId: merchantIdentity.id,
          loginAllowed: true,
          searchable: true
        });
        await transaction.merchantIdentityProfile.create({
          data: {
            userId: owner.id,
            identityId: merchantIdentity.id,
            displayName: input.ownerUsername,
            languages: []
          }
        });
        await transaction.userRole.create({
          data: {
            userId: owner.id,
            roleId: merchantRole.id,
            scopeType: "shop",
            scopeId: shop.id
          }
        });
        const record = await transaction.shop.findFirst({
          where: { id: shop.id, deletedAt: null },
          include: this.shopInclude()
        });
        if (!record) {
          throw new Error("Created shop could not be reloaded");
        }
        return this.mapShop(record);
      })
    );
  }

  public async updateShop(
    id: number,
    input: BackofficeShopUpdateBody,
    mutation?: BackofficeShopMutationContext
  ): Promise<BackofficeShopPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const [existing] = await transaction.$queryRaw<LockedShopRow[]>(Prisma.sql`
        SELECT id, shop_no, deleted_at
        FROM shops
        WHERE id = ${id}
        FOR UPDATE
      `);
      if (!existing || existing.deleted_at !== null) return null;
      const verifiedScope = await this.resolveServiceLocation(input, transaction);
      let publicShopNo: string | undefined;
      if (verifiedScope) {
        publicShopNo = this.requirePublicShopNumber(existing.shop_no);
        if (!mutation?.verifiedById) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.administrative_region.verifier_required",
            statusCode: 400
          });
        }
      }
      const shopFields = { ...input };
      delete shopFields.serviceCountryCode;
      delete shopFields.serviceAdmin1Code;
      delete shopFields.serviceAdmin2Code;
      if (Object.keys(shopFields).length > 0) {
        await transaction.shop.update({ where: { id }, data: shopFields });
      }
      if (verifiedScope && mutation?.verifiedById && publicShopNo) {
        await this.upsertShopServiceLocation(transaction, id, verifiedScope, mutation.verifiedById);
        await this.persistServiceLocationAudit(
          transaction,
          mutation.serviceLocationAudit,
          publicShopNo
        );
      }
      return this.mapShop(
        await transaction.shop.findUniqueOrThrow({
          where: { id },
          include: this.shopInclude()
        })
      );
    });
  }

  public async updateMerchantShopProfile(input: {
    avatar?: { mimeType: string; url: string };
    fields: BackofficeShopUpdateBody;
    identityId: number;
    shopId: number;
    userId: number;
  }): Promise<BackofficeShopPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.shop.findFirst({
        where: { id: input.shopId, deletedAt: null },
        select: { id: true }
      });
      if (!existing) return null;

      if (Object.keys(input.fields).length > 0) {
        await transaction.shop.update({
          where: { id: input.shopId },
          data: input.fields
        });
      }
      if (input.avatar) {
        await persistIdentityAvatar(transaction, {
          avatar: input.avatar,
          capturedAt: new Date(),
          identityId: input.identityId,
          source: { kind: "shop", shopId: input.shopId },
          userId: input.userId
        });
      }

      return this.mapShop(
        await transaction.shop.findUniqueOrThrow({
          where: { id: input.shopId },
          include: this.shopInclude()
        })
      );
    });
  }

  public approveShop(id: number, approvedAt: Date): Promise<BackofficeShopPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.shop.findFirst({ where: { id, deletedAt: null } });
      if (!existing) return null;
      const shop = await transaction.shop.update({
        where: { id },
        data: { status: "published", updatedAt: approvedAt },
        include: this.shopInclude()
      });
      if (shop.ownerUserId) {
        await transaction.user.update({
          where: { id: shop.ownerUserId },
          data: { isActive: true }
        });
        await transaction.userIdentity.updateMany({
          where: { userId: shop.ownerUserId, scopeType: "shop", scopeId: shop.id, deletedAt: null },
          data: { isActive: true }
        });
      }
      return this.mapShop(shop);
    });
  }

  public softDeleteShop(id: number): Promise<BackofficeShopPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.shop.findFirst({ where: { id, deletedAt: null } });
      if (!existing) return null;
      const deletedAt = new Date();
      const shop = await transaction.shop.update({
        where: { id },
        data: { status: "archived", deletedAt },
        include: this.shopInclude()
      });
      await transaction.service.updateMany({
        where: { shopId: shop.id, deletedAt: null },
        data: { status: "archived", deletedAt }
      });
      if (shop.ownerUserId) {
        await transaction.user.update({
          where: { id: shop.ownerUserId },
          data: { isActive: false }
        });
        await transaction.userIdentity.updateMany({
          where: { userId: shop.ownerUserId, scopeType: "shop", scopeId: shop.id, deletedAt: null },
          data: { isActive: false }
        });
      }
      return this.mapShop(shop);
    });
  }

  public async updateTechnician(
    input: ScopedTechnicianUpdateInput
  ): Promise<BackofficeTechnicianPayload | null> {
    const existing = await this.client.technicianProfile.findFirst({
      where: this.technicianMutationWhere(input, input.technicianId)
    });
    if (!existing) return null;
    if (input.scope === "platform" && input.shopId) {
      const shop = await this.client.shop.findFirst({
        where: { id: input.shopId, deletedAt: null }
      });
      if (!shop) return null;
    }
    const data = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.serviceArea !== undefined ? { serviceArea: input.serviceArea } : {}),
      ...(input.employmentType !== undefined
        ? { employmentType: employmentTypeToDb[input.employmentType] }
        : {}),
      ...(input.employmentStartedAt !== undefined
        ? {
            employmentStartedAt:
              input.employmentStartedAt === null ? null : new Date(input.employmentStartedAt)
          }
        : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
      ...(input.scope === "platform" && input.shopId !== undefined ? { shopId: input.shopId } : {})
    };
    return this.mapTechnician(
      await this.client.technicianProfile.update({
        where: { id: existing.id },
        data,
        include: this.technicianInclude()
      })
    );
  }

  public approveTechnician(
    input: ScopedTechnicianApprovalInput
  ): Promise<BackofficeTechnicianPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.technicianProfile.findFirst({
        where: this.technicianMutationWhere(input, input.technicianId),
        include: this.technicianInclude()
      });
      if (!existing) return null;
      const shopId = input.scope === "merchant" ? input.shopId : (input.shopId ?? existing.shopId);
      if (shopId) {
        const shop = await transaction.shop.findFirst({ where: { id: shopId, deletedAt: null } });
        if (!shop) return null;
      }
      const technician = await transaction.technicianProfile.update({
        where: { id: existing.id },
        data: { shopId, status: "published", verifiedAt: input.approvedAt },
        include: this.technicianInclude()
      });
      await transaction.user.update({ where: { id: existing.userId }, data: { isActive: true } });
      await transaction.userIdentity.updateMany({
        where: { userId: existing.userId, type: "technician", deletedAt: null },
        data: { isActive: true }
      });
      return this.mapTechnician(technician);
    });
  }

  public softDeleteTechnician(
    input: ScopedEntityInput
  ): Promise<BackofficeTechnicianPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.technicianProfile.findFirst({
        where: this.technicianMutationWhere(input, input.id),
        include: this.technicianInclude()
      });
      if (!existing) return null;
      const technician = await transaction.technicianProfile.update({
        where: { id: existing.id },
        data: { status: "archived", deletedAt: new Date() },
        include: this.technicianInclude()
      });
      await transaction.user.update({ where: { id: existing.userId }, data: { isActive: false } });
      await transaction.userIdentity.updateMany({
        where: { userId: existing.userId, type: "technician", deletedAt: null },
        data: { isActive: false }
      });
      return this.mapTechnician(technician);
    });
  }

  public async listCustomers(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeCustomerPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.customerWhere(input, input);
    const include = this.customerInclude(input);
    const [list, total] = await Promise.all([
      this.client.customerProfile.findMany({
        where,
        include,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.customerProfile.count({ where })
    ]);
    return buildPaginatedResponse(
      list.map((customer) => this.mapCustomer(customer)),
      total,
      input
    );
  }

  public async getCustomer(input: ScopedEntityInput): Promise<BackofficeCustomerPayload | null> {
    const customer = await this.client.customerProfile.findFirst({
      where: { ...this.customerWhere(input, {}), id: input.id },
      include: this.customerInclude(input)
    });
    return customer ? this.mapCustomer(customer) : null;
  }

  public async listCustomerTimeline(
    input: ScopedEntityInput & BackofficeTimelineQuery
  ): Promise<PaginatedResponse<BackofficeAuditEventPayload> | null> {
    const profile = await this.client.customerProfile.findFirst({
      where: { ...this.customerWhere(input, {}), id: input.id },
      select: { id: true, userId: true, createdAt: true }
    });
    if (!profile) return null;

    const pagination = toPrismaPagination(input);
    const where = this.scopedAuditWhere(input, profile.id, profile.userId, "customer");
    const auditTotal = await this.client.auditLog.count({ where });
    const syntheticCount = 1;
    const auditTake =
      pagination.skip < auditTotal ? Math.min(pagination.take, auditTotal - pagination.skip) : 0;
    const rows = auditTake
      ? await this.client.auditLog.findMany({
          where,
          include: { actor: { select: { username: true, avatarUrl: true } } },
          skip: pagination.skip,
          take: auditTake,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        })
      : [];
    const list = rows.map((row) => this.mapAuditEvent(row));
    const syntheticIndex = auditTotal;
    const pageEnd = pagination.skip + pagination.take;
    if (pagination.skip <= syntheticIndex && pageEnd > syntheticIndex) {
      list.push({
        id: `profile.created:${profile.createdAt.toISOString()}`,
        action: "profile.created",
        actorName: "System",
        actorAvatarUrl: null,
        createdAt: profile.createdAt.toISOString(),
        metadata: null
      });
    }

    return buildPaginatedResponse(list, auditTotal + syntheticCount, input);
  }

  public async updateCustomer(
    id: number,
    input: BackofficeCustomerUpdateBody
  ): Promise<BackofficeCustomerPayload | null> {
    const existing = await this.client.customerProfile.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) return null;
    return this.mapCustomer(
      await this.client.customerProfile.update({
        where: { id },
        data: input,
        include: this.customerInclude({ scope: "platform" })
      })
    );
  }

  public async findCustomerMembershipGrantContext(
    customerProfileId: number,
    grantedById: number
  ): Promise<BackofficeCustomerMembershipGrantContext | null> {
    const customer = await this.client.customerProfile.findFirst({
      where: { id: customerProfileId, deletedAt: null },
      select: { userId: true }
    });
    if (!customer) return null;
    const membershipGrantedBy = await this.client.user.findFirst({
      where: { id: grantedById, deletedAt: null },
      select: { needoId: true, username: true }
    });
    return membershipGrantedBy ? { customerUserId: customer.userId, membershipGrantedBy } : null;
  }

  public softDeleteCustomer(id: number): Promise<BackofficeCustomerPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.customerProfile.findFirst({
        where: { id, deletedAt: null },
        include: this.customerInclude({ scope: "platform" })
      });
      if (!existing) return null;
      const customer = await transaction.customerProfile.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: this.customerInclude({ scope: "platform" })
      });
      await transaction.user.update({ where: { id: existing.userId }, data: { isActive: false } });
      await transaction.userIdentity.updateMany({
        where: { userId: existing.userId, type: "customer", deletedAt: null },
        data: { isActive: false }
      });
      return this.mapCustomer(customer);
    });
  }

  public async listServices(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeServicePayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.serviceWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.service.findMany({
        where,
        include: this.serviceInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "desc" }]
      }),
      this.client.service.count({ where })
    ]);
    return buildPaginatedResponse(
      list.map((service) => this.mapService(service)),
      total,
      input
    );
  }

  public async createService(input: ScopedServiceCreateInput): Promise<BackofficeServicePayload> {
    const shopId = input.shopId;
    const created = await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM shops WHERE id = ${shopId} AND deleted_at IS NULL FOR UPDATE`
      );
      await this.requireServiceRelations(
        shopId,
        input.categoryId,
        input.technicianProfileId ?? null,
        transaction
      );
      const nonDeletedCount = await transaction.service.count({
        where: { shopId, deletedAt: null }
      });
      assertShopServiceQuota(nonDeletedCount + 1);

      return transaction.service.create({
        data: {
          categoryId: input.categoryId,
          shopId,
          technicianProfileId: input.technicianProfileId ?? null,
          name: input.name,
          description: input.description ?? null,
          city: input.city,
          serviceMode: input.serviceMode,
          priceAmount: input.priceAmount,
          currency: "JPY",
          durationMinutes: input.durationMinutes,
          status: input.status ?? "draft",
          isRecommended: input.isRecommended ?? false,
          sortOrder: input.sortOrder ?? 0
        },
        include: this.serviceInclude()
      });
    });
    return this.mapService(created);
  }

  public async updateService(
    input: ScopedServiceUpdateInput
  ): Promise<BackofficeServicePayload | null> {
    const existing = await this.client.service.findFirst({
      where: { ...this.serviceWhere(input, {}), id: input.serviceId }
    });
    if (!existing) return null;
    await this.requireServiceRelations(
      existing.shopId,
      input.categoryId ?? existing.categoryId,
      input.technicianProfileId === undefined
        ? existing.technicianProfileId
        : input.technicianProfileId
    );
    const data = {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.technicianProfileId !== undefined
        ? { technicianProfileId: input.technicianProfileId }
        : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
      ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
    };
    return this.mapService(
      await this.client.service.update({
        where: { id: existing.id },
        data,
        include: this.serviceInclude()
      })
    );
  }

  public async softDeleteService(
    input: ScopedEntityInput
  ): Promise<BackofficeServicePayload | null> {
    const existing = await this.client.service.findFirst({
      where: { ...this.serviceWhere(input, {}), id: input.id }
    });
    if (!existing) return null;
    return this.mapService(
      await this.client.service.update({
        where: { id: existing.id },
        data: { status: "archived", deletedAt: new Date() },
        include: this.serviceInclude()
      })
    );
  }

  private technicianMutationWhere(
    scope: BackofficeScope,
    id: number
  ): Prisma.TechnicianProfileWhereInput {
    return {
      id,
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {})
    };
  }

  private customerWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.CustomerProfileWhereInput {
    return {
      deletedAt: null,
      user: {
        deletedAt: null,
        ...(scope.scope === "merchant"
          ? { bookingOrders: { some: { shopId: scope.shopId, deletedAt: null } } }
          : {})
      },
      ...(input.keyword
        ? {
            OR: [
              { displayName: { contains: input.keyword } },
              { city: { contains: input.keyword } },
              { user: { email: { contains: input.keyword } } }
            ]
          }
        : {})
    };
  }

  private async managedUserWhere(
    input: BackofficeScope & BackofficeManagedUserListQuery,
    occurredAt: Date
  ): Promise<Prisma.UserWhereInput> {
    const conditions: Prisma.UserWhereInput[] = [];
    if (input.scope === "merchant") {
      conditions.push({
        bookingOrders: { some: { shopId: input.shopId, deletedAt: null } }
      });
    }
    if (input.keyword) {
      conditions.push({
        OR: [
          { needoId: { contains: input.keyword } },
          { username: { contains: input.keyword } },
          { email: { contains: input.keyword } },
          { phone: { contains: input.keyword } },
          { customerProfile: { is: { displayName: { contains: input.keyword } } } },
          { customerProfile: { is: { city: { contains: input.keyword } } } },
          { technicianProfile: { is: { displayName: { contains: input.keyword } } } },
          { technicianProfile: { is: { city: { contains: input.keyword } } } }
        ]
      });
    }
    if (input.city) {
      conditions.push({
        OR: [
          {
            customerProfile: {
              is: { city: { contains: input.city }, deletedAt: null }
            }
          },
          {
            technicianProfile: {
              is: { city: { contains: input.city }, deletedAt: null }
            }
          }
        ]
      });
    }
    if (input.cities?.length) {
      conditions.push({
        OR: [
          { customerProfile: { is: { city: { in: input.cities }, deletedAt: null } } },
          { technicianProfile: { is: { city: { in: input.cities }, deletedAt: null } } }
        ]
      });
    }
    if (input.emailState) {
      conditions.push(input.emailState === "set" ? { email: { not: "" } } : { email: "" });
    }
    if (input.emailStates?.length === 1) {
      conditions.push(input.emailStates[0] === "set" ? { email: { not: "" } } : { email: "" });
    }
    if (input.privacy) {
      const visibility =
        input.privacy === "enabled"
          ? { not: "public" }
          : input.privacy === "disabled"
            ? "public"
            : input.privacy;
      conditions.push({
        OR: [
          {
            customerProfile: {
              is: { visibility, deletedAt: null }
            }
          },
          {
            technicianProfile: {
              is: { visibility, deletedAt: null }
            }
          }
        ]
      });
    }
    if (input.privacyScopes?.length) {
      const visibilities = input.privacyScopes.flatMap((privacy) =>
        privacy === "enabled"
          ? ["privateAll", "limited", "network"]
          : privacy === "disabled"
            ? ["public"]
            : [privacy]
      );
      conditions.push({
        OR: [
          { customerProfile: { is: { visibility: { in: [...new Set(visibilities)] }, deletedAt: null } } },
          { technicianProfile: { is: { visibility: { in: [...new Set(visibilities)] }, deletedAt: null } } }
        ]
      });
    }
    if (input.state) conditions.push({ isActive: input.state === "active" });
    if (input.states?.length === 1) conditions.push({ isActive: input.states[0] === "active" });
    if (input.identityType) {
      conditions.push({
        identities: {
          some: {
            type: input.identityType,
            isActive: true,
            deletedAt: null,
            ...visibleManagedIdentityScopeWhere(input)
          }
        }
      });
    }
    if (input.identityTypes?.length) {
      conditions.push({
        identities: {
          some: {
            type: { in: input.identityTypes },
            isActive: true,
            deletedAt: null,
            ...visibleManagedIdentityScopeWhere(input)
          }
        }
      });
    }
    if (input.source) {
      conditions.push(
        input.source === "password"
          ? { externalAccounts: { none: { deletedAt: null } } }
          : {
              externalAccounts: {
                some: { provider: input.source, deletedAt: null }
              }
            }
      );
    }
    if (input.ekyc) {
      const verifiedWhere: Prisma.EkycVerificationWhereInput = {
        status: "verified",
        verifiedAt: { not: null },
        deletedAt: null
      };
      conditions.push(
        input.ekyc === "verified"
          ? { ekycVerifications: { some: verifiedWhere } }
          : { ekycVerifications: { none: verifiedWhere } }
      );
    }
    if (input.ekycStates?.length === 1) {
      const verifiedWhere: Prisma.EkycVerificationWhereInput = {
        status: "verified",
        verifiedAt: { not: null },
        deletedAt: null
      };
      conditions.push(
        input.ekycStates[0] === "verified"
          ? { ekycVerifications: { some: verifiedWhere } }
          : { ekycVerifications: { none: verifiedWhere } }
      );
    }
    if (input.minLevel !== undefined || input.maxLevel !== undefined) {
      conditions.push({
        customerProfile: { is: { deletedAt: null } },
        experienceAccount: {
          is: {
            deletedAt: null,
            currentLevel: {
              ...(input.minLevel !== undefined ? { gte: input.minLevel } : {}),
              ...(input.maxLevel !== undefined ? { lte: input.maxLevel } : {})
            }
          }
        }
      });
    }
    if (input.minExpUnits !== undefined || input.maxExpUnits !== undefined) {
      conditions.push({
        customerProfile: { is: { deletedAt: null } },
        experienceAccount: {
          is: {
            deletedAt: null,
            totalExpUnits: {
              ...(input.minExpUnits !== undefined ? { gte: input.minExpUnits } : {}),
              ...(input.maxExpUnits !== undefined ? { lte: input.maxExpUnits } : {})
            }
          }
        }
      });
    }
    if (input.registeredFrom || input.registeredTo) {
      conditions.push({
        createdAt: {
          ...(input.registeredFrom ? { gte: input.registeredFrom } : {}),
          ...(input.registeredTo ? { lte: input.registeredTo } : {})
        }
      });
    }
    if (input.tier) conditions.push(this.managedUserTierWhere(input.tier, occurredAt));
    if (input.tiers?.length) {
      conditions.push({ OR: input.tiers.map((tier) => this.managedUserTierWhere(tier, occurredAt)) });
    }
    if (input.groupCode) {
      conditions.push(this.managedUserGroupWhere(input.groupCode, occurredAt));
    }
    if (input.minNdpBalance !== undefined || input.maxNdpBalance !== undefined) {
      const walletRows = await this.client.wallet.findMany({
        where: {
          ownerType: "USER",
          currency: "NDP",
          deletedAt: null,
          availableBalance: {
            ...(input.minNdpBalance !== undefined ? { gte: input.minNdpBalance } : {}),
            ...(input.maxNdpBalance !== undefined ? { lte: input.maxNdpBalance } : {})
          }
        },
        select: { ownerId: true }
      });
      conditions.push({ id: { in: walletRows.map((wallet) => wallet.ownerId) } });
    }
    if (input.minBookings !== undefined || input.maxBookings !== undefined) {
      const bookingCounts = await this.client.bookingOrder.groupBy({
        by: ["customerUserId"],
        where: {
          deletedAt: null,
          ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
        },
        _count: { _all: true }
      });
      if ((input.minBookings ?? 0) > 0) {
        conditions.push({
          id: {
            in: bookingCounts
              .filter(
                (row) =>
                  row._count._all >= (input.minBookings ?? 0) &&
                  (input.maxBookings === undefined || row._count._all <= input.maxBookings)
              )
              .map((row) => row.customerUserId)
          }
        });
      } else if (input.maxBookings !== undefined) {
        conditions.push({
          NOT: {
            id: {
              in: bookingCounts
                .filter((row) => row._count._all > input.maxBookings!)
                .map((row) => row.customerUserId)
            }
          }
        });
      }
    }
    return { deletedAt: null, ...(conditions.length > 0 ? { AND: conditions } : {}) };
  }

  private managedUserOrderBy(
    input: BackofficeManagedUserListQuery
  ): Prisma.UserOrderByWithRelationInput[] {
    const direction = input.sortDirection;
    const primary: Prisma.UserOrderByWithRelationInput =
      input.sortBy === "displayName"
        ? { customerProfile: { displayName: direction } }
        : input.sortBy === "email"
          ? { email: direction }
          : input.sortBy === "city"
            ? { customerProfile: { city: direction } }
            : { createdAt: direction };
    return [primary, { id: "desc" }];
  }

  private managedUserTierWhere(
    tierCode: "free" | "silver" | "gold" | "black_diamond",
    occurredAt: Date
  ): Prisma.UserWhereInput {
    return buildManagedUserTierWhere(tierCode, occurredAt);
  }

  private managedUserGroupWhere(groupCode: string, occurredAt: Date): Prisma.UserWhereInput {
    if (groupCode === "system:operations") {
      return {
        userRoles: {
          some: {
            deletedAt: null,
            role: { code: { in: OPERATIONS_ROLE_CODES }, deletedAt: null }
          }
        }
      };
    }
    const systemTier = {
      "system:free": "free",
      "system:silver": "silver",
      "system:gold": "gold",
      "system:black_diamond": "black_diamond"
    }[groupCode] as "free" | "silver" | "gold" | "black_diamond" | undefined;
    if (systemTier) return this.managedUserTierWhere(systemTier, occurredAt);
    return {
      backofficeUserGroupMemberships: {
        some: {
          deletedAt: null,
          group: { code: groupCode, status: "ACTIVE", deletedAt: null }
        }
      }
    };
  }

  private async managedUserBalances(
    userIds: number[]
  ): Promise<Map<string, { available: number; frozen: number }>> {
    if (userIds.length === 0) return new Map();
    const wallets = await this.client.wallet.findMany({
      where: {
        ownerType: "USER",
        ownerId: { in: userIds },
        currency: { in: ["NDP", "TEST_NDP"] },
        deletedAt: null
      },
      select: { ownerId: true, currency: true, availableBalance: true, frozenBalance: true }
    });
    return new Map(
      wallets.map((wallet) => [
        `${wallet.ownerId}:${wallet.currency}`,
        { available: wallet.availableBalance, frozen: wallet.frozenBalance }
      ])
    );
  }

  private mapManagedUser(
    user: ManagedUserRecord,
    ndpBalance: { available: number; frozen: number } | undefined,
    scope: BackofficeScope,
    testNdpBalance?: { available: number; frozen: number }
  ): BackofficeManagedUserPayload {
    const customerProfile = user.customerProfile?.deletedAt ? null : user.customerProfile;
    const technicianProfile = user.technicianProfile?.deletedAt ? null : user.technicianProfile;
    const rawPrivacyScope = customerProfile?.visibility ?? technicianProfile?.visibility ?? null;
    const privacyScope =
      rawPrivacyScope === "public" ||
      rawPrivacyScope === "privateAll" ||
      rawPrivacyScope === "limited" ||
      rawPrivacyScope === "network"
        ? rawPrivacyScope
        : null;
    const entitlement = user.platformMembershipEntitlements[0] ?? null;
    const adjustment = user.membershipAdjustments?.[0] ?? null;
    const effectiveTierVersion = adjustment?.tierVersion ?? entitlement?.tierVersion ?? null;
    const tierCode = effectiveTierVersion
      ? effectiveTierVersion.tier.code === PlatformMembershipTierCode.BLACK_DIAMOND
        ? "black_diamond"
        : (effectiveTierVersion.tier.code.toLowerCase() as "free" | "silver" | "gold")
      : "free";
    const visibleRoles = this.visibleRoleAssignments(user, scope);
    const visibleIdentities =
      scope.scope === "merchant"
        ? user.identities.filter(
            (identity) =>
              (identity.scopeType === "shop" && identity.scopeId === scope.shopId) ||
              (identity.scopeType === "customer_profile" && identity.type === "customer")
          )
        : user.identities;
    const operationMember = visibleRoles.some((assignment) =>
      OPERATIONS_ROLE_CODES.includes(assignment.role.code)
    );
    const systemGroups = customerProfile ? [`system:${tierCode}`] : [];
    if (operationMember) systemGroups.push("system:operations");
    const customGroups =
      scope.scope === "platform"
        ? user.backofficeUserGroupMemberships.map((membership) => membership.group.code)
        : [];
    const providers = [...new Set(user.externalAccounts.map((account) => account.provider))];
    return {
      id: user.id,
      needoId: user.needoId,
      username: user.username,
      displayName: customerProfile?.displayName ?? technicianProfile?.displayName ?? user.username,
      email: user.email,
      phone: user.phone,
      emailBound: user.emailVerifiedAt !== null,
      phoneBound: user.phone !== null,
      avatarUrl: user.avatarUrl ?? user.avatarBootstrapUrl,
      isActive: user.isActive,
      isTestAccount: user.isTestAccount,
      source: providers.length > 0 ? providers : ["password"],
      identities: visibleIdentities.map(({ type, displayName, scopeType, scopeId }) => ({ type, displayName, scopeType, scopeId })),
      ...(scope.scope === "platform" ? { identityProfiles: this.managedIdentityProfiles(user) } : {}),
      roles: visibleRoles.map((assignment) => ({
        code: assignment.role.code,
        name: assignment.role.name
      })),
      groups: [...systemGroups, ...customGroups],
      ekycVerified: user.ekycVerifications.some(
        (verification) =>
          verification.status.toLowerCase() === "verified" && verification.verifiedAt !== null
      ),
      membership: {
        tierCode,
        tierVersionPublicId: effectiveTierVersion?.publicId ?? null,
        entitlementPublicId: entitlement?.publicId ?? null,
        expiresAt: entitlement?.expiresAt?.toISOString() ?? null,
        experienceMultiplier:
          adjustment?.multiplierBps !== null && adjustment?.multiplierBps !== undefined
            ? adjustment.multiplierBps / 10_000
            : effectiveTierVersion
              ? Number(effectiveTierVersion.experienceMultiplier.toString())
              : 1,
        lockVersion: adjustment?.lockVersion ?? null
      },
      experience:
        customerProfile && user.experienceAccount && !user.experienceAccount.deletedAt
          ? {
              currentLevel: user.experienceAccount.currentLevel,
              totalExp: formatExperienceUnits(user.experienceAccount.totalExpUnits),
              totalExpUnits: user.experienceAccount.totalExpUnits.toString()
            }
          : null,
      ndpBalance: ndpBalance ?? { available: 0, frozen: 0 },
      testNdpBalance: testNdpBalance ?? null,
      bookingCount: user._count.bookingOrders,
      city: customerProfile?.city ?? technicianProfile?.city ?? null,
      privacyMode: privacyScope !== null && privacyScope !== "public",
      privacyScope,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }

  private managedIdentityProfiles(user: ManagedUserRecord): NonNullable<BackofficeManagedUserPayload["identityProfiles"]> {
    const profiles: NonNullable<BackofficeManagedUserPayload["identityProfiles"]> = [];
    for (const type of ["technician", "merchant"] as const) {
      const identities = user.identities.filter((identity) => identity.isActive && (
        type === "technician" ? identity.type === type : ["merchant", "merchant_owner", "merchant_staff", "merchant_organization"].includes(identity.type)
      ));
      if (identities.length) {
        const personalProfiles = identities.filter((identity) =>
          identity.merchantIdentityProfile && !identity.merchantIdentityProfile.deletedAt
        );
        const merchantIdentity = personalProfiles.find((identity) => identity.type === "merchant") ?? personalProfiles[0];
        const displayName = type === "technician"
          ? (user.technicianProfile?.deletedAt ? null : user.technicianProfile?.displayName) ?? null
          : merchantIdentity?.merchantIdentityProfile?.displayName ?? null;
        profiles.push({ type, status: "active", displayName });
      } else {
        const application = user.identityApplications?.find((item) => item.type === type);
        const status = application?.status === "submitted" || application?.status === "under_review"
          ? "under_review" : application?.status === "rejected" ? "rejected" : "not_enabled";
        profiles.push({ type, status, displayName: null });
      }
    }
    return profiles;
  }

  private visibleRoleAssignments(user: ManagedUserRecord, scope: BackofficeScope) {
    return scope.scope === "merchant"
      ? user.userRoles.filter(
          (assignment) =>
            (assignment.scopeType === "shop" && assignment.scopeId === scope.shopId) ||
            (assignment.scopeType === "customer_profile" && assignment.role.code === "customer")
        )
      : user.userRoles;
  }

  private customerInclude(scope: BackofficeScope) {
    return {
      user: {
        select: {
          needoId: true,
          email: true,
          _count: {
            select: {
              bookingOrders:
                scope.scope === "merchant"
                  ? { where: { shopId: scope.shopId, deletedAt: null } }
                  : { where: { deletedAt: null } }
            }
          }
        }
      }
    } satisfies Prisma.CustomerProfileInclude;
  }

  private serviceWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.ServiceWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant"
        ? { shopId: scope.shopId }
        : input.shopId
          ? { shopId: input.shopId }
          : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword } },
              { description: { contains: input.keyword } },
              { city: { contains: input.keyword } }
            ]
          }
        : {})
    };
  }

  private serviceInclude() {
    return {
      category: { select: { name: true } },
      shop: { select: { name: true } }
    } satisfies Prisma.ServiceInclude;
  }

  private async requireServiceRelations(
    shopId: number,
    categoryId: number,
    technicianProfileId: number | null,
    client: PrismaClient | Prisma.TransactionClient = this.client
  ): Promise<void> {
    const [shop, category, technician] = await Promise.all([
      client.shop.findFirst({ where: { id: shopId, deletedAt: null }, select: { id: true } }),
      client.category.findFirst({ where: { id: categoryId, deletedAt: null, isActive: true }, select: { id: true } }),
      technicianProfileId
        ? client.technicianProfile.findFirst({ where: { id: technicianProfileId, shopId, deletedAt: null }, select: { id: true } })
        : Promise.resolve({ id: 0 })
    ]);
    if (!shop || !category || !technician) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.master_data.relation_not_found",
        statusCode: 404
      });
    }
  }

  private orderWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: this.orderStatusToDb(input.status) } : {}),
      ...(input.keyword
        ? {
            OR: [
              { orderNo: { contains: input.keyword } },
              { customer: { username: { contains: input.keyword } } },
              { customer: { email: { contains: input.keyword } } },
              { service: { name: { contains: input.keyword } } },
              { shop: { name: { contains: input.keyword } } },
              { technicianProfile: { displayName: { contains: input.keyword } } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            startsAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
  }

  private scheduleWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.ScheduleSlotWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: this.scheduleStatusToDb(input.status) } : {}),
      ...(input.keyword
        ? {
            OR: [
              { service: { name: { contains: input.keyword } } },
              { shop: { name: { contains: input.keyword } } },
              { technicianProfile: { displayName: { contains: input.keyword } } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            startsAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
  }

  private technicianWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.TechnicianProfileWhereInput {
    return {
      deletedAt: null,
      user: this.formalTechnicianUserWhere(),
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { displayName: { contains: input.keyword } },
              { city: { contains: input.keyword } },
              { serviceArea: { contains: input.keyword } },
              { user: { email: { contains: input.keyword } } },
              { shop: { name: { contains: input.keyword } } }
            ]
          }
        : {})
    };
  }

  private formalTechnicianUserWhere(): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      identities: { some: this.formalTechnicianIdentityWhere() }
    };
  }

  private formalTechnicianIdentityWhere(): Prisma.UserIdentityWhereInput {
    return {
      type: "technician",
      isActive: true,
      deletedAt: null,
      publicIdentifier: {
        is: { kind: "S", status: "ACTIVE", deletedAt: null }
      }
    };
  }

  private shopWhere(scope: BackofficeScope, input: BackofficeListQuery): Prisma.ShopWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { id: scope.shopId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword } },
              { description: { contains: input.keyword } },
              { city: { contains: input.keyword } },
              { address: { contains: input.keyword } },
              { owner: { email: { contains: input.keyword } } }
            ]
          }
        : {})
    };
  }

  private financeWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.OrderFinancialWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { settlementStatus: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { paymentChannel: { contains: input.keyword } },
              { bookingOrder: { orderNo: { contains: input.keyword } } },
              { bookingOrder: { shop: { name: { contains: input.keyword } } } },
              { bookingOrder: { technicianProfile: { displayName: { contains: input.keyword } } } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
  }

  private technicianDetailInclude(input: ScopedEntityInput) {
    return {
      user: {
        select: this.accountSelect(input, "technician")
      },
      mediaAssets: {
        where: { usageType: "avatar", isActive: true, deletedAt: null },
        orderBy: { id: "desc" as const },
        take: 1
      },
      shop: { select: { name: true } },
      reviewSummary: { where: { deletedAt: null } }
    } satisfies Prisma.TechnicianProfileInclude;
  }

  private customerDetailInclude(input: ScopedEntityInput) {
    return {
      user: {
        select: this.accountSelect(input, "customer")
      },
      membershipGrantedBy: {
        select: { needoId: true, username: true }
      },
      reviewSummary: { where: { deletedAt: null } }
    } satisfies Prisma.CustomerProfileInclude;
  }

  private accountSelect(input: ScopedEntityInput, profileIdentityType: "technician" | "customer") {
    const profileScopeType =
      profileIdentityType === "technician" ? "technician_profile" : "customer_profile";
    const merchantRoleScope =
      input.scope === "merchant"
        ? {
            OR: [
              { scopeType: "shop", scopeId: input.shopId },
              { scopeType: profileScopeType, scopeId: input.id }
            ]
          }
        : {};
    const merchantIdentityScope =
      input.scope === "merchant"
        ? {
            OR: [
              { scopeType: "shop", scopeId: input.shopId },
              { type: profileIdentityType, scopeType: "global" },
              {
                type: profileIdentityType,
                scopeType: profileScopeType,
                scopeId: input.id
              }
            ]
          }
        : {};

    return {
      needoId: true,
      username: true,
      email: true,
      phone: true,
      avatarUrl: true,
      avatarBootstrapUrl: true,
      isActive: true,
      lastLoginAt: true,
      userRoles: {
        where: { deletedAt: null, role: { deletedAt: null }, ...merchantRoleScope },
        select: {
          scopeType: true,
          scopeId: true,
          role: { select: { name: true, code: true } }
        }
      },
      identities: {
        where: { isActive: true, deletedAt: null, ...merchantIdentityScope },
        select: {
          type: true,
          scopeType: true,
          scopeId: true,
          displayName: true,
          publicIdentifier: { select: { publicId: true, kind: true } }
        }
      }
    } satisfies Prisma.UserSelect;
  }

  private async findScopedAuditEvents(
    input: ScopedEntityInput,
    profileId: number,
    userId: number,
    profileType: "technician" | "customer"
  ) {
    return this.client.auditLog.findMany({
      where: this.scopedAuditWhere(input, profileId, userId, profileType),
      include: { actor: { select: { username: true, avatarUrl: true } } },
      take: 30,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  }

  private scopedAuditWhere(
    input: ScopedEntityInput,
    profileId: number,
    userId: number,
    profileType: "technician" | "customer"
  ): Prisma.AuditLogWhereInput {
    const targetTypes =
      profileType === "technician"
        ? ["TechnicianProfile", "technician_profile"]
        : ["CustomerProfile", "customer_profile"];
    const metadataProfileIdPaths =
      profileType === "technician"
        ? ["$.technicianProfileId", "$.technicianId"]
        : ["$.customerProfileId"];

    return {
      deletedAt: null,
      ...(profileType === "customer"
        ? {
            action: {
              notIn: ["backoffice.customer.read", "merchant_admin.customer.read"]
            }
          }
        : {}),
      AND: [
        {
          OR: [
            ...targetTypes.map((targetType) => ({ targetType, targetId: profileId })),
            { targetType: "User", targetId: userId },
            ...metadataProfileIdPaths.map((path) => ({
              metadata: { path, equals: profileId }
            })),
            { metadata: { path: "$.userId", equals: userId } }
          ]
        },
        ...(input.scope === "merchant"
          ? [{ metadata: { path: "$.shopId", equals: input.shopId } }]
          : [])
      ]
    };
  }

  private orderInclude() {
    return {
      customer: {
        select: {
          username: true,
          email: true,
          customerProfile: { select: { id: true } }
        }
      },
      service: true,
      shop: true,
      technicianProfile: {
        select: {
          displayName: true,
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
                  publicIdentifier: { select: { publicId: true } }
                }
              }
            }
          }
        }
      }
    } satisfies Prisma.BookingOrderInclude;
  }

  private orderDetailInclude() {
    return {
      ...this.orderInclude(),
      statusHistory: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          bookingOrderId: true,
          fromStatus: true,
          toStatus: true,
          actorUserId: true,
          actor: {
            select: { username: true, avatarUrl: true, avatarBootstrapUrl: true }
          },
          reason: true,
          createdAt: true
        }
      },
      performanceAssessment: {
        select: {
          id: true,
          bookingOrderId: true,
          technicianProfileId: true,
          outcome: true,
          treatment: true,
          version: true,
          currentRevisionId: true,
          createdAt: true,
          updatedAt: true
        }
      },
      performanceRevisions: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          action: true,
          actorUserId: true,
          actor: {
            select: { username: true, avatarUrl: true, avatarBootstrapUrl: true }
          },
          publicReason: true,
          internalNote: true,
          createdAt: true
        }
      },
      serviceEvents: {
        where: {
          deletedAt: null,
          eventType: {
            in: [
              OrderServiceEventType.ADD_ON_PROPOSED,
              OrderServiceEventType.ADD_ON_ACCEPTED,
              OrderServiceEventType.ADD_ON_REJECTED
            ]
          }
        },
        orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          eventType: true,
          actorUserId: true,
          actor: {
            select: { username: true, avatarUrl: true, avatarBootstrapUrl: true }
          },
          reason: true,
          occurredAt: true,
          orderAddOn: {
            select: {
              id: true,
              serviceId: true,
              serviceNameSnapshot: true,
              priceAmountJpy: true,
              currency: true,
              durationMinutes: true
            }
          }
        }
      }
    } satisfies Prisma.BookingOrderInclude;
  }

  private scheduleInclude() {
    return {
      service: true,
      shop: true,
      technicianProfile: true
    } satisfies Prisma.ScheduleSlotInclude;
  }

  private financeInclude() {
    return {
      bookingOrder: {
        select: {
          id: true,
          orderNo: true,
          shopId: true,
          technicianProfileId: true,
          technicianProfile: {
            select: {
              displayName: true
            }
          },
          shop: {
            select: {
              name: true
            }
          },
          checkout: {
            select: {
              payableNdp: true
            }
          }
        }
      }
    } satisfies Prisma.OrderFinancialInclude;
  }

  private technicianInclude() {
    return {
      user: {
        select: {
          needoId: true,
          email: true,
          avatarUrl: true,
          avatarBootstrapUrl: true,
          identities: {
            where: this.formalTechnicianIdentityWhere(),
            orderBy: { id: "asc" as const },
            take: 1,
            select: {
              publicIdentifier: { select: { publicId: true, kind: true } }
            }
          }
        }
      },
      mediaAssets: {
        where: { usageType: "avatar", isActive: true, deletedAt: null },
        orderBy: { id: "desc" as const },
        take: 1
      },
      shop: {
        select: {
          name: true
        }
      }
    } satisfies Prisma.TechnicianProfileInclude;
  }

  private shopInclude() {
    return {
      owner: {
        select: {
          email: true,
          avatarBootstrapUrl: true
        }
      },
      mediaAssets: {
        where: { usageType: "avatar", isActive: true, deletedAt: null },
        orderBy: { id: "desc" as const },
        take: 1
      }
    } satisfies Prisma.ShopInclude;
  }

  private resolveServiceLocation(
    input: {
      serviceCountryCode?: "JP";
      serviceAdmin1Code?: string;
      serviceAdmin2Code?: string;
    },
    transaction: Prisma.TransactionClient
  ): Promise<VerifiedAdministrativeRegionScope | null> {
    if (!input.serviceCountryCode || !input.serviceAdmin1Code || !input.serviceAdmin2Code) {
      return Promise.resolve(null);
    }
    return this.administrativeRegionRepository.resolveVerifiedScope(
      {
        countryCode: input.serviceCountryCode,
        admin1Code: input.serviceAdmin1Code,
        admin2Code: input.serviceAdmin2Code
      },
      transaction
    );
  }

  private async upsertShopServiceLocation(
    transaction: Prisma.TransactionClient,
    shopId: number,
    scope: VerifiedAdministrativeRegionScope,
    verifiedById: number
  ): Promise<void> {
    await transaction.shopServiceLocation.upsert({
      where: { shopId },
      create: {
        shopId,
        countryCode: scope.countryCode,
        admin1RegionId: scope.admin1RegionId,
        admin2RegionId: scope.admin2RegionId,
        datasetVersion: scope.datasetVersion,
        verifiedAt: new Date(),
        verifiedById
      },
      update: {
        countryCode: scope.countryCode,
        admin1RegionId: scope.admin1RegionId,
        admin2RegionId: scope.admin2RegionId,
        datasetVersion: scope.datasetVersion,
        verifiedAt: new Date(),
        verifiedById,
        deletedAt: null
      }
    });
  }

  private async provisionShopPublicNumber(
    transaction: Prisma.TransactionClient,
    shopId: number,
    shopName: string
  ): Promise<string> {
    const supportAccount = await transaction.customerSupportAccount.create({
      data: {
        shopId,
        type: "SHOP",
        displayName: `${shopName} Customer Support`
      }
    });
    const pair = await this.createIdentifierAllocator(transaction).allocateShopSupportPair({
      shopId,
      customerSupportAccountId: supportAccount.id
    });
    const shopNo = pair.shopIdentifier.numberPart;
    await transaction.shop.update({ where: { id: shopId }, data: { shopNo } });
    return shopNo;
  }

  private requirePublicShopNumber(shopNo: string | null): string {
    const parsed = identifierNumberPartSchema.safeParse(shopNo);
    if (!parsed.success) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.shop.public_number_required",
        statusCode: 400
      });
    }
    return parsed.data;
  }

  private async persistServiceLocationAudit(
    transaction: Prisma.TransactionClient,
    audit: AuditLogCreateInput | undefined,
    shopNo: string
  ): Promise<void> {
    if (!audit) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.administrative_region.verifier_required",
        statusCode: 400
      });
    }
    await this.auditLogRepository.createInTransaction(transaction, {
      ...audit,
      metadata: {
        ...(audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {}),
        shopNo
      }
    });
  }

  private mapOrder(order: OrderRecord): BackofficeOrderPayload {
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: this.statusFromDb(order.status),
      paymentStatus: this.paymentStatusFromDb(order.paymentStatus),
      customerUserId: order.customerUserId,
      customerProfileId: order.customer.customerProfile?.id ?? null,
      customerName: order.customer.username || order.customer.email,
      serviceId: order.serviceId,
      serviceName: order.serviceNameSnapshot ?? order.service?.name ?? "Unknown service",
      shopId: order.shopId,
      shopName: order.shop.name,
      technicianProfileId: order.technicianProfileId,
      technicianNeedoId:
        order.technicianProfile?.user.identities[0]?.publicIdentifier?.publicId ?? null,
      technicianName: order.technicianProfile?.displayName ?? null,
      fulfillmentMode: order.fulfillmentMode,
      priceAmount: this.toNumber(order.priceAmount),
      currency: order.currency,
      startsAt: order.startsAt.toISOString(),
      endsAt: order.endsAt.toISOString(),
      note: order.note,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    };
  }

  private mapOrderDetail(
    order: OrderDetailRecord,
    includeInternalNotes: boolean
  ): BackofficeOrderDetailPayload {
    const timelineEvents: BackofficeOrderTimelineEventPayload[] = [
      ...order.statusHistory.map((history) => ({
        type: "ORDER_STATUS_CHANGED" as const,
        id: `status:${history.id}`,
        createdAt: history.createdAt.toISOString(),
        actorUserId: history.actorUserId,
        ...this.mapOrderTimelineActor(history.actor),
        fromStatus: history.fromStatus ? this.statusFromDb(history.fromStatus) : null,
        toStatus: this.statusFromDb(history.toStatus),
        publicReason: history.reason
      })),
      ...order.performanceRevisions.map((revision) => ({
        type: this.performanceTimelineType(revision.action),
        id: `performance:${revision.id}`,
        createdAt: revision.createdAt.toISOString(),
        actorUserId: revision.actorUserId,
        ...this.mapOrderTimelineActor(revision.actor),
        publicReason: revision.publicReason,
        internalNote: includeInternalNotes ? revision.internalNote : null
      })),
      ...order.serviceEvents.flatMap((event) => {
        if (!event.orderAddOn) return [];
        return [
          {
            type: this.addOnTimelineType(event.eventType),
            id: `service:${event.id}`,
            createdAt: event.occurredAt.toISOString(),
            actorUserId: event.actorUserId,
            ...this.mapOrderTimelineActor(event.actor),
            publicReason: event.reason,
            addOnId: event.orderAddOn.id,
            serviceId: event.orderAddOn.serviceId,
            serviceName: event.orderAddOn.serviceNameSnapshot,
            priceAmountJpy: event.orderAddOn.priceAmountJpy,
            currency: "JPY" as const,
            durationMinutes: event.orderAddOn.durationMinutes
          }
        ];
      })
    ].sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)
    );

    return {
      ...this.mapOrder(order),
      performanceAssessment: order.performanceAssessment
        ? {
            id: order.performanceAssessment.id,
            bookingOrderId: order.performanceAssessment.bookingOrderId,
            technicianProfileId: order.performanceAssessment.technicianProfileId,
            outcome:
              order.performanceAssessment.outcome === OrderPerformanceOutcome.TECHNICIAN_CANCELLED
                ? "technician_cancelled"
                : "technician_uncompleted",
            treatment:
              order.performanceAssessment.treatment === OrderPerformanceTreatment.SPECIAL_EXCLUDED
                ? "special_excluded"
                : "counted",
            version: order.performanceAssessment.version,
            currentRevisionId: order.performanceAssessment.currentRevisionId,
            createdAt: order.performanceAssessment.createdAt.toISOString(),
            updatedAt: order.performanceAssessment.updatedAt.toISOString()
          }
        : null,
      timelineEvents
    };
  }

  private mapOrderTimelineActor(actor: {
    username: string;
    avatarUrl: string | null;
    avatarBootstrapUrl: string | null;
  } | null) {
    return {
      actorName: actor?.username.trim() || "NeeDo系统",
      actorAvatarUrl: actor?.avatarUrl ?? actor?.avatarBootstrapUrl ?? null
    };
  }

  private addOnTimelineType(
    eventType: OrderServiceEventType
  ): Extract<BackofficeOrderTimelineEventPayload, { addOnId: number }>["type"] {
    switch (eventType) {
      case OrderServiceEventType.ADD_ON_PROPOSED:
        return "ADD_ON_PROPOSED";
      case OrderServiceEventType.ADD_ON_ACCEPTED:
        return "ADD_ON_ACCEPTED";
      case OrderServiceEventType.ADD_ON_REJECTED:
        return "ADD_ON_REJECTED";
      default:
        throw new Error(`Unsupported order add-on timeline event: ${eventType}`);
    }
  }

  private performanceTimelineType(
    action: OrderPerformanceRevisionAction
  ): Extract<BackofficeOrderTimelineEventPayload, { internalNote: string | null }>["type"] {
    switch (action) {
      case OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_CANCELLED:
        return "TECHNICIAN_CANCEL_CLASSIFIED";
      case OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_UNCOMPLETED:
        return "TECHNICIAN_UNCOMPLETED_CLASSIFIED";
      case OrderPerformanceRevisionAction.APPLY_SPECIAL_EXCLUSION:
        return "SPECIAL_CANCELLATION_APPLIED";
      case OrderPerformanceRevisionAction.REVOKE_SPECIAL_EXCLUSION:
        return "SPECIAL_CANCELLATION_REVOKED";
    }
  }

  private mapScheduleSlot(slot: ScheduleSlotRecord): BackofficeScheduleSlotPayload {
    return {
      id: slot.id,
      serviceId: slot.serviceId,
      serviceName: slot.service?.name ?? "Unknown service",
      shopId: slot.shopId,
      shopName: slot.shop.name,
      technicianProfileId: slot.technicianProfileId,
      technicianName: slot.technicianProfile?.displayName ?? null,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      status: slot.status.toLowerCase()
    };
  }

  private mapFinanceSettlement(
    settlement: FinanceSettlementRecord
  ): BackofficeFinanceSettlementPayload {
    const pendingHoldNdp = this.pendingHoldNdp(settlement);

    return {
      id: settlement.id,
      bookingOrderId: settlement.bookingOrderId,
      orderType: this.orderType(settlement.orderType),
      orderNo: settlement.bookingOrder.orderNo,
      referenceType: "booking_order",
      referenceId: settlement.bookingOrderId,
      status: settlement.settlementStatus,
      shopId: settlement.shopId,
      shopName: settlement.bookingOrder.shop.name,
      technicianProfileId:
        settlement.technicianProfileId ?? settlement.bookingOrder.technicianProfileId,
      technicianName: settlement.bookingOrder.technicianProfile?.displayName ?? null,
      ndpCurrency: LedgerCurrencyService.fromStored(settlement.ndpCurrency),
      checkoutPaymentAmountNdp: settlement.bookingOrder.checkout?.payableNdp ?? null,
      estimatedServiceGmvJpy: settlement.serviceAmountJpy,
      platformCollectedServiceAmountJpy: settlement.platformCollectedServiceAmountJpy,
      offlineReportedServiceAmountJpy: settlement.offlineReportedServiceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: settlement.unknownOrUnreportedServiceAmountJpy,
      serviceIncomeStatus: settlement.serviceIncomeStatus,
      paymentChannel: settlement.paymentChannel,
      platformNdpRevenue: this.platformNdpRevenue(settlement),
      cRequestFeeHoldNdp: settlement.cRequestFeeHoldNdp,
      cRequestFeeActualNdp: settlement.cRequestFeeActualNdp,
      requestFeeNdpRevenue: settlement.cRequestFeeActualNdp,
      userRewardNdpCost: settlement.userRewardNdp,
      pendingHoldNdp,
      campaignDiscountNdp: settlement.campaignDiscountNdp,
      releasedNdp: settlement.releasedNdp,
      penaltyNdp: settlement.penaltyNdp,
      compensationToUserNdp: settlement.compensationToUserNdp,
      technicianEstimatedIncomeJpy: this.timelineAmount(
        settlement.moneyTimelineJson,
        "technician_income_estimated"
      ),
      shopEstimatedGrossProfitJpy: this.shopEstimatedGrossProfit(settlement),
      appliedFeeRuleIds: this.stringArray(settlement.appliedFeeRuleIdsJson),
      moneyTimeline: this.timelineArray(settlement.moneyTimelineJson),
      moneyTimelineStatus: this.moneyTimelineStatus(settlement.serviceIncomeStatus),
      createdAt: settlement.createdAt.toISOString()
    };
  }

  private mapTechnician(technician: TechnicianRecord): BackofficeTechnicianPayload {
    const technicianNeedoId = technician.user.identities.find(
      (identity) => identity.publicIdentifier?.kind === "S"
    )?.publicIdentifier?.publicId;

    if (!technicianNeedoId) {
      throw createInternalError(
        new Error(`Technician profile ${technician.id} has no canonical public identifier`)
      );
    }

    return {
      id: technician.id,
      userId: technician.userId,
      needoId: technicianNeedoId,
      displayName: technician.displayName,
      email: technician.user.email,
      avatarUrl: technician.mediaAssets?.[0]?.url ?? technician.user.avatarBootstrapUrl,
      shopId: technician.shopId,
      shopName: technician.shop?.name ?? null,
      city: technician.city,
      serviceArea: technician.serviceArea,
      employmentType: employmentTypeFromDb(technician.employmentType),
      employmentStartedAt: technician.employmentStartedAt?.toISOString() ?? null,
      status: technician.status,
      verifiedAt: technician.verifiedAt?.toISOString() ?? null,
      createdAt: technician.createdAt.toISOString()
    };
  }

  private mapShop(shop: ShopRecord): BackofficeShopPayload {
    return {
      id: shop.id,
      shopNo: shop.shopNo,
      ownerUserId: shop.ownerUserId,
      ownerEmail: shop.owner?.email ?? null,
      avatarUrl: shop.mediaAssets?.[0]?.url ?? shop.owner?.avatarBootstrapUrl ?? null,
      name: shop.name,
      description: shop.description,
      city: shop.city,
      address: shop.address,
      phone: shop.phone,
      status: shop.status,
      isRecommended: shop.isRecommended,
      createdAt: shop.createdAt.toISOString()
    };
  }

  private mapCustomer(customer: CustomerRecord): BackofficeCustomerPayload {
    return {
      id: customer.id,
      userId: customer.userId,
      displayName: customer.displayName,
      email: customer.user.email,
      city: customer.city,
      membershipLevel: resolveEffectiveCustomerMembershipLevel(customer),
      isPublic: customer.isPublic,
      bookingCount: customer.user._count.bookingOrders,
      createdAt: customer.createdAt.toISOString()
    };
  }

  private mapAccount(
    account: {
      needoId: string;
      username: string;
      email: string;
      phone: string | null;
      avatarUrl: string | null;
      isActive: boolean;
      lastLoginAt: Date | null;
      userRoles: Array<{
        scopeType: string | null;
        scopeId: number | null;
        role: { name: string; code: string };
      }>;
      identities: Array<{
        type: string;
        scopeType: string | null;
        scopeId: number | null;
        displayName: string | null;
      }>;
    },
    input: ScopedEntityInput,
    profileIdentityType: "technician" | "customer",
    needoIdOverride?: string
  ): BackofficeAccountPayload {
    const profileScopeType =
      profileIdentityType === "technician" ? "technician_profile" : "customer_profile";
    const roles =
      input.scope === "merchant"
        ? account.userRoles.filter(
            (userRole) =>
              (userRole.scopeType === "shop" && userRole.scopeId === input.shopId) ||
              (userRole.scopeType === profileScopeType && userRole.scopeId === input.id)
          )
        : account.userRoles;
    const identities =
      input.scope === "merchant"
        ? account.identities.filter(
            (identity) =>
              (identity.scopeType === "shop" && identity.scopeId === input.shopId) ||
              (identity.type === profileIdentityType && identity.scopeType === "global") ||
              (identity.type === profileIdentityType &&
                identity.scopeType === profileScopeType &&
                identity.scopeId === input.id)
          )
        : account.identities;

    return {
      needoId: needoIdOverride ?? account.needoId,
      username: account.username,
      email: account.email,
      phone: account.phone,
      avatarUrl: account.avatarUrl,
      isActive: account.isActive,
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      roles: roles.map((userRole) => ({
        name: userRole.role.name,
        code: userRole.role.code,
        scopeType: userRole.scopeType,
        scopeId: userRole.scopeId
      })),
      identities: identities.map((identity) => ({
        type: identity.type,
        scopeType: identity.scopeType,
        scopeId: identity.scopeId,
        displayName: identity.displayName
      }))
    };
  }

  private mapDetailReviewSummary(
    summary: {
      ratingAverage: DecimalLike;
      reviewCount: number;
      latestReviewAt: Date | null;
      highlights: unknown;
    } | null
  ) {
    if (!summary) return null;

    return {
      ratingAverage: this.toNumber(summary.ratingAverage),
      reviewCount: summary.reviewCount,
      latestReviewAt: summary.latestReviewAt?.toISOString() ?? null,
      highlights: this.stringArray(summary.highlights)
    };
  }

  private statusTotals(
    groups: Array<{ status: string; _count: { _all: number } }>
  ): Record<string, number> {
    return groups.reduce<Record<string, number>>((totals, group) => {
      totals[this.statusFromDb(group.status)] = group._count._all;
      return totals;
    }, {});
  }

  private scheduleMinutes(
    slots: Array<{ startsAt: Date; endsAt: Date }>,
    now: Date,
    monthStart: Date,
    monthEnd: Date
  ): Pick<
    BackofficeTechnicianDetailPayload["statistics"],
    "todayScheduleMinutes" | "weekScheduleMinutes" | "monthScheduleMinutes"
  > {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    const daysFromMonday = (dayStart.getUTCDay() + 6) % 7;
    const weekStart = new Date(dayStart.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      todayScheduleMinutes: this.intersectionMinutes(slots, dayStart, dayEnd),
      weekScheduleMinutes: this.intersectionMinutes(slots, weekStart, weekEnd),
      monthScheduleMinutes: this.intersectionMinutes(slots, monthStart, monthEnd)
    };
  }

  private intersectionMinutes(
    slots: Array<{ startsAt: Date; endsAt: Date }>,
    rangeStart: Date,
    rangeEnd: Date
  ): number {
    return slots.reduce((total, slot) => {
      const startsAt = Math.max(slot.startsAt.getTime(), rangeStart.getTime());
      const endsAt = Math.min(slot.endsAt.getTime(), rangeEnd.getTime());
      return total + Math.max(0, Math.round((endsAt - startsAt) / 60000));
    }, 0);
  }

  private mergeTechnicianServices(
    technicianServices: Array<{
      id: number;
      sourceShopServiceId: number | null;
      name: string;
      description: string | null;
      categoryId: number;
      priceAmount: number;
      currency: string;
      durationMinutes: number;
      isRecommended: boolean;
    }>,
    legacyServices: Array<{
      id: number;
      name: string;
      description: string | null;
      categoryId: number;
      priceAmount: DecimalLike;
      currency: string;
      durationMinutes: number;
      isRecommended: boolean;
    }>
  ): BackofficeTechnicianServiceDetailPayload[] {
    const result: BackofficeTechnicianServiceDetailPayload[] = [];
    const seen = new Set<string>();
    for (const service of technicianServices) {
      const key = service.sourceShopServiceId
        ? `service:${service.sourceShopServiceId}`
        : `technician_service:${service.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: service.id,
        source: "technician_service",
        sourceShopServiceId: service.sourceShopServiceId,
        name: service.name,
        description: service.description,
        categoryId: service.categoryId,
        priceAmount: service.priceAmount,
        currency: service.currency,
        durationMinutes: service.durationMinutes,
        isRecommended: service.isRecommended
      });
    }
    for (const service of legacyServices) {
      const key = `service:${service.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: service.id,
        source: "service",
        sourceShopServiceId: service.id,
        name: service.name,
        description: service.description,
        categoryId: service.categoryId,
        priceAmount: this.toNumber(service.priceAmount),
        currency: service.currency,
        durationMinutes: service.durationMinutes,
        isRecommended: service.isRecommended
      });
    }
    return result;
  }

  private mapCompensationProfile(profile: {
    id: number;
    shopId: number;
    technicianProfileId: number;
    name: string;
    status: string;
    version: number;
    wageMode: string;
    baseSalaryJpy: number;
    hourlyRateJpy: number;
    dailyRateJpy: number;
    fixedOrderPayJpy: number;
    commissionRateBps: number;
    guaranteedMinimumJpy: number;
    ndpFeeBearer: string;
    technicianNdpShareBps: number;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    updatedAt: Date;
  }): BackofficeCompensationProfilePayload {
    return {
      id: profile.id,
      shopId: profile.shopId,
      technicianProfileId: profile.technicianProfileId,
      name: profile.name,
      status: profile.status,
      version: profile.version,
      wageMode: profile.wageMode,
      baseSalaryJpy: profile.baseSalaryJpy,
      hourlyRateJpy: profile.hourlyRateJpy,
      dailyRateJpy: profile.dailyRateJpy,
      fixedOrderPayJpy: profile.fixedOrderPayJpy,
      commissionRatePercent: profile.commissionRateBps / 100,
      guaranteedMinimumJpy: profile.guaranteedMinimumJpy,
      ndpFeeBearer: profile.ndpFeeBearer,
      technicianNdpSharePercent: profile.technicianNdpShareBps / 100,
      effectiveFrom: profile.effectiveFrom?.toISOString() ?? null,
      effectiveTo: profile.effectiveTo?.toISOString() ?? null,
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private mergeProfileTimeline(
    rows: Array<{
      id: number;
      action: string;
      metadata: unknown;
      createdAt: Date;
      actor: { username: string; avatarUrl: string | null } | null;
    }>,
    createdAt: Date,
    verifiedAt?: Date | null
  ): BackofficeAuditEventPayload[] {
    const events = rows.map((row) => this.mapAuditEvent(row));
    this.appendLifecycleEvent(events, "profile.created", createdAt);
    if (verifiedAt) this.appendLifecycleEvent(events, "profile.verified", verifiedAt);
    return events.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 30);
  }

  private appendLifecycleEvent(
    events: BackofficeAuditEventPayload[],
    action: "profile.created" | "profile.verified",
    occurredAt: Date
  ): void {
    const createdAt = occurredAt.toISOString();
    if (events.some((event) => event.createdAt === createdAt && event.action === action)) return;
    events.push({
      id: `${action}:${createdAt}`,
      action,
      actorName: "System",
      actorAvatarUrl: null,
      createdAt,
      metadata: null
    });
  }

  private mapAuditEvent(row: {
    id: number;
    action: string;
    metadata: unknown;
    createdAt: Date;
    actor: { username: string; avatarUrl: string | null } | null;
  }): BackofficeAuditEventPayload {
    return {
      id: String(row.id),
      action: row.action,
      actorName: row.actor?.username ?? "System",
      actorAvatarUrl: row.actor?.avatarUrl ?? null,
      createdAt: row.createdAt.toISOString(),
      metadata: this.metadataObject(row.metadata)
    };
  }

  private metadataObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private mapService(service: ServiceRecord): BackofficeServicePayload {
    return {
      id: service.id,
      categoryId: service.categoryId,
      categoryName: service.category.name,
      shopId: service.shopId,
      shopName: service.shop.name,
      technicianProfileId: service.technicianProfileId,
      name: service.name,
      description: service.description,
      city: service.city,
      serviceMode: service.serviceMode,
      priceAmount: this.toNumber(service.priceAmount),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      status: service.status,
      isRecommended: service.isRecommended,
      sortOrder: service.sortOrder,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString()
    };
  }

  private orderStatusToDb(status: string) {
    const normalized = status.trim();
    if (normalized === "inService" || normalized === "in_service") {
      return "IN_SERVICE" as const;
    }

    return normalized.toUpperCase() as Prisma.EnumBookingOrderStatusFilter["equals"];
  }

  private scheduleStatusToDb(status: string) {
    return status.trim().toUpperCase() as Prisma.EnumScheduleSlotStatusFilter["equals"];
  }

  private statusFromDb(status: string): string {
    return status === "IN_SERVICE" ? "inService" : status.toLowerCase();
  }

  private paymentStatusFromDb(status: string): BackofficeOrderPayload["paymentStatus"] {
    if (status === "CONFIRMED") return "confirmed";
    if (status === "REFUND_PENDING") return "refundPending";
    if (status === "REFUNDED") return "refunded";
    return "pending";
  }

  private orderType(value: string): "booking" | "request" {
    return value === "request" ? "request" : "booking";
  }

  private platformNdpRevenue(
    settlement: Pick<
      FinanceSettlementRecord,
      "bPlatformFeeActualNdp" | "cRequestFeeActualNdp" | "userRewardNdp"
    >
  ): number {
    return (
      settlement.bPlatformFeeActualNdp + settlement.cRequestFeeActualNdp - settlement.userRewardNdp
    );
  }

  private pendingHoldNdp(
    settlement: Pick<
      FinanceSettlementRecord,
      | "bPlatformFeeHoldNdp"
      | "bPlatformFeeActualNdp"
      | "cRequestFeeHoldNdp"
      | "cRequestFeeActualNdp"
      | "releasedNdp"
    >
  ): number {
    return Math.max(
      0,
      settlement.bPlatformFeeHoldNdp +
        settlement.cRequestFeeHoldNdp -
        settlement.bPlatformFeeActualNdp -
        settlement.cRequestFeeActualNdp -
        settlement.releasedNdp
    );
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private timelineArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private timelineAmount(value: unknown, type: string): number {
    const event = this.timelineArray(value).find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      return (item as { type?: unknown }).type === type;
    }) as { amountJpy?: unknown } | undefined;

    return typeof event?.amountJpy === "number" ? event.amountJpy : 0;
  }

  private shopEstimatedGrossProfit(settlement: FinanceSettlementRecord): number {
    const event = this.timelineArray(settlement.moneyTimelineJson).find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      return (item as { type?: unknown }).type === "technician_income_estimated";
    }) as { metadata?: { shopEstimatedGrossProfitJpy?: unknown } } | undefined;
    const timelineValue = event?.metadata?.shopEstimatedGrossProfitJpy;

    if (typeof timelineValue === "number") {
      return timelineValue;
    }

    return (
      settlement.serviceAmountJpy -
      this.timelineAmount(settlement.moneyTimelineJson, "technician_income_estimated") -
      settlement.bPlatformFeeActualNdp
    );
  }

  private moneyTimelineStatus(serviceIncomeStatus: string): string {
    if (serviceIncomeStatus === "confirmed") {
      return "complete";
    }
    if (serviceIncomeStatus === "reported") {
      return "needs_review";
    }

    return "needs_income_report";
  }

  private toNumber(value: DecimalLike | bigint | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value.toString());
  }
}
