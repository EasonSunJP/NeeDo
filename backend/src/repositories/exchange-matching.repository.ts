import {
  BookingOrderStatus,
  ExchangeClaimStatus as DatabaseExchangeClaimStatus,
  ExchangeMatchEventType,
  ExchangeMatchingStatus as DatabaseExchangeMatchingStatus,
  ExchangePostStatus as DatabaseExchangePostStatus,
  NotificationType,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ExchangeMatchParticipantPayload,
  ExchangeMatchingPayload
} from "../types/exchange-matching.types";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";

type ExchangeMatchingPrismaClient = PrismaClient | Prisma.TransactionClient;

const matchingInclude = {
  exchangePost: {
    select: {
      id: true,
      authorUserId: true,
      ownerIdentityId: true,
      type: true,
      status: true,
      expiresAt: true,
      demand: { select: { matchMode: true } }
    }
  },
  participants: {
    where: { deletedAt: null },
    orderBy: { id: "asc" as const },
    include: {
      exchangeClaim: {
        select: {
          claimantIdentity: {
            select: {
              displayName: true,
              publicIdentifier: { select: { publicId: true } },
              user: { select: { username: true, avatarUrl: true } }
            }
          }
        }
      },
      shop: { select: { id: true, name: true } },
      technicianProfile: {
        select: {
          id: true,
          displayName: true,
          user: {
            select: {
              identities: {
                where: { type: "technician", isActive: true, deletedAt: null },
                select: {
                  displayName: true,
                  publicIdentifier: { select: { publicId: true } }
                },
                take: 1
              }
            }
          }
        }
      },
      service: { select: { id: true, name: true, durationMinutes: true } },
      technicianService: { select: { id: true, name: true, durationMinutes: true } }
    }
  }
} satisfies Prisma.ExchangeRequestMatchingInclude;

type MatchingRow = Prisma.ExchangeRequestMatchingGetPayload<{ include: typeof matchingInclude }>;

export interface ExchangeMatchingRecord {
  id: number;
  exchangePostId: number;
  ownerUserId: number;
  ownerIdentityId: number;
  postType: "demand" | "intelligence";
  postStatus: "published" | "withdrawn" | "expired" | "matched" | "closed";
  matchMode: "quick" | "selective" | null;
  expiresAt: Date;
  status: "open" | "matched" | "closed";
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  selectedQuoteTotalJpy: number;
  version: number;
  matchedAt: Date | null;
  payload: ExchangeMatchingPayload;
}

export interface ExchangeMatchingSelectionClaim {
  id: number;
  exchangePostId: number;
  claimantUserId: number;
  claimantIdentityId: number;
  shopId: number;
  technicianProfileId: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  scheduleSlotId: number;
  quoteAmountJpy: number;
  serviceNameSnapshot: string;
  serviceDurationSnapshot: number;
  currency: "JPY";
  status: "active";
  estimatedStartsAt: Date;
  estimatedEndsAt: Date;
}

export interface CompleteExchangeSelectionInput {
  matchingId: number;
  exchangePostId: number;
  selectedClaims: ExchangeMatchingSelectionClaim[];
  selectedClaimIds: number[];
  unselectedClaims: ExchangeMatchingSelectionClaim[];
  unselectedClaimIds: number[];
  selectedQuoteTotalJpy: number;
  effectiveTargetProviderCountAfter: number;
  effectiveBudgetMaxJpyAfter: number;
  adjustments: Array<
    | { type: "budget_increased"; before: number; after: number }
    | { type: "target_reduced"; before: number; after: number }
  >;
  versionBefore: number;
  versionAfter: number;
  actorUserId: number;
  actorIdentityId: number;
  idempotencyKey: string;
  payloadFingerprint: string;
  at: Date;
  audit: AuditLogCreateInput;
}

export class ExchangeMatchingRepository {
  public constructor(private readonly client: ExchangeMatchingPrismaClient = prisma) {}

