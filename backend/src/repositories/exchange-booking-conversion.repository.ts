import {
  BookingOrderStatus,
  ExchangeClaimStatus,
  ExchangeMatchEventType,
  ExchangeMatchingStatus,
  ExchangePostStatus,
  ExchangePostType,
  NotificationType,
  OrderType,
  Prisma,
  ScheduleSlotStatus,
  ServiceOwnerType,
  ServicePaymentMethod,
  ServicePaymentStatus,
  ShopPricingMode,
  TechnicianServiceReviewStatus,
  TechnicianShopWorkStatus,
  type PrismaClient
} from "@prisma/client";
import { randomInt } from "node:crypto";
import { prisma } from "../prisma/client";
import type {
  ExchangeBookingConversionInput,
  ExchangeBookingConversionPayload,
  ExchangeBookingConversionRepositoryOptions,
  ExchangeBookingConversionRepositoryResult,
  ExchangeCommittedNotification
} from "../types/exchange-booking-conversion.types";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData } from "./audit-log.repository";

type ExchangeBookingConversionClient = PrismaClient | Prisma.TransactionClient;

const participantInclude = {
  exchangeClaim: true,
  participantIdentity: {
    select: { publicIdentifier: { select: { publicId: true } } }
  },
  bookingOrder: {
    select: {
      id: true,
      orderNo: true,
      status: true,
      startsAt: true,
      endsAt: true
    }
  }
} satisfies Prisma.ExchangeMatchParticipantInclude;

const matchingInclude = {
  exchangePost: {
    include: { demand: true }
  },
  participants: {
    where: { deletedAt: null },
    orderBy: { id: "asc" as const },
    include: participantInclude
  }
} satisfies Prisma.ExchangeRequestMatchingInclude;

const slotInclude = {
  shop: {
    select: {
      id: true,
      status: true,
      pricingMode: true,
      deletedAt: true,
      entitySuspensions: {
        where: { status: "ACTIVE", activeKey: { not: null }, deletedAt: null },
        select: { id: true }
      }
    }
  },
  technicianProfile: {
    select: {
      id: true,
      status: true,
      deletedAt: true,
      user: { select: { isActive: true, deletedAt: true } },
      technicianShopAffiliations: {
        select: {
          shopId: true,
          workStatus: true,
          activeKey: true,
          startsAt: true,
          endsAt: true,
          deletedAt: true
        }
      }
    }
  },
  service: {
    select: {
      id: true,
      shopId: true,
      technicianProfileId: true,
      status: true,
      deletedAt: true
    }
  },
  technicianService: {
    select: {
      id: true,
      shopId: true,
      technicianId: true,
      isActive: true,
      isBookable: true,
      reviewStatus: true,
      deletedAt: true
    }
  }
} satisfies Prisma.ScheduleSlotInclude;

type MatchingRow = Prisma.ExchangeRequestMatchingGetPayload<{
  include: typeof matchingInclude;
}>;
type ParticipantRow = Prisma.ExchangeMatchParticipantGetPayload<{
  include: typeof participantInclude;
}>;
type SlotRow = Prisma.ScheduleSlotGetPayload<{ include: typeof slotInclude }>;

type ConversionFailure = Exclude<
  ExchangeBookingConversionRepositoryResult,
  { outcome: "created" | "replayed" }
>;

class ConversionAbort extends Error {
  public constructor(public readonly result: ConversionFailure) {
    super(result.outcome);
    this.name = "ExchangeBookingConversionAbort";
  }
}

export interface ExchangeBookingOwnerContext {
  ownerUserId: number;
  ownerIdentityId: number;
  serviceMode: "home" | "store";
}

interface CreatedOrder {
  participantId: number;
  exchangeClaimId: number;
  participantUserId: number;
  participantIdentityId: number;
  orderId: number;
  orderNo: string;
  providerPublicId: string;
  quoteAmountJpy: number;
  startsAt: Date;
  endsAt: Date;
}

const sameDate = (left: Date, right: Date): boolean => left.getTime() === right.getTime();
const ORDER_NUMBER_ATTEMPTS = 5;

