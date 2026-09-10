import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  buildScheduleSlotRepairPlan,
  digestScheduleSlotRepairPlan,
  type ScheduleSlotRepairInventory,
  type ScheduleSlotRepairObservation,
  type ScheduleSlotRepairPlan,
  type ScheduleSlotRepairPlanEntry,
  type ScheduleSlotRepairServiceSnapshot,
  type ScheduleSlotRepairTechnicianServiceSnapshot
} from "../domain/schedule-slot-inventory-repair";
import type { ScheduleSlotInventoryRepairRepositoryPort } from "../services/schedule-slot-inventory-repair.service";
import { prisma } from "../prisma/client";

type RepairReadClient = Pick<
  PrismaClient,
  "scheduleSlot" | "service" | "technicianService" | "technicianShopAffiliation"
>;

const slotSelect = Prisma.validator<Prisma.ScheduleSlotSelect>()({
  id: true,
  availabilityId: true,
  serviceId: true,
  technicianServiceId: true,
  shopId: true,
  technicianProfileId: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  bookedCount: true,
  status: true,
  service: {
    select: {
      id: true,
      shopId: true,
      name: true,
      categoryId: true,
      priceAmount: true,
      currency: true,
      durationMinutes: true,
      serviceMode: true,
      status: true,
      deletedAt: true,
      category: { select: { isActive: true, deletedAt: true } }
    }
  },
  technicianService: {
    select: {
      id: true,
      shopId: true,
      technicianId: true,
      sourceShopServiceId: true,
      name: true,
      categoryId: true,
      priceAmount: true,
      currency: true,
      durationMinutes: true,
      isActive: true,
      isBookable: true,
      reviewStatus: true,
      deletedAt: true,
      category: { select: { isActive: true, deletedAt: true } },
      technicianProfile: {
        select: {
          status: true,
          deletedAt: true,
          user: { select: { isActive: true, deletedAt: true } }
        }
      }
    }
  },
  _count: {
    select: {
      bookingOrders: true,
      routeEstimates: true,
      exchangeClaims: true,
      exchangeMatchParticipants: true
    }
  }
});

type SlotRow = Prisma.ScheduleSlotGetPayload<{ select: typeof slotSelect }>;

const serviceSelect = Prisma.validator<Prisma.ServiceSelect>()({
  id: true,
  shopId: true,
  name: true,
  categoryId: true,
  priceAmount: true,
  currency: true,
  durationMinutes: true,
  serviceMode: true,
  status: true,
  deletedAt: true,
  category: { select: { isActive: true, deletedAt: true } }
});

type ServiceRow = Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>;

const technicianServiceSelect = Prisma.validator<Prisma.TechnicianServiceSelect>()({
  id: true,
  shopId: true,
  technicianId: true,
  sourceShopServiceId: true,
  name: true,
  categoryId: true,
  priceAmount: true,
  currency: true,
  durationMinutes: true,
  isActive: true,
  isBookable: true,
  reviewStatus: true,
  deletedAt: true,
  category: { select: { isActive: true, deletedAt: true } },
  technicianProfile: {
    select: {
      status: true,
      deletedAt: true,
      user: { select: { isActive: true, deletedAt: true } }
    }
  }
});

type TechnicianServiceRow = Prisma.TechnicianServiceGetPayload<{
  select: typeof technicianServiceSelect;
}>;

const chunk = <T>(values: T[], size = 500): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );

const mapService = (row: ServiceRow): ScheduleSlotRepairServiceSnapshot => ({
  id: row.id,
  shopId: row.shopId,
  name: row.name,
  categoryId: row.categoryId,
  priceAmount: row.priceAmount.toFixed(2),
  currency: row.currency,
  durationMinutes: row.durationMinutes,
  serviceMode: row.serviceMode,
  status: row.status,
  deletedAt: row.deletedAt,
  categoryIsActive: row.category.isActive,
  categoryDeletedAt: row.category.deletedAt
});

const mapTechnicianService = (
  row: TechnicianServiceRow
): ScheduleSlotRepairTechnicianServiceSnapshot => ({
  id: row.id,
  shopId: row.shopId,
  technicianId: row.technicianId,
  sourceShopServiceId: row.sourceShopServiceId,
  name: row.name,
  categoryId: row.categoryId,
  priceAmount: String(row.priceAmount),
  currency: row.currency,
  durationMinutes: row.durationMinutes,
  isActive: row.isActive,
  isBookable: row.isBookable,
  reviewStatus: row.reviewStatus,
  deletedAt: row.deletedAt,
  categoryIsActive: row.category.isActive,
  categoryDeletedAt: row.category.deletedAt,
  technicianStatus: row.technicianProfile.status,
  technicianDeletedAt: row.technicianProfile.deletedAt,
  technicianUserIsActive: row.technicianProfile.user.isActive,
  technicianUserDeletedAt: row.technicianProfile.user.deletedAt
});