  public runInTransaction<T>(
    handler: (repository: ExchangeMatchingRepository) => Promise<T>,
    transactionClient?: ExchangeMatchingPrismaClient
  ): Promise<T> {
    if (transactionClient) return handler(new ExchangeMatchingRepository(transactionClient));
    if (!("$transaction" in this.client)) return handler(this);
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction(
        (transaction) => handler(new ExchangeMatchingRepository(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
      )
    );
  }

  public async findForViewer(
    exchangePostId: number,
    viewerIdentityId: number
  ): Promise<ExchangeMatchingRecord | null> {
    const row = await this.client.exchangeRequestMatching.findFirst({
      where: {
        exchangePostId,
        deletedAt: null,
        OR: [
          { exchangePost: { ownerIdentityId: viewerIdentityId, deletedAt: null } },
          {
            participants: {
              some: { participantIdentityId: viewerIdentityId, deletedAt: null }
            }
          }
        ]
      },
      include: matchingInclude
    });
    if (!row) return null;
    return this.mapMatching(row, viewerIdentityId);
  }

  public async lockMatching(exchangePostId: number): Promise<ExchangeMatchingRecord | null> {
    const postLocks = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM \`exchange_posts\`
      WHERE id = ${exchangePostId} AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!postLocks[0]) return null;
    const matchingLocks = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM \`exchange_request_matchings\`
      WHERE exchange_post_id = ${exchangePostId} AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!matchingLocks[0]) return null;
    const row = await this.client.exchangeRequestMatching.findUnique({
      where: { exchangePostId },
      include: matchingInclude
    });
    return row ? this.mapMatching(row, row.exchangePost.ownerIdentityId) : null;
  }

  public async findIdempotentSelection(idempotencyKey: string): Promise<{
    payload: ExchangeMatchingPayload;
    payloadFingerprint: string;
  } | null> {
    const event = await this.client.exchangeMatchEvent.findFirst({
      where: {
        idempotencyKey,
        type: ExchangeMatchEventType.SELECTIVE_MATCHED,
        deletedAt: null
      },
      select: {
        payloadFingerprint: true,
        actorIdentityId: true,
        matching: { select: { exchangePostId: true } }
      }
    });
    if (!event?.payloadFingerprint || !event.actorIdentityId) return null;
    const record = await this.findForViewer(
      event.matching.exchangePostId,
      event.actorIdentityId
    );
    if (!record) return null;
    return { payload: record.payload, payloadFingerprint: event.payloadFingerprint };
  }

  public async lockActiveClaims(
    exchangePostId: number
  ): Promise<ExchangeMatchingSelectionClaim[]> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM \`exchange_claims\`
      WHERE exchange_post_id = ${exchangePostId}
        AND status = 'active'
        AND deleted_at IS NULL
      ORDER BY id ASC
      FOR UPDATE
    `);
    const ids = locked.map((row) => Number(row.id));
    if (ids.length === 0) return [];
    const rows = await this.client.exchangeClaim.findMany({
      where: { id: { in: ids }, exchangePostId, status: DatabaseExchangeClaimStatus.ACTIVE, deletedAt: null },
      include: {
        scheduleSlot: { select: { startsAt: true, endsAt: true } },
        service: { select: { name: true, durationMinutes: true } },
        technicianService: { select: { name: true, durationMinutes: true } }
      },
      orderBy: { id: "asc" }
    });
    return rows.map((row) => {
      const service = row.service ?? row.technicianService;
      if (!service) throw new Error("Exchange claim is missing its service relation");
      return {
        id: row.id,
        exchangePostId: row.exchangePostId,
        claimantUserId: row.claimantUserId,
        claimantIdentityId: row.claimantIdentityId,
        shopId: row.shopId,
        technicianProfileId: row.technicianProfileId,
        serviceId: row.serviceId,
        technicianServiceId: row.technicianServiceId,
        scheduleSlotId: row.scheduleSlotId,
        quoteAmountJpy: row.quoteAmountJpy,
        serviceNameSnapshot: service.name,
        serviceDurationSnapshot: service.durationMinutes,
        currency: "JPY",
        status: "active",
        estimatedStartsAt: row.scheduleSlot.startsAt,
        estimatedEndsAt: row.scheduleSlot.endsAt
      };
    });
  }

