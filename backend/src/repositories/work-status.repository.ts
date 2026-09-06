import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  monthRangeJst,
  workError,
  type WorkScope,
  type WorkStatus,
  type WorkStatusEvent,
  type WorkStatusSnapshot
} from "../domain/work-status";
import type { WorkStatusQuery } from "../validators/work-status.validator";

const eventInclude = {
  actor: { select: { username: true, avatarUrl: true } },
  order: {
    select: {
      id: true,
      orderNo: true,
      serviceNameSnapshot: true,
      customer: { select: { username: true } }
    }
  },
  incident: { include: { attendanceAffectedOrders: { where: { deletedAt: null } } } }
} as const;
type EventRow = Prisma.TechnicianWorkEventGetPayload<{ include: typeof eventInclude }>;
export interface Obligation {
  id: number;
  basis: "shift" | "booking";
  shopId: number;
  startsAt: Date;
  endsAt: Date;
  actualAt: Date | null;
  cancelledAt?: Date | null;
  status?: string;
  orderNo?: string;
  serviceName?: string;
}
export function mapWorkEvent(row: EventRow, scope: WorkScope): WorkStatusEvent {
  const incident = row.incident;
  const hide = scope.shopId !== undefined && row.shopId !== scope.shopId;
  return {
    affectedOrders: hide
      ? []
      : (incident?.attendanceAffectedOrders ?? [])
          .filter((o) => scope.shopId === undefined || o.shopId === scope.shopId)
          .map((o) => ({
            id: o.orderId,
            orderNo: o.orderNo,
            serviceName: o.serviceName,
            startsAt: o.startsAt.toISOString(),
            endsAt: o.endsAt.toISOString()
          })),
    id: row.id,
    at: row.at.toISOString(),
    kind: row.kind as WorkStatusEvent["kind"],
    basis: (incident?.basis as "shift" | "booking") ?? (row.orderId ? "booking" : null),
    actorName: row.actor?.username ?? "System",
    actorAvatarUrl: row.actor?.avatarUrl ?? null,
    fromStatus: row.fromStatus as WorkStatus | null,
    toStatus: row.toStatus as WorkStatus | null,
    plannedAt: incident?.plannedAt.toISOString() ?? null,
    actualAt: row.actualAt?.toISOString() ?? incident?.actualAt?.toISOString() ?? null,
    delaySeconds:
      incident && (row.actualAt || incident.actualAt)
        ? Math.abs((row.actualAt ?? incident.actualAt)!.getTime() - incident.plannedAt.getTime()) /
          1000
        : null,
    reason: hide ? null : (row.reason ?? incident?.reason ?? null),
    order:
      !hide && row.order
        ? {
            id: row.order.id,
            orderNo: row.order.orderNo,
            serviceName: row.order.serviceNameSnapshot ?? "",
            customerName: row.order.customer.username
          }
        : null
  };
}