export class ExchangeBookingConversionRepository {
  public constructor(
    private readonly client: ExchangeBookingConversionClient = prisma,
    private readonly orderNumberSuffix: () => number = () => randomInt(1000, 10_000)
  ) {}

  public async findOwnerContext(
    exchangePostId: number,
    viewerIdentityId: number
  ): Promise<ExchangeBookingOwnerContext | null> {
    const row = await this.client.exchangePost.findFirst({
      where: {
        id: exchangePostId,
        type: ExchangePostType.DEMAND,
        deletedAt: null,
        OR: [
          { ownerIdentityId: viewerIdentityId },
          {
            matchParticipants: {
              some: { participantIdentityId: viewerIdentityId, deletedAt: null }
            }
          }
        ]
      },
      select: {
        authorUserId: true,
        ownerIdentityId: true,
        demand: { select: { serviceMode: true } }
      }
    });
    if (!row?.ownerIdentityId || !row.demand) return null;
    return {
      ownerUserId: row.authorUserId,
      ownerIdentityId: row.ownerIdentityId,
      serviceMode: row.demand.serviceMode === "HOME" ? "home" : "store"
    };
  }

  public async convert(
    input: ExchangeBookingConversionInput,
    options: ExchangeBookingConversionRepositoryOptions = {}
  ): Promise<ExchangeBookingConversionRepositoryResult> {
    if (!("$transaction" in this.client)) {
      return this.convertInTransaction(input, options);
    }
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(
          (transaction) =>
            new ExchangeBookingConversionRepository(
              transaction,
              this.orderNumberSuffix
            ).convertInTransaction(input, options),
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        )
      );
    } catch (error) {
      if (error instanceof ConversionAbort) return error.result;
      throw error;
    }
  }

  private async convertInTransaction(
    input: ExchangeBookingConversionInput,
    options: ExchangeBookingConversionRepositoryOptions
  ): Promise<ExchangeBookingConversionRepositoryResult> {
    if (!(await this.lockOne("users", input.actorUserId))) {
      this.abort("not_found");
    }
    if (!(await this.lockOne("exchange_posts", input.exchangePostId))) {
      this.abort("not_found");
    }

    const matchingLock = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM exchange_request_matchings
      WHERE exchange_post_id = ${input.exchangePostId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (matchingLock.length !== 1) this.abort("not_found");

    const matching = await this.loadMatching(input.exchangePostId);
    if (!matching) this.abort("not_found");

    if (
      matching.exchangePost.authorUserId !== input.actorUserId ||
      matching.exchangePost.ownerIdentityId !== input.actorIdentityId
    ) {
      this.abort("not_allowed");
    }

    const replay = await this.findAuthorizedReplay(input, matching);
    if (replay) return replay;

    const committedEvent = await this.client.exchangeMatchEvent.findFirst({
      where: {
        matchingId: matching.id,
        type: ExchangeMatchEventType.BOOKINGS_CREATED,
        deletedAt: null
      },
      select: {
        matchingId: true,
        idempotencyKey: true,
        payloadFingerprint: true,
        actorUserId: true,
        actorIdentityId: true,
        type: true
      }
    });
    if (committedEvent) {
      this.validateCommittedActor(matching, committedEvent);
      if (committedEvent.idempotencyKey !== input.idempotencyKey) {
        this.abort("already_created");
      }
      if (committedEvent.payloadFingerprint !== input.payloadFingerprint) {
        this.abort("idempotency_conflict");
      }
      const payload = await this.reconstructPayload(
        input.exchangePostId,
        committedEvent.matchingId
      );
      if (!payload) this.abort("invalid_state");
      return { outcome: "replayed", payload, notifications: [] };
    }

    if (
      matching.exchangePost.type !== ExchangePostType.DEMAND ||
      matching.exchangePost.status !== ExchangePostStatus.MATCHED ||
      matching.status !== ExchangeMatchingStatus.MATCHED ||
      !matching.exchangePost.demand
    ) {
      this.abort("invalid_state");
    }
    const demand = matching.exchangePost.demand;
    if (matching.version !== input.expectedVersion) {
      this.abort("version_conflict", matching.version);
    }

    const participantIds = matching.participants.map(({ id }) => id).sort((a, b) => a - b);
    if (
      participantIds.length === 0 ||
      participantIds.length !== matching.effectiveTargetProviderCount
    ) {
      this.abort("invalid_state");
    }

    const lockedParticipants = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM exchange_match_participants
      WHERE id IN (${Prisma.join(participantIds)})
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE
    `);
    if (lockedParticipants.length !== participantIds.length) this.abort("invalid_state");

    const participants = await this.client.exchangeMatchParticipant.findMany({
      where: {
        id: { in: participantIds },
        matchingId: matching.id,
        exchangePostId: input.exchangePostId,
        deletedAt: null
      },
      include: participantInclude,
      orderBy: { id: "asc" }
    });
    if (participants.length !== participantIds.length) this.abort("invalid_state");

    const technicianIds = [
      ...new Set(participants.map(({ technicianProfileId }) => technicianProfileId))
    ].sort((left, right) => left - right);
    if (technicianIds.length !== participants.length) this.abort("slot_unavailable");
    const lockedTechnicians = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM technician_profiles
      WHERE id IN (${Prisma.join(technicianIds)})
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE
    `);
    if (lockedTechnicians.length !== technicianIds.length) this.abort("slot_unavailable");

    const customerProfile = await this.client.customerProfile.findFirst({
      where: { userId: matching.exchangePost.authorUserId, deletedAt: null },
      select: { membershipLevel: true }
    });
    const isBlackMember = customerProfile?.membershipLevel.toLowerCase() === "black";
    const superseded = isBlackMember
      ? []
      : await this.client.bookingOrder.findMany({
          where: {
            customerUserId: matching.exchangePost.authorUserId,
            status: BookingOrderStatus.PENDING,
            deletedAt: null,
            exchangeMatchParticipant: { is: null }
          },
          select: { id: true, scheduleSlotId: true },
          orderBy: { id: "asc" }
        });

    const participantSlotIds = [
      ...new Set(participants.map(({ scheduleSlotId }) => scheduleSlotId))
    ];
    const slotIds = [
      ...new Set([...participantSlotIds, ...superseded.map(({ scheduleSlotId }) => scheduleSlotId)])
    ].sort((left, right) => left - right);
    const lockedSlots = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM schedule_slots
      WHERE id IN (${Prisma.join(slotIds)})
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE
    `);
    if (lockedSlots.length !== slotIds.length) this.abort("slot_unavailable");

    const slots = await this.client.scheduleSlot.findMany({
      where: { id: { in: slotIds }, deletedAt: null },
      include: slotInclude,
      orderBy: { id: "asc" }
    });
    if (slots.length !== slotIds.length) this.abort("slot_unavailable");
    let slotsById = new Map(slots.map((slot) => [slot.id, slot]));

    this.validateParticipants(participants, slotsById, input.occurredAt);
    await this.validateExternalOverlaps(participants, participantIds);

    await this.validateCustomerOverlap(
      matching.exchangePost.authorUserId,
      participants,
      isBlackMember
    );

    await this.replaceOrdinaryPending(
      superseded,
      matching.exchangePost.authorUserId,
      input,
      options
    );

    const reloadedSlots = await this.client.scheduleSlot.findMany({
      where: { id: { in: slotIds }, deletedAt: null },
      include: slotInclude,
      orderBy: { id: "asc" }
    });
    if (reloadedSlots.length !== slotIds.length) this.abort("slot_unavailable");
    slotsById = new Map(reloadedSlots.map((slot) => [slot.id, slot]));
    this.validateParticipants(participants, slotsById, input.occurredAt);

    const serviceMode = demand.serviceMode === "HOME" ? "home" : "store";
    const created: CreatedOrder[] = [];
    const usedOrderNumbers = new Set<string>();
    for (const participant of participants) {
      const slot = slotsById.get(participant.scheduleSlotId);
      if (!slot) this.abort("slot_unavailable");
      const nextBookedCount = slot.bookedCount + 1;
      const slotUpdate = await this.client.scheduleSlot.updateMany({
        where: {
          id: slot.id,
          deletedAt: null,
          status: ScheduleSlotStatus.AVAILABLE,
          startsAt: { gt: input.occurredAt },
          bookedCount: { lt: slot.capacity }
        },
        data: {
          bookedCount: { increment: 1 },
          status:
            nextBookedCount >= slot.capacity
              ? ScheduleSlotStatus.BOOKED
              : ScheduleSlotStatus.AVAILABLE
        }
      });
      if (slotUpdate.count !== 1) this.abort("slot_unavailable");
      slot.bookedCount = nextBookedCount;
      slot.status =
        nextBookedCount >= slot.capacity ? ScheduleSlotStatus.BOOKED : ScheduleSlotStatus.AVAILABLE;

      const order = await this.createBookingOrderWithUniqueNumber(
        input.occurredAt,
        usedOrderNumbers,
        (orderNo) => ({
          orderNo,
          orderType: OrderType.REQUEST,
          customerUserId: matching.exchangePost.authorUserId,
          serviceId: participant.serviceId,
          technicianServiceId: participant.technicianServiceId,
          shopId: participant.shopId,
          technicianProfileId: participant.technicianProfileId,
          scheduleSlotId: participant.scheduleSlotId,
          status: BookingOrderStatus.PENDING,
          fulfillmentMode: serviceMode,
          fulfillmentAddressSnapshot:
            serviceMode === "home"
              ? {
                  line1: demand.addressLine1,
                  line2: demand.addressLine2,
                  line3: demand.addressLine3
                }
              : Prisma.DbNull,
          priceAmount: participant.quoteAmountJpy,
          currency: "JPY",
          pricingModeSnapshot: participant.serviceId
            ? ShopPricingMode.MERCHANT
            : ShopPricingMode.TECHNICIAN,
          serviceOwnerType: participant.serviceId
            ? ServiceOwnerType.SHOP
            : ServiceOwnerType.TECHNICIAN,
          serviceOwnerId: participant.serviceId ?? participant.technicianProfileId,
          serviceNameSnapshot: participant.serviceNameSnapshot,
          servicePriceSnapshot: participant.quoteAmountJpy,
          serviceDurationSnapshot: participant.serviceDurationSnapshot,
          serviceSnapshotJson: {
            entityType: participant.serviceId ? "service" : "technician_service",
            serviceId: participant.serviceId,
            technicianServiceId: participant.technicianServiceId,
            technicianProfileId: participant.technicianProfileId,
            exchangeClaimId: participant.exchangeClaimId,
            name: participant.serviceNameSnapshot,
            priceAmount: participant.quoteAmountJpy,
            currency: "JPY",
            durationMinutes: participant.serviceDurationSnapshot
          },
          startsAt: participant.estimatedStartsAt,
          endsAt: participant.estimatedEndsAt,
          paymentMethod: ServicePaymentMethod.ONSITE,
          paymentStatus: ServicePaymentStatus.PENDING,
          paymentAmountJpy: participant.quoteAmountJpy,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: BookingOrderStatus.PENDING,
              actorUserId: input.actorUserId
            }
          }
        })
      );

      const participantUpdate = await this.client.exchangeMatchParticipant.updateMany({
        where: {
          id: participant.id,
          bookingOrderId: null,
          activeReservationKey: { not: null },
          deletedAt: null
        },
        data: {
          bookingOrderId: order.id,
          bookedAt: input.occurredAt,
          activeReservationKey: null
        }
      });
      if (participantUpdate.count !== 1) this.abort("slot_unavailable");

      created.push({
        participantId: participant.id,
        exchangeClaimId: participant.exchangeClaimId,
        participantUserId: participant.participantUserId,
        participantIdentityId: participant.participantIdentityId,
        orderId: order.id,
        orderNo: order.orderNo,
        providerPublicId: participant.participantIdentity.publicIdentifier?.publicId ?? "",
        quoteAmountJpy: participant.quoteAmountJpy,
        startsAt: participant.estimatedStartsAt,
        endsAt: participant.estimatedEndsAt
      });
    }

    const versionAfter = matching.version + 1;
    const updated = await this.client.exchangeRequestMatching.updateMany({
      where: {
        id: matching.id,
        version: matching.version,
        status: ExchangeMatchingStatus.MATCHED,
        deletedAt: null
      },
      data: { version: versionAfter }
    });
    if (updated.count !== 1) this.abort("version_conflict", matching.version);

    const participantBookingIds = created.map(({ participantId, orderId }) => ({
      participantId,
      orderId
    }));
    const quoteTotalJpy = created.reduce((sum, item) => sum + item.quoteAmountJpy, 0);
    await this.client.exchangeMatchEvent.create({
      data: {
        matchingId: matching.id,
        sequence: versionAfter,
        type: ExchangeMatchEventType.BOOKINGS_CREATED,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        versionBefore: matching.version,
        versionAfter,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        payload: {
          exchangePostId: input.exchangePostId,
          participantBookingIds,
          count: created.length,
          quoteTotalJpy
        },
        createdAt: input.occurredAt
      }
    });

    const notifications: ExchangeCommittedNotification[] = [];
    for (const item of created) {
      const row = await this.client.notification.create({
        data: {
          recipientUserId: item.participantUserId,
          recipientIdentityId: item.participantIdentityId,
          actorUserId: input.actorUserId,
          actorIdentityId: input.actorIdentityId,
          type: NotificationType.SYSTEM,
          title: "exchange.booking.created.title",
          body: "exchange.booking.created.body",
          payload: {
            exchangePostId: input.exchangePostId,
            exchangeClaimId: item.exchangeClaimId,
            orderId: item.orderId,
            orderNo: item.orderNo,
            status: "pending"
          },
          createdAt: input.occurredAt
        }
      });
      notifications.push({
        id: row.id,
        recipientUserId: row.recipientUserId,
        recipientIdentityId: row.recipientIdentityId,
        actorUserId: row.actorUserId,
        actorIdentityId: row.actorIdentityId,
        type: "system",
        title: row.title,
        body: row.body,
        payload: row.payload,
        readAt: row.readAt,
        createdAt: row.createdAt
      });
    }

    await this.client.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        action: "exchange.matching.bookings.create",
        targetId: matching.id,
        metadata: {
          exchangePostId: input.exchangePostId,
          participantBookingIds,
          count: created.length,
          quoteTotalJpy,
          versionBefore: matching.version,
          versionAfter
        }
      })
    });

    return {
      outcome: "created",
      payload: this.toPayload(input.exchangePostId, versionAfter, input.occurredAt, created),
      notifications
    };
  }

  private async findAuthorizedReplay(
    input: ExchangeBookingConversionInput,
    matching: MatchingRow
  ): Promise<{
    outcome: "replayed";
    payload: ExchangeBookingConversionPayload;
    notifications: ExchangeCommittedNotification[];
  } | null> {
    const event = await this.client.exchangeMatchEvent.findFirst({
      where: { idempotencyKey: input.idempotencyKey, deletedAt: null },
      select: {
        matchingId: true,
        type: true,
        payloadFingerprint: true,
        actorUserId: true,
        actorIdentityId: true
      }
    });
    if (!event) return null;
    this.validateCommittedActor(matching, event);
    if (
      event.type !== ExchangeMatchEventType.BOOKINGS_CREATED ||
      event.matchingId !== matching.id ||
      event.payloadFingerprint !== input.payloadFingerprint
    ) {
      this.abort("idempotency_conflict");
    }
    const payload = await this.reconstructPayload(input.exchangePostId, event.matchingId);
    if (!payload) this.abort("idempotency_conflict");
    return { outcome: "replayed", payload, notifications: [] };
  }

  private validateCommittedActor(
    matching: MatchingRow,
    event: { actorUserId: number | null; actorIdentityId: number | null }
  ): void {
    if (
      event.actorUserId !== matching.exchangePost.authorUserId ||
      event.actorIdentityId !== matching.exchangePost.ownerIdentityId
    ) {
      this.abort("not_allowed");
    }
  }

  private async reconstructPayload(
    exchangePostId: number,
    matchingId: number
  ): Promise<ExchangeBookingConversionPayload | null> {
    const matching = await this.client.exchangeRequestMatching.findFirst({
      where: { id: matchingId, exchangePostId, deletedAt: null },
      include: matchingInclude
    });
    if (!matching || matching.participants.length === 0) return null;
    if (
      matching.participants.some(
        (participant) => !participant.bookingOrder || !participant.bookedAt
      )
    ) {
      return null;
    }
    const bookedAt = matching.participants[0].bookedAt;
    if (!bookedAt) return null;
    return {
      exchangePostId,
      matchingVersion: matching.version,
      bookedAt: bookedAt.toISOString(),
      orders: matching.participants.map((participant) => ({
        exchangeClaimId: participant.exchangeClaimId,
        orderId: participant.bookingOrder!.id,
        orderNo: participant.bookingOrder!.orderNo,
        status: "pending" as const,
        providerPublicId: participant.participantIdentity.publicIdentifier?.publicId ?? "",
        quoteAmountJpy: participant.quoteAmountJpy,
        startsAt: participant.estimatedStartsAt.toISOString(),
        endsAt: participant.estimatedEndsAt.toISOString()
      }))
    };
  }

  private async loadMatching(exchangePostId: number): Promise<MatchingRow | null> {
    return this.client.exchangeRequestMatching.findFirst({
      where: { exchangePostId, deletedAt: null },
      include: matchingInclude
    });
  }

  private async lockOne(table: "users" | "exchange_posts", id: number): Promise<boolean> {
    const rows =
      table === "users"
        ? await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
            SELECT id FROM users
            WHERE id = ${id} AND deleted_at IS NULL
            FOR UPDATE
          `)
        : await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
            SELECT id FROM exchange_posts
            WHERE id = ${id} AND deleted_at IS NULL
            FOR UPDATE
          `);
    return rows.length === 1;
  }

  private validateParticipants(
    participants: ParticipantRow[],
    slotsById: Map<number, SlotRow>,
    occurredAt: Date
  ): void {
    for (const participant of participants) {
      const claim = participant.exchangeClaim;
      const slot = slotsById.get(participant.scheduleSlotId);
      const activeAffiliation = slot?.technicianProfile?.technicianShopAffiliations.some(
        (affiliation) =>
          affiliation.shopId === participant.shopId &&
          affiliation.workStatus === TechnicianShopWorkStatus.ACTIVE &&
          affiliation.activeKey !== null &&
          affiliation.startsAt <= occurredAt &&
          (affiliation.endsAt === null || affiliation.endsAt > occurredAt) &&
          affiliation.deletedAt === null
      );
      if (
        participant.bookingOrderId !== null ||
        participant.activeReservationKey === null ||
        participant.currency !== "JPY" ||
        participant.quoteAmountJpy <= 0 ||
        participant.estimatedStartsAt >= participant.estimatedEndsAt ||
        !participant.participantIdentity.publicIdentifier ||
        !slot ||
        slot.status !== ScheduleSlotStatus.AVAILABLE ||
        slot.startsAt <= occurredAt ||
        slot.bookedCount >= slot.capacity ||
        slot.shopId !== participant.shopId ||
        slot.technicianProfileId !== participant.technicianProfileId ||
        slot.serviceId !== participant.serviceId ||
        slot.technicianServiceId !== participant.technicianServiceId ||
        !sameDate(slot.startsAt, participant.estimatedStartsAt) ||
        !sameDate(slot.endsAt, participant.estimatedEndsAt) ||
        slot.shop.deletedAt !== null ||
        slot.shop.status !== "published" ||
        slot.shop.entitySuspensions.length !== 0 ||
        !slot.technicianProfile ||
        slot.technicianProfile.deletedAt !== null ||
        slot.technicianProfile.status !== "published" ||
        slot.technicianProfile.user.deletedAt !== null ||
        !slot.technicianProfile.user.isActive ||
        !activeAffiliation ||
        claim.deletedAt !== null ||
        claim.status !== ExchangeClaimStatus.MATCHED ||
        claim.exchangePostId !== participant.exchangePostId ||
        claim.claimantUserId !== participant.participantUserId ||
        claim.claimantIdentityId !== participant.participantIdentityId ||
        claim.shopId !== participant.shopId ||
        claim.technicianProfileId !== participant.technicianProfileId ||
        claim.serviceId !== participant.serviceId ||
        claim.technicianServiceId !== participant.technicianServiceId ||
        claim.scheduleSlotId !== participant.scheduleSlotId ||
        claim.quoteAmountJpy !== participant.quoteAmountJpy
      ) {
        this.abort("slot_unavailable");
      }
      if (participant.serviceId !== null) {
        if (
          slot.shop.pricingMode !== ShopPricingMode.MERCHANT ||
          participant.technicianServiceId !== null ||
          !slot.service ||
          slot.technicianService !== null ||
          slot.service.deletedAt !== null ||
          slot.service.status !== "published" ||
          slot.service.shopId !== participant.shopId ||
          (slot.service.technicianProfileId !== null &&
            slot.service.technicianProfileId !== participant.technicianProfileId)
        ) {
          this.abort("slot_unavailable");
        }
      } else if (
        participant.technicianServiceId === null ||
        slot.shop.pricingMode !== ShopPricingMode.TECHNICIAN ||
        slot.service !== null ||
        !slot.technicianService ||
        slot.technicianService.deletedAt !== null ||
        !slot.technicianService.isActive ||
        !slot.technicianService.isBookable ||
        slot.technicianService.reviewStatus !== TechnicianServiceReviewStatus.APPROVED ||
        slot.technicianService.shopId !== participant.shopId ||
        slot.technicianService.technicianId !== participant.technicianProfileId
      ) {
        this.abort("slot_unavailable");
      }
    }
  }

  private async validateExternalOverlaps(
    participants: ParticipantRow[],
    participantIds: number[]
  ): Promise<void> {
    const booking = await this.client.bookingOrder.findFirst({
      where: {
        status: { in: [BookingOrderStatus.CONFIRMED, BookingOrderStatus.IN_SERVICE] },
        deletedAt: null,
        OR: participants.map((participant) => ({
          technicianProfileId: participant.technicianProfileId,
          startsAt: { lt: participant.estimatedEndsAt },
          endsAt: { gt: participant.estimatedStartsAt }
        }))
      },
      select: { id: true }
    });
    if (booking) this.abort("slot_unavailable");

    const reservation = await this.client.exchangeMatchParticipant.findFirst({
      where: {
        id: { notIn: participantIds },
        activeReservationKey: { not: null },
        deletedAt: null,
        OR: participants.map((participant) => ({
          technicianProfileId: participant.technicianProfileId,
          estimatedStartsAt: { lt: participant.estimatedEndsAt },
          estimatedEndsAt: { gt: participant.estimatedStartsAt }
        }))
      },
      select: { id: true }
    });
    if (reservation) this.abort("slot_unavailable");
  }

  private async validateCustomerOverlap(
    customerUserId: number,
    participants: ParticipantRow[],
    isBlackMember: boolean
  ): Promise<void> {
    const order = await this.client.bookingOrder.findFirst({
      where: {
        customerUserId,
        status: {
          in: isBlackMember
            ? [
                BookingOrderStatus.PENDING,
                BookingOrderStatus.CONFIRMED,
                BookingOrderStatus.IN_SERVICE
              ]
            : [BookingOrderStatus.CONFIRMED, BookingOrderStatus.IN_SERVICE]
        },
        deletedAt: null,
        OR: participants.map((participant) => ({
          startsAt: { lt: participant.estimatedEndsAt },
          endsAt: { gt: participant.estimatedStartsAt }
        }))
      },
      select: { id: true }
    });
    if (order) this.abort("slot_unavailable");
  }

  private async replaceOrdinaryPending(
    superseded: Array<{ id: number; scheduleSlotId: number }>,
    customerUserId: number,
    input: ExchangeBookingConversionInput,
    options: ExchangeBookingConversionRepositoryOptions
  ): Promise<void> {
    if (superseded.length === 0) return;
    const supersededIds = superseded.map(({ id }) => id);
    const cancelled = await this.client.bookingOrder.updateMany({
      where: {
        id: { in: supersededIds },
        customerUserId,
        status: BookingOrderStatus.PENDING,
        deletedAt: null,
        exchangeMatchParticipant: { is: null }
      },
      data: {
        status: BookingOrderStatus.CANCELLED,
        cancelReason: "superseded_by_exchange_booking_batch"
      }
    });
    if (cancelled.count !== superseded.length) this.abort("slot_unavailable");

    const releaseCounts = new Map<number, number>();
    for (const order of superseded) {
      releaseCounts.set(order.scheduleSlotId, (releaseCounts.get(order.scheduleSlotId) ?? 0) + 1);
    }
    for (const [scheduleSlotId, releaseCount] of [...releaseCounts].sort(
      ([left], [right]) => left - right
    )) {
      const released = await this.client.scheduleSlot.updateMany({
        where: {
          id: scheduleSlotId,
          bookedCount: { gte: releaseCount },
          deletedAt: null
        },
        data: {
          bookedCount: { decrement: releaseCount },
          status: ScheduleSlotStatus.AVAILABLE
        }
      });
      if (released.count !== 1) this.abort("slot_unavailable");
    }

    await this.client.orderStatusHistory.createMany({
      data: superseded.map((order) => ({
        bookingOrderId: order.id,
        fromStatus: BookingOrderStatus.PENDING,
        toStatus: BookingOrderStatus.CANCELLED,
        actorUserId: input.actorUserId,
        reason: "superseded_by_exchange_booking_batch",
        metadata: { exchangePostId: input.exchangePostId }
      }))
    });

    if (options.invalidateSupersededAffiliate) {
      for (const bookingOrderId of supersededIds) {
        await options.invalidateSupersededAffiliate({
          transactionClient: this.client as Prisma.TransactionClient,
          bookingOrderId,
          actorUserId: input.actorUserId
        });
      }
    }
  }

  private async createBookingOrderWithUniqueNumber(
    occurredAt: Date,
    usedOrderNumbers: Set<string>,
    createData: (orderNo: string) => Prisma.BookingOrderCreateArgs["data"]
  ): Promise<{ id: number; orderNo: string }> {
    for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt += 1) {
      const orderNo = this.createOrderNo(occurredAt);
      if (usedOrderNumbers.has(orderNo)) continue;
      try {
        const order = await this.client.bookingOrder.create({ data: createData(orderNo) });
        usedOrderNumbers.add(orderNo);
        return order;
      } catch (error) {
        if (!this.isOrderNumberConflict(error)) throw error;
      }
    }
    throw new Error("error.booking.order_number_unavailable");
  }

  private isOrderNumberConflict(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
      return false;
    }
    const meta =
      "meta" in error && error.meta && typeof error.meta === "object" ? error.meta : null;
    const target = meta && "target" in meta ? meta.target : null;
    const targets = Array.isArray(target) ? target : [target];
    return targets.some(
      (value) =>
        value === "booking_orders_order_no_key" ||
        value === "booking_orders.order_no" ||
        value === "order_no" ||
        value === "orderNo"
    );
  }

  private toPayload(
    exchangePostId: number,
    matchingVersion: number,
    bookedAt: Date,
    created: CreatedOrder[]
  ): ExchangeBookingConversionPayload {
    return {
      exchangePostId,
      matchingVersion,
      bookedAt: bookedAt.toISOString(),
      orders: created
        .slice()
        .sort((left, right) => left.participantId - right.participantId)
        .map((item) => ({
          exchangeClaimId: item.exchangeClaimId,
          orderId: item.orderId,
          orderNo: item.orderNo,
          status: "pending",
          providerPublicId: item.providerPublicId,
          quoteAmountJpy: item.quoteAmountJpy,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString()
        }))
    };
  }

  private abort(outcome: ConversionFailure["outcome"], currentVersion?: number): never {
    throw new ConversionAbort(
      currentVersion === undefined ? { outcome } : { outcome, currentVersion }
    );
  }

  private createOrderNo(at: Date): string {
    const timestamp = [
      at.getUTCFullYear(),
      String(at.getUTCMonth() + 1).padStart(2, "0"),
      String(at.getUTCDate()).padStart(2, "0"),
      String(at.getUTCHours()).padStart(2, "0"),
      String(at.getUTCMinutes()).padStart(2, "0"),
      String(at.getUTCSeconds()).padStart(2, "0")
    ].join("");
    return `ND${timestamp}${String(this.orderNumberSuffix()).padStart(4, "0")}`;
  }
}