  public async lockTechnicians(technicianProfileIds: number[]): Promise<boolean> {
    if (technicianProfileIds.length === 0) return false;
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM \`technician_profiles\`
      WHERE id IN (${Prisma.join(technicianProfileIds)})
        AND deleted_at IS NULL
      ORDER BY id ASC
      FOR UPDATE
    `);
    return rows.length === technicianProfileIds.length;
  }

  public async hasParticipantConflict(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean> {
    const row = await this.client.exchangeMatchParticipant.findFirst({
      where: {
        technicianProfileId,
        estimatedStartsAt: { lt: endsAt },
        estimatedEndsAt: { gt: startsAt },
        deletedAt: null
      },
      select: { id: true }
    });
    return row !== null;
  }

  public async hasBookingConflict(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean> {
    const row = await this.client.bookingOrder.findFirst({
      where: {
        technicianProfileId,
        status: { in: [BookingOrderStatus.CONFIRMED, BookingOrderStatus.IN_SERVICE] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        deletedAt: null
      },
      select: { id: true }
    });
    return row !== null;
  }

  public async completeSelection(
    input: CompleteExchangeSelectionInput
  ): Promise<ExchangeMatchingPayload | null> {
    await this.client.exchangeMatchParticipant.createMany({
      data: input.selectedClaims.map((claim) => ({
        matchingId: input.matchingId,
        exchangePostId: input.exchangePostId,
        exchangeClaimId: claim.id,
        participantUserId: claim.claimantUserId,
        participantIdentityId: claim.claimantIdentityId,
        shopId: claim.shopId,
        technicianProfileId: claim.technicianProfileId,
        serviceId: claim.serviceId,
        technicianServiceId: claim.technicianServiceId,
        scheduleSlotId: claim.scheduleSlotId,
        quoteAmountJpy: claim.quoteAmountJpy,
        serviceNameSnapshot: claim.serviceNameSnapshot,
        serviceDurationSnapshot: claim.serviceDurationSnapshot,
        currency: "JPY",
        estimatedStartsAt: claim.estimatedStartsAt,
        estimatedEndsAt: claim.estimatedEndsAt,
        activeReservationKey: `request:${input.exchangePostId}:technician:${claim.technicianProfileId}`,
        matchedAt: input.at
      }))
    });
    await this.client.exchangeClaim.updateMany({
      where: { id: { in: input.selectedClaimIds }, status: DatabaseExchangeClaimStatus.ACTIVE, deletedAt: null },
      data: { status: DatabaseExchangeClaimStatus.MATCHED, activeKey: null, terminalAt: input.at }
    });
    if (input.unselectedClaimIds.length > 0) {
      await this.client.exchangeClaim.updateMany({
        where: { id: { in: input.unselectedClaimIds }, status: DatabaseExchangeClaimStatus.ACTIVE, deletedAt: null },
        data: { status: DatabaseExchangeClaimStatus.NOT_SELECTED, activeKey: null, terminalAt: input.at }
      });
    }
    const updated = await this.client.exchangeRequestMatching.updateMany({
      where: {
        id: input.matchingId,
        exchangePostId: input.exchangePostId,
        status: DatabaseExchangeMatchingStatus.OPEN,
        version: input.versionBefore,
        deletedAt: null
      },
      data: {
        status: DatabaseExchangeMatchingStatus.MATCHED,
        effectiveTargetProviderCount: input.effectiveTargetProviderCountAfter,
        effectiveBudgetMaxJpy: input.effectiveBudgetMaxJpyAfter,
        selectedQuoteTotalJpy: input.selectedQuoteTotalJpy,
        version: input.versionAfter,
        matchedAt: input.at
      }
    });
    if (updated.count !== 1) return null;
    await this.client.exchangePost.update({
      where: { id: input.exchangePostId },
      data: { status: DatabaseExchangePostStatus.MATCHED }
    });
    let eventVersion = input.versionBefore;
    for (const adjustment of input.adjustments) {
      const versionAfter = eventVersion + 1;
      await this.client.exchangeMatchEvent.create({
        data: {
          matchingId: input.matchingId,
          sequence: versionAfter,
          type:
            adjustment.type === "budget_increased"
              ? ExchangeMatchEventType.BUDGET_INCREASED
              : ExchangeMatchEventType.TARGET_REDUCED,
          actorUserId: input.actorUserId,
          actorIdentityId: input.actorIdentityId,
          versionBefore: eventVersion,
          versionAfter,
          idempotencyKey: null,
          payloadFingerprint: null,
          payload: {
            exchangePostId: input.exchangePostId,
            before: adjustment.before,
            after: adjustment.after,
            status: "open"
          }
        }
      });
      eventVersion = versionAfter;
    }
    await this.client.exchangeMatchEvent.create({
      data: {
        matchingId: input.matchingId,
        sequence: input.versionAfter,
        type: ExchangeMatchEventType.SELECTIVE_MATCHED,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        versionBefore: eventVersion,
        versionAfter: input.versionAfter,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        payload: {
          exchangePostId: input.exchangePostId,
          selectedClaimIds: input.selectedClaimIds,
          selectedCount: input.selectedClaimIds.length,
          selectedQuoteTotalJpy: input.selectedQuoteTotalJpy,
          status: "matched"
        }
      }
    });
    await this.client.notification.createMany({
      data: [
        ...input.selectedClaims.map((claim) => ({
          recipientUserId: claim.claimantUserId,
          recipientIdentityId: claim.claimantIdentityId,
          actorUserId: input.actorUserId,
          actorIdentityId: input.actorIdentityId,
          type: NotificationType.SYSTEM,
          title: "exchange.matching.selected.title",
          body: "exchange.matching.selected.body",
          payload: {
            exchangePostId: input.exchangePostId,
            exchangeClaimId: claim.id,
            status: "matched"
          },
          createdAt: input.at
        })),
        ...input.unselectedClaims.map((claim) => ({
          recipientUserId: claim.claimantUserId,
          recipientIdentityId: claim.claimantIdentityId,
          actorUserId: input.actorUserId,
          actorIdentityId: input.actorIdentityId,
          type: NotificationType.SYSTEM,
          title: "exchange.matching.not_selected.title",
          body: "exchange.matching.not_selected.body",
          payload: {
            exchangePostId: input.exchangePostId,
            exchangeClaimId: claim.id,
            status: "not_selected"
          },
          createdAt: input.at
        }))
      ]
    });
    await this.client.auditLog.create({ data: toAuditLogCreateData(input.audit) });
    const result = await this.findForViewer(input.exchangePostId, input.actorIdentityId);
    return result?.payload ?? null;
  }

  private mapMatching(row: MatchingRow, viewerIdentityId: number): ExchangeMatchingRecord {
    const isOwner = row.exchangePost.ownerIdentityId === viewerIdentityId;
    const participants = row.participants
      .filter((participant) => isOwner || participant.participantIdentityId === viewerIdentityId)
      .map((participant) => this.mapParticipant(participant));
    const status = row.status.toLowerCase() as ExchangeMatchingRecord["status"];
    const payload: ExchangeMatchingPayload = {
      exchangePostId: row.exchangePostId,
      status,
      version: row.version,
      effectiveTargetProviderCount: row.effectiveTargetProviderCount,
      effectiveBudgetMaxJpy: row.effectiveBudgetMaxJpy,
      selectedQuoteTotalJpy: row.selectedQuoteTotalJpy,
      matchedAt: row.matchedAt?.toISOString() ?? null,
      participants,
      viewer: { canSelect: isOwner && status === "open" }
    };
    return {
      id: row.id,
      exchangePostId: row.exchangePostId,
      ownerUserId: row.exchangePost.authorUserId,
      ownerIdentityId: row.exchangePost.ownerIdentityId,
      postType: row.exchangePost.type.toLowerCase() as ExchangeMatchingRecord["postType"],
      postStatus: row.exchangePost.status.toLowerCase() as ExchangeMatchingRecord["postStatus"],
      matchMode: row.exchangePost.demand?.matchMode.toLowerCase() as ExchangeMatchingRecord["matchMode"] ?? null,
      expiresAt: row.exchangePost.expiresAt,
      status,
      effectiveTargetProviderCount: row.effectiveTargetProviderCount,
      effectiveBudgetMaxJpy: row.effectiveBudgetMaxJpy,
      selectedQuoteTotalJpy: row.selectedQuoteTotalJpy,
      version: row.version,
      matchedAt: row.matchedAt,
      payload
    };
  }

  private mapParticipant(
    participant: MatchingRow["participants"][number]
  ): ExchangeMatchParticipantPayload {
    const claimant = participant.exchangeClaim.claimantIdentity;
    const technicianIdentity = participant.technicianProfile.user.identities[0];
    const service = participant.service ?? participant.technicianService;
    if (!service) throw new Error("Exchange match participant is missing its service relation");
    return {
      exchangeClaimId: participant.exchangeClaimId,
      provider: {
        publicId: claimant.publicIdentifier?.publicId ?? "",
        displayName: claimant.displayName ?? claimant.user.username,
        avatarUrl: claimant.user.avatarUrl
      },
      shop: participant.shop,
      technician: {
        profileId: participant.technicianProfile.id,
        publicId: technicianIdentity?.publicIdentifier?.publicId ?? "",
        displayName: participant.technicianProfile.displayName ?? technicianIdentity?.displayName ?? ""
      },
      service: {
        ref: participant.serviceId
          ? `shop:${participant.serviceId}`
          : `technician:${participant.technicianServiceId!}`,
        name: service.name,
        durationMinutes: service.durationMinutes
      },
      scheduleSlotId: participant.scheduleSlotId,
      quoteAmountJpy: participant.quoteAmountJpy,
      currency: "JPY",
      estimatedStartsAt: participant.estimatedStartsAt.toISOString(),
      estimatedEndsAt: participant.estimatedEndsAt.toISOString(),
      matchedAt: participant.matchedAt.toISOString()
    };
  }
}