const mapSlot = (row: SlotRow): ScheduleSlotRepairObservation => ({
  id: row.id,
  availabilityId: row.availabilityId,
  serviceId: row.serviceId,
  technicianServiceId: row.technicianServiceId,
  shopId: row.shopId,
  technicianProfileId: row.technicianProfileId,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  capacity: row.capacity,
  bookedCount: row.bookedCount,
  status: row.status,
  service: row.service ? mapService(row.service) : null,
  technicianService: row.technicianService
    ? mapTechnicianService(row.technicianService)
    : null,
  relationCounts: row._count
});

const readMetadata = (value: Prisma.JsonValue | null): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("schedule slot repair audit metadata is invalid");
  }
  return value as Record<string, unknown>;
};

const replacementKey = (batchId: string, slotId: number): string =>
  `stale-slot-repair:${batchId}:${slotId}`;

export class ScheduleSlotInventoryRepairRepository
  implements ScheduleSlotInventoryRepairRepositoryPort
{
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findAuthorizedActor(email: string): Promise<{ id: number; email: string } | null> {
    return this.client.user.findFirst({
      where: {
        email,
        isActive: true,
        deletedAt: null,
        userRoles: {
          some: {
            deletedAt: null,
            role: {
              deletedAt: null,
              code: "admin",
              rolePermissions: {
                some: {
                  deletedAt: null,
                  permission: {
                    deletedAt: null,
                    code: "schedule:slots:write"
                  }
                }
              }
            }
          }
        }
      },
      select: { id: true, email: true }
    });
  }

  public async buildPlan(
    now: Date,
    client: RepairReadClient = this.client
  ): Promise<ScheduleSlotRepairPlan> {
    const [slots, services, technicianServices, affiliations] = await Promise.all([
      client.scheduleSlot.findMany({ where: { deletedAt: null }, select: slotSelect }),
      client.service.findMany({
        where: {
          deletedAt: null,
          status: "published",
          category: { is: { deletedAt: null, isActive: true } },
          shop: { is: { deletedAt: null, status: "published" } }
        },
        select: serviceSelect
      }),
      client.technicianService.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          isBookable: true,
          reviewStatus: "APPROVED",
          category: { is: { deletedAt: null, isActive: true } },
          technicianProfile: {
            is: {
              deletedAt: null,
              status: "published",
              user: { is: { deletedAt: null, isActive: true } }
            }
          }
        },
        select: technicianServiceSelect
      }),
      client.technicianShopAffiliation.findMany({
        where: {
          workStatus: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          deletedAt: null,
          shop: { is: { deletedAt: null, status: "published" } },
          technicianProfile: {
            is: {
              deletedAt: null,
              status: "published",
              user: { is: { deletedAt: null, isActive: true } }
            }
          }
        },
        select: { shopId: true, technicianProfileId: true }
      })
    ]);
    const inventory: ScheduleSlotRepairInventory = {
      services: services.map(mapService),
      technicianServices: technicianServices.map(mapTechnicianService),
      activeAffiliations: new Set(
        affiliations.map((row) => `${row.shopId}:${row.technicianProfileId}`)
      )
    };
    return buildScheduleSlotRepairPlan(slots.map(mapSlot), inventory, now);
  }

  public async applyPlan(input: {
    actorId: number;
    now: Date;
    plan: ScheduleSlotRepairPlan;
    planDigest: string;
    batchId?: string;
  }): Promise<{ batchId: string; replaced: number; removed: number }> {
    const batchId = input.batchId ?? randomUUID();
    return this.client.$transaction(
      async (transaction) => {
        const livePlan = await this.buildPlan(input.now, transaction);
        if (
          digestScheduleSlotRepairPlan(input.plan) !== input.planDigest ||
          digestScheduleSlotRepairPlan(livePlan) !== input.planDigest
        ) {
          throw new Error("schedule slot repair plan changed before transactional apply");
        }
        const targets = livePlan.entries.filter((entry) => entry.kind !== "protected");
        const replacements = targets.filter(
          (entry): entry is ScheduleSlotRepairPlanEntry & {
            kind: "repair_replace";
            replacement: NonNullable<ScheduleSlotRepairPlanEntry["replacement"]>;
          } => entry.kind === "repair_replace" && entry.replacement !== null
        );
        for (const group of chunk(replacements)) {
          const created = await transaction.scheduleSlot.createMany({
            data: group.map((entry) => ({
              availabilityId: entry.original.availabilityId,
              serviceId: entry.replacement.serviceId,
              technicianServiceId: entry.replacement.technicianServiceId,
              shopId: entry.original.shopId,
              technicianProfileId: entry.original.technicianProfileId,
              startsAt: new Date(entry.original.startsAt),
              endsAt: new Date(entry.original.endsAt),
              capacity: entry.original.capacity,
              bookedCount: 0,
              status: "AVAILABLE" as const,
              manualBookingIdempotencyKey: replacementKey(batchId, entry.slotId),
              manualBookingRequestFingerprint: input.planDigest
            }))
          });
          if (created.count !== group.length) {
            throw new Error("schedule slot repair replacement count changed");
          }
        }
        for (const group of chunk(targets)) {
          const updated = await transaction.scheduleSlot.updateMany({
            where: {
              id: { in: group.map((entry) => entry.slotId) },
              deletedAt: null,
              status: "AVAILABLE",
              bookedCount: 0,
              bookingOrders: { none: {} },
              routeEstimates: { none: {} },
              exchangeClaims: { none: {} },
              exchangeMatchParticipants: { none: {} }
            },
            data: { status: "BLOCKED", deletedAt: input.now }
          });
          if (updated.count !== group.length) {
            throw new Error("schedule slot repair protected-state recheck failed");
          }
        }
        for (const group of chunk(targets)) {
          await transaction.auditLog.createMany({
            data: group.map((entry) => ({
              actorId: input.actorId,
              action: "schedule_slot.stale_inventory_repair.apply",
              targetType: "ScheduleSlot",
              targetId: entry.slotId,
              metadata: {
                batchId,
                planDigest: input.planDigest,
                kind: entry.kind,
                reasons: entry.reasons,
                candidateCount: entry.candidateCount,
                original: entry.original,
                replacement: entry.replacement,
                replacementKey:
                  entry.kind === "repair_replace" ? replacementKey(batchId, entry.slotId) : null
              }
            }))
          });
        }
        return {
          batchId,
          replaced: replacements.length,
          removed: targets.length - replacements.length
        };
      },
      { maxWait: 20_000, timeout: 120_000 }
    );
  }

  public async rollbackBatch(input: {
    actorId: number;
    batchId: string;
    now: Date;
  }): Promise<{ batchId: string; restored: number; replacementsRemoved: number }> {
    return this.client.$transaction(
      async (transaction) => {
        const priorRollback = await transaction.auditLog.count({
          where: {
            action: "schedule_slot.stale_inventory_repair.rollback",
            metadata: { path: "$.batchId", equals: input.batchId },
            deletedAt: null
          }
        });
        if (priorRollback > 0) throw new Error("schedule slot repair batch is already rolled back");
        const auditRows = await transaction.auditLog.findMany({
          where: {
            action: "schedule_slot.stale_inventory_repair.apply",
            metadata: { path: "$.batchId", equals: input.batchId },
            deletedAt: null
          },
          select: { targetId: true, metadata: true },
          orderBy: { id: "asc" }
        });
        if (auditRows.length === 0) throw new Error("schedule slot repair batch was not found");
        const entries = auditRows.map((row) => ({
          slotId: row.targetId,
          metadata: readMetadata(row.metadata)
        }));
        if (entries.some((entry) => entry.slotId === null)) {
          throw new Error("schedule slot repair audit is missing a target slot");
        }
        const keys = entries.flatMap((entry) =>
          typeof entry.metadata.replacementKey === "string"
            ? [entry.metadata.replacementKey]
            : []
        );
        const replacementSlots = keys.length
          ? await transaction.scheduleSlot.findMany({
              where: { manualBookingIdempotencyKey: { in: keys }, deletedAt: null },
              select: {
                id: true,
                manualBookingIdempotencyKey: true,
                status: true,
                bookedCount: true,
                _count: {
                  select: {
                    bookingOrders: true,
                    routeEstimates: true,
                    exchangeClaims: true,
                    exchangeMatchParticipants: true
                  }
                }
              }
            })
          : [];
        if (replacementSlots.length !== keys.length) {
          throw new Error("schedule slot repair replacement inventory changed before rollback");
        }
        for (const slot of replacementSlots) {
          if (
            slot.bookedCount !== 0 ||
            slot.status !== "AVAILABLE" ||
            Object.values(slot._count).some((count) => count > 0)
          ) {
            throw new Error(`schedule slot repair replacement slot ${slot.id} has business usage`);
          }
        }
        for (const group of chunk(replacementSlots.map((slot) => slot.id))) {
          const removed = await transaction.scheduleSlot.updateMany({
            where: { id: { in: group }, deletedAt: null },
            data: { status: "BLOCKED", deletedAt: input.now }
          });
          if (removed.count !== group.length) {
            throw new Error("schedule slot repair replacement rollback count changed");
          }
        }
        const originalIds = entries.map((entry) => entry.slotId as number);
        for (const group of chunk(originalIds)) {
          const restored = await transaction.scheduleSlot.updateMany({
            where: { id: { in: group }, deletedAt: { not: null } },
            data: { status: "AVAILABLE", deletedAt: null }
          });
          if (restored.count !== group.length) {
            throw new Error("schedule slot repair original rollback count changed");
          }
        }
        for (const group of chunk(originalIds)) {
          await transaction.auditLog.createMany({
            data: group.map((slotId) => ({
              actorId: input.actorId,
              action: "schedule_slot.stale_inventory_repair.rollback",
              targetType: "ScheduleSlot",
              targetId: slotId,
              metadata: { batchId: input.batchId }
            }))
          });
        }
        return {
          batchId: input.batchId,
          restored: originalIds.length,
          replacementsRemoved: replacementSlots.length
        };
      },
      { maxWait: 20_000, timeout: 120_000 }
    );
  }
}
