import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliationMutationRepositoryInput,
  AffiliationMutationRepositoryResult,
  EmployeeListRepositoryInput,
  EmployeeProfileUpdateRepositoryInput,
  EmployeeRelationshipType,
  EmployeeScheduleEvent,
  EmployeeScheduleRepositoryInput,
  EmployeeTimelineEventPayload,
  EmployeeTimelineRepositoryInput,
  EmployeeWorkStatus,
  MerchantEmployeePayload,
  TechnicianShopAffiliationRepositoryPort
} from "../services/technician-shop-affiliation.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

const CURRENT_WORK_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;
const CURRENT_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "IN_SERVICE", "COMPLETED"] as const;
const BUSY_BOOKING_STATUSES = ["CONFIRMED", "IN_SERVICE"] as const;
const EMPLOYEE_TIMELINE_ACTIONS = [
  "merchant_admin.employee_profile.update",
  "merchant_admin.employee_affiliation.update",
  "merchant_admin.compensation_profile.update",
  "merchant_admin.employee_payroll_schedule_override.update",
  "merchant_admin.employee_timeline.comment"
] as const;

const employeeProfileFieldLabels: Record<string, string> = {
  bio: "个人简介",
  city: "城市",
  displayName: "姓名",
  serviceArea: "服务区域",
  yearsExperience: "从业年限"
};

function auditMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function timelineRole(action: string) {
  if (action === "merchant_admin.employee_profile.update") return "基本资料";
  if (action === "merchant_admin.employee_affiliation.update") return "从属关系";
  if (action === "merchant_admin.compensation_profile.update") return "薪酬方案";
  if (action === "merchant_admin.employee_payroll_schedule_override.update") return "结算周期";
  return "财务备注";
}

function timelineMessage(action: string, metadata: Record<string, unknown>) {
  if (action === "merchant_admin.employee_profile.update") {
    const fields = Array.isArray(metadata.changedFields)
      ? metadata.changedFields
          .filter((field): field is string => typeof field === "string")
          .map((field) => employeeProfileFieldLabels[field] ?? field)
      : [];
    return fields.length > 0 ? `更新了${fields.join("、")}` : "更新了员工基本资料";
  }
  if (action === "merchant_admin.employee_affiliation.update") {
    const relationship = metadata.relationshipType === "exclusive" ? "专属技师" : "合作技师";
    const status =
      metadata.workStatus === "active"
        ? "在职"
        : metadata.workStatus === "on_leave"
          ? "休假"
          : metadata.workStatus === "suspended"
            ? "停职"
            : "已离职";
    return `更新为${relationship}，当前状态：${status}`;
  }
  if (action === "merchant_admin.compensation_profile.update") {
    return "更新了员工薪酬与分成方案";
  }
  if (action === "merchant_admin.employee_payroll_schedule_override.update") {
    return metadata.inheritShopPolicy ? "改为继承店铺工资结算周期" : "更新了员工独立工资结算周期";
  }
  return typeof metadata.message === "string" ? metadata.message : "添加了员工档案备注";
}

type ScheduleRange = { startsAt: Date; endsAt: Date };

function mergeScheduleRanges(ranges: ScheduleRange[]): ScheduleRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime()
  );
  const merged: ScheduleRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.startsAt.getTime() <= previous.endsAt.getTime()) {
      if (range.endsAt.getTime() > previous.endsAt.getTime()) {
        previous.endsAt = range.endsAt;
      }
      continue;
    }
    merged.push({ startsAt: new Date(range.startsAt), endsAt: new Date(range.endsAt) });
  }
  return merged;
}