export class WorkStatusSession {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async assertScope(scope: WorkScope, now: Date) {
    const row = await this.db.technicianProfile.findFirst({
      where: {
        id: scope.technicianProfileId,
        deletedAt: null,
        ...(scope.userId ? { userId: scope.userId } : {}),
        ...(scope.shopId
          ? {
              technicianShopAffiliations: {
                some: {
                  shopId: scope.shopId,
                  deletedAt: null,
                  workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gt: now } }]
                }
              }
            }
          : {})
      },
      select: { id: true }
    });
    if (!row) throw workError("not_found", 404);
  }
  countEvents(id: number) {
    return this.db.technicianWorkEvent.count({
      where: { technicianProfileId: id, deletedAt: null }
    });
  }
  state(id: number) {
    return this.db.technicianWorkState.findFirst({
      where: { technicianProfileId: id, deletedAt: null }
    });
  }
  actor(id: number) {
    return this.db.user.findFirst({
      where: { id, deletedAt: null },
      select: { username: true, avatarUrl: true }
    });
  }
  async lock(id: number) {
    await this.db.technicianWorkState.upsert({
      where: { technicianProfileId: id },
      create: { technicianProfileId: id },
      update: {}
    });
    // A no-op UPDATE obtains the same row lock used by every command and booking transition.
    await this.db.technicianWorkState.update({
      where: { technicianProfileId: id },
      data: { version: { increment: 0 } }
    });
  }
  epoch(now: Date) {
    return this.db.technicianAttendanceEpoch.upsert({
      where: { id: 1 },
      create: { id: 1, activatedAt: now },
      update: {}
    });
  }
  receipt(key: string) {
    return this.db.technicianWorkEvent.findUnique({
      where: { commandKey: key },
      include: eventInclude
    });
  }
  async cas(id: number, version: number, status: WorkStatus, at: Date) {
    const result = await this.db.technicianWorkState.updateMany({
      where: { technicianProfileId: id, version, deletedAt: null },
      data: { status, version: { increment: 1 }, syncedAt: at }
    });
    if (result.count !== 1) throw workError("version_conflict");
  }
  append(data: Prisma.TechnicianWorkEventUncheckedCreateInput) {
    return this.db.technicianWorkEvent.create({ data, include: eventInclude });
  }
  audit(actorId: number | null, id: number, action: string, metadata: Prisma.InputJsonValue) {
    return this.db.auditLog.create({
      data: { actorId, action, targetType: "TechnicianProfile", targetId: id, metadata }
    });
  }
  async obligations(id: number, from: Date, to: Date): Promise<Obligation[]> {
    const [shifts, bookings] = await Promise.all([
      this.db.availability.findMany({
        where: {
          technicianProfileId: id,
          sourceType: "SHOP",
          isActive: true,
          deletedAt: null,
          startsAt: { lt: to },
          endsAt: { gt: from }
        },
        orderBy: { startsAt: "asc" }
      }),
      this.db.bookingOrder.findMany({
        where: {
          technicianProfileId: id,
          deletedAt: null,
          status: {
            in: [
              "CONFIRMED",
              "IN_SERVICE",
              "AWAITING_CHECKOUT",
              "AWAITING_PAYMENT_CONFIRMATION",
              "CANCELLED",
              "COMPLETED"
            ]
          },
          startsAt: { lt: to },
          endsAt: { gt: from }
        },
        include: {
          serviceSession: { select: { startedAt: true } },
          statusHistory: {
            where: { toStatus: "CANCELLED", deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true }
          }
        },
        orderBy: { startsAt: "asc" }
      })
    ]);
    return [
      ...shifts.map((s) => ({
        id: s.id,
        basis: "shift" as const,
        shopId: s.shopId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        actualAt: null
      })),
      ...bookings.map((b) => ({
        id: b.id,
        basis: "booking" as const,
        shopId: b.shopId,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        actualAt: b.serviceSession?.startedAt ?? null,
        status: b.status,
        cancelledAt: b.statusHistory[0]?.createdAt ?? null,
        orderNo: b.orderNo,
        serviceName: b.serviceNameSnapshot ?? undefined
      }))
    ];
  }
  async history(id: number, to: Date) {
    return this.db.technicianWorkEvent.findMany({
      where: { technicianProfileId: id, deletedAt: null, toStatus: { not: null }, at: { lte: to } },
      orderBy: [{ at: "asc" }, { createdAt: "asc" }],
      select: { at: true, toStatus: true, shopId: true }
    });
  }
  activeService(id: number) {
    return this.db.bookingOrder.findFirst({
      where: { technicianProfileId: id, deletedAt: null, status: "IN_SERVICE" },
      select: { id: true, shopId: true }
    });
  }
  order(id: number, profileId: number) {
    return this.db.bookingOrder.findFirst({
      where: {
        id,
        technicianProfileId: profileId,
        deletedAt: null,
        status: { in: ["CONFIRMED", "IN_SERVICE"] }
      },
      select: { id: true, shopId: true }
    });
  }
  affiliation(id: number, shopId: number, now: Date) {
    return this.db.technicianShopAffiliation.findFirst({
      where: {
        technicianProfileId: id,
        shopId,
        deletedAt: null,
        workStatus: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }]
      },
      select: { id: true }
    });
  }
  incident(key: string) {
    return this.db.technicianAttendanceIncident.findUnique({
      where: { incidentKey: key },
      include: { events: { where: { actualAt: { not: null } }, take: 1 } }
    });
  }
  pendingIncidents(id: number) {
    return this.db.technicianAttendanceIncident.findMany({
      where: {
        technicianProfileId: id,
        kind: "late",
        actualAt: null,
        deletedAt: null,
        events: { none: { actualAt: { not: null }, deletedAt: null } }
      },
      include: {
        order: { select: { serviceSession: { select: { startedAt: true } } } },
        availability: { select: { endsAt: true } }
      }
    });
  }
  appendAffectedOrders(incidentId: string, orders: Obligation[]) {
    return this.db.technicianAttendanceAffectedOrder.createMany({
      data: orders.map((o) => ({
        incidentId,
        orderId: o.id,
        shopId: o.shopId,
        orderNo: o.orderNo!,
        serviceName: o.serviceName ?? null,
        startsAt: o.startsAt,
        endsAt: o.endsAt
      }))
    });
  }
  createIncident(data: Prisma.TechnicianAttendanceIncidentUncheckedCreateInput) {
    return this.db.technicianAttendanceIncident.create({ data });
  }
  async snapshot(scope: WorkScope, now: Date): Promise<WorkStatusSnapshot> {
    const month = monthRangeJst(now);
    const where = {
      technicianProfileId: scope.technicianProfileId,
      deletedAt: null,
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      occurredAt: { gte: month.from, lt: month.to }
    };
    const [state, active, lateCount, earlyLeaveCount] = await Promise.all([
      this.state(scope.technicianProfileId),
      this.activeService(scope.technicianProfileId),
      this.db.technicianAttendanceIncident.count({ where: { ...where, kind: "late" } }),
      this.db.technicianAttendanceIncident.count({ where: { ...where, kind: "early_leave" } })
    ]);
    return {
      activeOrderId:
        active && (scope.shopId === undefined || scope.shopId === active.shopId) ? active.id : null,
      technicianProfileId: scope.technicianProfileId,
      status: active ? "in_service" : ((state?.status ?? "unsynced") as WorkStatus),
      version: state?.version ?? 0,
      syncedAt: state?.syncedAt?.toISOString() ?? null,
      month: {
        lateCount,
        earlyLeaveCount,
        from: month.from.toISOString(),
        to: month.to.toISOString()
      }
    };
  }
  async events(scope: WorkScope, q: WorkStatusQuery) {
    const range = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lt: new Date(q.to) } : {})
    };
    const where: Prisma.TechnicianWorkEventWhereInput = {
      technicianProfileId: scope.technicianProfileId,
      deletedAt: null,
      ...(scope.shopId ? { OR: [{ shopId: scope.shopId }, { shopId: null, kind: "status" }] } : {}),
      ...(q.kind
        ? { kind: q.kind }
        : q.incidentsOnly
          ? { kind: { in: ["late", "early_leave"] } }
          : {}),
      at: range
    };
    const [rows, total] = await Promise.all([
      this.db.technicianWorkEvent.findMany({
        where,
        include: eventInclude,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size
      }),
      this.db.technicianWorkEvent.count({ where })
    ]);
    const incidentIds = rows.flatMap((r) => (r.incidentId ? [r.incidentId] : []));
    const resolutions = incidentIds.length
      ? await this.db.technicianWorkEvent.findMany({
          where: { incidentId: { in: incidentIds }, actualAt: { not: null }, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { incidentId: true, actualAt: true }
        })
      : [];
    return {
      list: rows.map((row) =>
        mapWorkEvent(
          {
            ...row,
            actualAt:
              row.actualAt ??
              resolutions.find((r) => r.incidentId === row.incidentId)?.actualAt ??
              null
          },
          scope
        )
      ),
      total,
      page: q.page,
      page_size: q.page_size
    };
  }
}
export class WorkStatusRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  transaction<T>(fn: (unit: WorkStatusSession) => Promise<T>): Promise<T> {
    return this.client.$transaction((tx) => fn(new WorkStatusSession(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000
    });
  }
  async orderTechnicianId(orderId: number) {
    return (
      (
        await this.client.bookingOrder.findFirst({
          where: { id: orderId, deletedAt: null },
          select: { technicianProfileId: true }
        })
      )?.technicianProfileId ?? null
    );
  }
  async recipients(id: number) {
    const now = new Date();
    const profile = await this.client.technicianProfile.findFirst({
      where: { id, deletedAt: null },
      select: {
        userId: true,
        technicianShopAffiliations: {
          where: {
            deletedAt: null,
            workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }]
          },
          select: {
            shopId: true,
            shop: {
              select: {
                merchantMemberships: {
                  where: {
                    deletedAt: null,
                    startsAt: { lte: now },
                    OR: [{ endsAt: null }, { endsAt: { gt: now } }]
                  },
                  select: { merchantAccountId: true }
                }
              }
            }
          }
        }
      }
    });
    if (!profile) return [];
    const shopIds = profile.technicianShopAffiliations.map((a) => a.shopId),
      accountIds = profile.technicianShopAffiliations.flatMap((a) =>
        a.shop.merchantMemberships.map((m) => m.merchantAccountId)
      );
    return this.client.userIdentity.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        user: { isActive: true, deletedAt: null },
        OR: [
          {
            type: "technician",
            scopeType: "technician_profile",
            scopeId: id,
            userId: profile.userId
          },
          {
            type: { in: ["platform", "platform_admin"] },
            scopeType: { in: ["global", "platform"] }
          },
          {
            type: { in: ["merchant", "merchant_owner", "merchant_staff", "business", "b"] },
            scopeType: "shop",
            scopeId: { in: shopIds }
          },
          {
            type: { in: ["merchant_organization", "merchant_owner", "owner", "o"] },
            scopeType: { in: ["merchant_account", "merchant"] },
            scopeId: { in: accountIds }
          }
        ]
      },
      select: { id: true, userId: true }
    });
  }
  async candidates(after: number, take: number) {
    return this.client.technicianProfile.findMany({
      where: { id: { gt: after }, deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
      take
    });
  }
}
export async function projectWorkStatuses(
  client: Pick<Prisma.TransactionClient, "technicianWorkState" | "bookingOrder">,
  ids: number[]
): Promise<Map<number, WorkStatus>> {
  if (!ids.length) return new Map();
  const [states, active] = await Promise.all([
    client.technicianWorkState.findMany({
      where: { technicianProfileId: { in: ids }, deletedAt: null },
      select: { technicianProfileId: true, status: true }
    }),
    client.bookingOrder.findMany({
      where: { technicianProfileId: { in: ids }, status: "IN_SERVICE", deletedAt: null },
      select: { technicianProfileId: true }
    })
  ]);
  const result = new Map<number, WorkStatus>(ids.map((id) => [id, "unsynced"]));
  for (const state of states) result.set(state.technicianProfileId, state.status as WorkStatus);
  for (const order of active)
    if (order.technicianProfileId) result.set(order.technicianProfileId, "in_service");
  return result;
}
