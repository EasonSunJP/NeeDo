import { prisma } from "../prisma/client";
import type { ShopAutoDispatchRuleBody } from "../validators/shop-auto-dispatch.validator";

export interface ShopAutoDispatchTechnicianPayload {
  id: number;
  displayName: string;
}

export interface ShopAutoDispatchRulePayload extends ShopAutoDispatchRuleBody {
  id: number | null;
  shopId: number;
  candidates: ShopAutoDispatchTechnicianPayload[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ShopAutoDispatchRepositoryPort {
  read(shopId: number): Promise<ShopAutoDispatchRulePayload>;
  replace(shopId: number, actorUserId: number, input: ShopAutoDispatchRuleBody): Promise<ShopAutoDispatchRulePayload>;
}

export class ShopAutoDispatchRuleValidationError extends Error {
  public constructor() {
    super("error.auto_dispatch.technician_not_affiliated");
    this.name = "ShopAutoDispatchRuleValidationError";
  }
}

const defaultRule = (shopId: number, candidates: ShopAutoDispatchTechnicianPayload[]): ShopAutoDispatchRulePayload => ({
  id: null,
  shopId,
  enabled: false,
  startsOn: null,
  endsOn: null,
  startMinute: 0,
  endMinute: 1439,
  allowStore: true,
  allowHome: true,
  minimumRating: null,
  minimumAcceptanceRate: null,
  maximumCancellationRate: null,
  dailyTechnicianLimit: null,
  strategy: "balanced",
  preferredTechnicianIds: [],
  travelMinutesPerKm: 3,
  strictWindow: false,
  candidates,
  createdAt: null,
  updatedAt: null
});

export class ShopAutoDispatchRepository implements ShopAutoDispatchRepositoryPort {
  public async read(shopId: number): Promise<ShopAutoDispatchRulePayload> {
    const [record, candidates] = await Promise.all([
      prisma.shopAutoDispatchRule.findFirst({ where: { shopId, deletedAt: null } }),
      this.listCandidates(shopId)
    ]);
    if (!record) return defaultRule(shopId, candidates);
    return {
      id: record.id,
      shopId,
      enabled: record.enabled,
      startsOn: record.startsOn?.toISOString().slice(0, 10) ?? null,
      endsOn: record.endsOn?.toISOString().slice(0, 10) ?? null,
      startMinute: record.startMinute,
      endMinute: record.endMinute,
      allowStore: record.allowStore,
      allowHome: record.allowHome,
      minimumRating: record.minimumRating === null ? null : Number(record.minimumRating),
      minimumAcceptanceRate: record.minimumAcceptanceRate,
      maximumCancellationRate: record.maximumCancellationRate,
      dailyTechnicianLimit: record.dailyTechnicianLimit,
      strategy: record.strategy as ShopAutoDispatchRuleBody["strategy"],
      preferredTechnicianIds: this.readIds(record.preferredTechnicianIdsJson),
      travelMinutesPerKm: record.travelMinutesPerKm,
      strictWindow: record.strictWindow,
      candidates,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  public async replace(shopId: number, actorUserId: number, input: ShopAutoDispatchRuleBody) {
    const candidates = await this.listCandidates(shopId);
    const allowedIds = new Set(candidates.map((candidate) => candidate.id));
    if (input.preferredTechnicianIds.some((id) => !allowedIds.has(id))) {
      throw new ShopAutoDispatchRuleValidationError();
    }
    await prisma.shopAutoDispatchRule.upsert({
      where: { shopId },
      create: {
        shopId,
        ...this.toData(input),
        createdById: actorUserId,
        updatedById: actorUserId
      },
      update: {
        ...this.toData(input),
        updatedById: actorUserId,
        deletedAt: null
      }
    });
    return this.read(shopId);
  }

  private async listCandidates(shopId: number): Promise<ShopAutoDispatchTechnicianPayload[]> {
    const rows = await prisma.technicianShopAffiliation.findMany({
      where: { shopId, workStatus: "ACTIVE", activeKey: { not: null }, deletedAt: null },
      select: { technicianProfile: { select: { id: true, displayName: true } } },
      orderBy: [{ technicianProfileId: "asc" }]
    });
    return rows.map((row) => row.technicianProfile);
  }

  private readIds(value: unknown): number[] {
    return Array.isArray(value)
      ? value.filter((id): id is number => Number.isInteger(id) && Number(id) > 0)
      : [];
  }

  private toData(input: ShopAutoDispatchRuleBody) {
    return {
      enabled: input.enabled,
      startsOn: input.startsOn ? new Date(`${input.startsOn}T00:00:00.000Z`) : null,
      endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00.000Z`) : null,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      allowStore: input.allowStore,
      allowHome: input.allowHome,
      minimumRating: input.minimumRating,
      minimumAcceptanceRate: input.minimumAcceptanceRate,
      maximumCancellationRate: input.maximumCancellationRate,
      dailyTechnicianLimit: input.dailyTechnicianLimit,
      strategy: input.strategy,
      preferredTechnicianIdsJson: input.preferredTechnicianIds,
      travelMinutesPerKm: input.travelMinutesPerKm,
      strictWindow: input.strictWindow
    };
  }
}