function subtractScheduleRanges(
  range: ScheduleRange,
  busyRanges: ScheduleRange[]
): ScheduleRange[] {
  return busyRanges.reduce<ScheduleRange[]>(
    (segments, busy) => {
      return segments.flatMap((segment) => {
        if (
          busy.endsAt.getTime() <= segment.startsAt.getTime() ||
          busy.startsAt.getTime() >= segment.endsAt.getTime()
        ) {
          return [segment];
        }
        const next: ScheduleRange[] = [];
        if (busy.startsAt.getTime() > segment.startsAt.getTime()) {
          next.push({ startsAt: segment.startsAt, endsAt: busy.startsAt });
        }
        if (busy.endsAt.getTime() < segment.endsAt.getTime()) {
          next.push({ startsAt: busy.endsAt, endsAt: segment.endsAt });
        }
        return next;
      });
    },
    [range]
  );
}

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

  public async listCurrentShopEmployeeSchedule(
    input: EmployeeScheduleRepositoryInput
  ): Promise<EmployeeScheduleEvent[] | null> {
    const identity = await this.client.userIdentity.findFirst({
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
        user: { select: { technicianProfile: { select: { id: true } } } }
      }
    });
    const technicianProfileId = identity?.user.technicianProfile?.id;
    if (!technicianProfileId) return null;

    const affiliation = await this.client.technicianShopAffiliation.findFirst({
      where: {
        ...this.currentEmployeeWhere(input.shopId),
        technicianProfileId
      },
      select: { relationshipType: true }
    });
    if (!affiliation) return null;

    const [slots, ownOrders, sharedAvailability, otherShopBusyOrders] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where: {
          shopId: input.shopId,
          technicianProfileId,
          startsAt: { lt: input.to },
          endsAt: { gt: input.from },
          deletedAt: null
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          bookedCount: true,
          service: { select: { name: true } },
          technicianService: { select: { name: true } }
        }
      }),
      this.client.bookingOrder.findMany({
        where: {
          shopId: input.shopId,
          technicianProfileId,
          status: { in: [...CURRENT_BOOKING_STATUSES] },
          startsAt: { lt: input.to },
          endsAt: { gt: input.from },
          deletedAt: null
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          scheduleSlotId: true,
          status: true,
          startsAt: true,
          endsAt: true,
          serviceNameSnapshot: true,
          service: { select: { name: true } },
          technicianService: { select: { name: true } }
        }
      }),
      affiliation.relationshipType === "PARTNER"
        ? this.client.availability.findMany({
            where: {
              shopId: { not: input.shopId },
              technicianProfileId,
              sourceType: "TECHNICIAN",
              visibility: "AFFILIATED_SHOPS",
              isActive: true,
              startsAt: { lt: input.to },
              endsAt: { gt: input.from },
              deletedAt: null
            },
            orderBy: [{ startsAt: "asc" }, { id: "asc" }],
            select: { startsAt: true, endsAt: true }
          })
        : Promise.resolve([]),
      this.client.bookingOrder.findMany({
        where: {
          shopId: { not: input.shopId },
          technicianProfileId,
          status: { in: [...BUSY_BOOKING_STATUSES] },
          startsAt: { lt: input.to },
          endsAt: { gt: input.from },
          deletedAt: null
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: { startsAt: true, endsAt: true }
      })
    ]);

    const busyRanges = mergeScheduleRanges(otherShopBusyOrders);
    const bookedSlotIds = new Set(ownOrders.map((order) => order.scheduleSlotId));
    const slotEvents: EmployeeScheduleEvent[] = slots
      .filter((slot) => !bookedSlotIds.has(slot.id))
      .map((slot) => {
        const status =
          slot.status === "BLOCKED"
            ? "blocked"
            : slot.status === "AVAILABLE" && slot.bookedCount === 0
              ? "available"
              : "scheduled";
        return {
          projectionId: `schedule:${slot.id}`,
          kind: "schedule",
          visibility: "current_shop",
          status,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          title: status === "available" ? "可排班" : status === "blocked" ? "已锁定" : "已排班",
          detail: slot.technicianService?.name ?? slot.service?.name ?? "本店排班",
          isClickable: false,
          isEditable: status !== "scheduled"
        };
      });
    const orderEvents: EmployeeScheduleEvent[] = ownOrders.map((order) => {
      const status =
        order.status.toLowerCase() === "in_service"
          ? "in_service"
          : (order.status.toLowerCase() as "pending" | "confirmed" | "completed");
      const title =
        status === "pending"
          ? "待确认预约"
          : status === "confirmed"
            ? "已确认预约"
            : status === "in_service"
              ? "服务中"
              : "已完成预约";
      return {
        projectionId: `booking:${order.id}`,
        kind: "booking",
        visibility: "current_shop",
        status,
        startsAt: order.startsAt.toISOString(),
        endsAt: order.endsAt.toISOString(),
        title,
        detail:
          order.serviceNameSnapshot ??
          order.technicianService?.name ??
          order.service?.name ??
          "本店预约",
        orderId: order.id,
        isClickable: true,
        isEditable: false
      };
    });
    const sharedAvailabilityEvents: EmployeeScheduleEvent[] = sharedAvailability
      .flatMap((availability) => subtractScheduleRanges(availability, busyRanges))
      .map((range) => ({
        projectionId: `availability:${range.startsAt.toISOString()}:${range.endsAt.toISOString()}`,
        kind: "availability",
        visibility: "affiliated_shops",
        status: "available",
        startsAt: range.startsAt.toISOString(),
        endsAt: range.endsAt.toISOString(),
        title: "合作技师可排班",
        isClickable: false,
        isEditable: false
      }));
    const redactedEvents: EmployeeScheduleEvent[] = busyRanges.map((range) => ({
      projectionId: `busy-redacted:${range.startsAt.toISOString()}:${range.endsAt.toISOString()}`,
      kind: "busy_redacted",
      visibility: "busy_redacted",
      status: "busy",
      startsAt: range.startsAt.toISOString(),
      endsAt: range.endsAt.toISOString(),
      title: "其他店铺已有确认安排",
      isClickable: false,
      isEditable: false
    }));

    return [...slotEvents, ...orderEvents, ...sharedAvailabilityEvents, ...redactedEvents].sort(
      (left, right) =>
        `${left.startsAt}:${left.endsAt}:${left.projectionId}`.localeCompare(
          `${right.startsAt}:${right.endsAt}:${right.projectionId}`
        )
    );
  }

  public async listCurrentShopEmployeeTimeline(input: EmployeeTimelineRepositoryInput) {
    const where = {
      action: { in: [...EMPLOYEE_TIMELINE_ACTIONS] },
      targetType: "technician_shop_affiliation",
      targetId: input.affiliationId,
      deletedAt: null
    } satisfies Prisma.AuditLogWhereInput;
    const { skip, take } = toPrismaPagination(input);
    const [affiliation, auditTotal] = await Promise.all([
      this.client.technicianShopAffiliation.findFirst({
        where: { id: input.affiliationId, shopId: input.shopId, deletedAt: null },
        select: {
          startsAt: true,
          technicianProfile: { select: { verifiedAt: true } },
          shop: { select: { name: true } }
        }
      }),
      this.client.auditLog.count({ where })
    ]);
    const lifecycleEvents: EmployeeTimelineEventPayload[] = affiliation
      ? [
          {
            id: `system-affiliation-${input.affiliationId}`,
            at: affiliation.startsAt.toISOString(),
            actorName: "NeeDo 系统",
            actorAvatarUrl: null,
            actorRole: "从属关系",
            message: `加入店铺并建立员工从属关系 · ${affiliation.shop.name}`,
            tone: "green" as const
          },
          ...(affiliation.technicianProfile.verifiedAt
            ? [
                {
                  id: `system-verified-${input.affiliationId}`,
                  at: affiliation.technicianProfile.verifiedAt.toISOString(),
                  actorName: "NeeDo 系统",
                  actorAvatarUrl: null,
                  actorRole: "档案验证",
                  message: "员工档案已通过验证",
                  tone: "green" as const
                }
              ]
            : [])
        ]
      : [];
    const auditSkip = Math.max(0, skip - lifecycleEvents.length);
    const auditTake = Math.min(
      Math.max(0, auditTotal - auditSkip),
      take + lifecycleEvents.length * 2
    );
    const rows =
      auditTake > 0
        ? await this.client.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: auditSkip,
            take: auditTake,
            select: {
              id: true,
              action: true,
              metadata: true,
              createdAt: true,
              actor: { select: { username: true, avatarUrl: true } }
            }
          })
        : [];

    const auditEvents = rows.map((row): EmployeeTimelineEventPayload => {
      const metadata = auditMetadata(row.metadata);
      const blockingStatus =
        row.action === "merchant_admin.employee_affiliation.update" &&
        (metadata.workStatus === "suspended" || metadata.workStatus === "ended");
      return {
        id: `audit-${row.id}`,
        at: row.createdAt.toISOString(),
        actorName: row.actor?.username ?? "NeeDo 系统",
        actorAvatarUrl: row.actor?.avatarUrl ?? null,
        actorRole: timelineRole(row.action),
        message: timelineMessage(row.action, metadata),
        tone: blockingStatus ? "red" : "accent"
      };
    });
    const list = [...auditEvents, ...lifecycleEvents]
      .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id))
      .slice(skip - auditSkip, skip - auditSkip + take);

    return buildPaginatedResponse(list, auditTotal + lifecycleEvents.length, input);
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
