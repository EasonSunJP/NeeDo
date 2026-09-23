import {
  BookingOrderStatus,
  ExchangeCancellationEventType as DatabaseEventType,
  ExchangeCancellationParty as DatabaseParty,
  ExchangeCancellationStatus as DatabaseStatus,
  NotificationType,
  OrderType,
  Prisma,
  ScheduleSlotStatus,
  ServicePaymentStatus,
  TechnicianShopWorkStatus,
  type PrismaClient
} from "@prisma/client";
import {
  decideExchangeCancellation,
  type ExchangeCancellationAction,
  type ExchangeCancellationActor,
  type ExchangeCancellationParty,
  type ExchangeCancellationRequest,
  type ExchangeCancellationStatus
} from "../domain/exchange-cancellation";
import { prisma } from "../prisma/client";
import type {
  ExchangeCancellationActorInput,
  ExchangeCancellationCommandInput,
  ExchangeCancellationCommittedNotification,
  ExchangeCancellationPayload,
  ExchangeCancellationReadResult,
  ExchangeCancellationRepositoryResult,
  ExchangeCancellationSettlementOptions
} from "../types/exchange-cancellation.types";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { exchangeCancellationPayloadSchema } from "../validators/exchange-cancellation.validators";
import { toAuditLogCreateData } from "./audit-log.repository";

type ExchangeCancellationClient = PrismaClient | Prisma.TransactionClient;

interface CancellationRow {
  id: number;
  bookingOrderId: number;
  initiatedByUserId: number;
  initiatedByIdentityId: number;
  initiatorParty: DatabaseParty;
  reason: string;
  status: DatabaseStatus;
  requestedVersion: number;
  version: number;
  resolvedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

interface ParticipantContext {
  id: number;
  exchangePostId: number;
  participantUserId: number;
  participantIdentityId: number;
  shopId: number;
  technicianProfileId: number;
  bookingOrderId: number | null;
  deletedAt: Date | null;
  exchangePost: {
    id: number;
    authorUserId: number;
    ownerIdentityId: number | null;
    deletedAt: Date | null;
  };
  bookingOrder: null | {
    id: number;
    orderType: OrderType;
    customerUserId: number;
    serviceId: number | null;
    shopId: number;
    technicianProfileId: number | null;
    scheduleSlotId: number;
    status: BookingOrderStatus;
    priceAmount: Prisma.Decimal | number;
    startsAt: Date;
    paymentStatus: ServicePaymentStatus;
    paymentConfirmedAt: Date | null;
    paymentRefundedAt: Date | null;
    deletedAt: Date | null;
    shop: { id: number; status: string; deletedAt: Date | null };
    technicianProfile: null | {
      id: number;
      userId: number;
      status: string;
      deletedAt: Date | null;
      user: { id: number; isActive: boolean; deletedAt: Date | null };
      technicianShopAffiliations: Array<{
        id: number;
        shopId: number;
        workStatus: TechnicianShopWorkStatus;
        activeKey: string | null;
        startsAt: Date;
        endsAt: Date | null;
        deletedAt: Date | null;
      }>;
    };
    serviceSession: { startedAt: Date | null; deletedAt: Date | null } | null;
  };
  cancellations: CancellationRow[];
}

type Failure = Exclude<ExchangeCancellationRepositoryResult, { outcome: "created" | "replayed" }>;

class CancellationAbort extends Error {
  public constructor(public readonly result: Failure) {
    super(result.outcome);
    this.name = "ExchangeCancellationAbort";
  }
}

const partyFromDatabase = (party: DatabaseParty): ExchangeCancellationParty =>
  party === DatabaseParty.CUSTOMER ? "customer" : "provider";

const partyToDatabase = (party: ExchangeCancellationParty): DatabaseParty =>
  party === "customer" ? DatabaseParty.CUSTOMER : DatabaseParty.PROVIDER;

const statusFromDatabase = (status: DatabaseStatus): ExchangeCancellationStatus =>
  status.toLowerCase() as ExchangeCancellationStatus;

const actionToEvent = (action: ExchangeCancellationAction): DatabaseEventType =>
  ({
    request: DatabaseEventType.REQUESTED,
    accept: DatabaseEventType.ACCEPTED,
    reject: DatabaseEventType.REJECTED,
    withdraw: DatabaseEventType.WITHDRAWN
  })[action];

const MERCHANT_IDENTITY_TYPES = new Set([
  "merchant",
  "merchant_owner",
  "merchant_staff",
  "merchant_organization",
  "business",
  "b",
  "owner",
  "o"
]);
const CUSTOMER_FALLBACK_IDENTITY_TYPES = new Set(["customer", "user", "u"]);

export class ExchangeCancellationRepository {
  public constructor(
    private readonly client: ExchangeCancellationClient = prisma,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async get(
    input: ExchangeCancellationActorInput & { orderId: number }
  ): Promise<ExchangeCancellationReadResult> {
    const participant = await this.loadParticipant(input.orderId);
    if (!participant) return { outcome: "not_found" };
    const actor = await this.authorize(participant, input, this.now());
    if (!actor) return { outcome: "not_found" };
    return { outcome: "found", payload: this.toPayload(participant, actor) };
  }

  public async command(
    input: ExchangeCancellationCommandInput,
    options: ExchangeCancellationSettlementOptions
  ): Promise<ExchangeCancellationRepositoryResult> {
    // The caller owns an injected transaction and must receive every abort to roll it back.
    if (!("$transaction" in this.client)) {
      return this.commandInTransaction(input, options);
    }
    for (let uniqueAttempt = 0; uniqueAttempt < 2; uniqueAttempt += 1) {
      try {
        return await runWithTransactionConflictRetry(() =>
          this.client.$transaction(
            (transaction) =>
              new ExchangeCancellationRepository(transaction, this.now).commandInTransaction(
                input,
                options
              ),
            { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
          )
        );
      } catch (error) {
        if (error instanceof CancellationAbort) return error.result;
        if (uniqueAttempt === 0 && this.isUniqueConflict(error)) continue;
        throw error;
      }
    }
    return { outcome: "idempotency_conflict" };
  }

  private async commandInTransaction(
    input: ExchangeCancellationCommandInput,
    options: ExchangeCancellationSettlementOptions
  ): Promise<ExchangeCancellationRepositoryResult> {
    await this.lockCommandRows(input);
    const participant = await this.loadParticipant(input.orderId);
    if (!participant) this.abort("not_found");
    const actor = await this.authorize(participant, input, input.occurredAt);
    if (!actor) this.abort("not_allowed");

    const replay = await this.findReplay(input, actor);
    if (replay) return replay;

    const latest = participant.cancellations[0] ?? null;
    const decision = decideExchangeCancellation({
      action: input.action,
      expectedVersion: input.expectedVersion,
      actor,
      order: this.toOrderFacts(participant),
      latestRequest: latest ? this.toDomainRequest(latest) : null
    });
    if (!decision.ok) {
      if (decision.reason === "not_allowed") this.abort("not_allowed");
      if (decision.reason === "version_conflict") {
        this.abort("version_conflict", latest?.version ?? 0);
      }
      if (decision.reason === "request_already_pending") this.abort("pending_conflict");
      this.abort("invalid_state");
    }

    const cancellation =
      input.action === "request"
        ? await this.createRequest(input, actor, decision.version)
        : await this.resolveRequest(input, actor, latest, decision.version);

    if (decision.effect === "cancel_order") {
      await this.cancelOrder(participant, input, options);
      participant.bookingOrder!.status = BookingOrderStatus.CANCELLED;
    }
    participant.cancellations = [cancellation];
    const payload = this.toPayload(participant, actor);

    await this.client.exchangeBookingCancellationEvent.create({
      data: {
        cancellationId: cancellation.id,
        bookingOrderId: input.orderId,
        type: actionToEvent(input.action),
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        actorParty: partyToDatabase(actor.party),
        versionBefore: input.expectedVersion,
        versionAfter: decision.version,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        resultSnapshot: payload as unknown as Prisma.InputJsonValue,
        createdAt: input.occurredAt
      }
    });
    const notifications = await this.createNotification(participant, cancellation, input, actor);
    await this.client.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        targetId: input.orderId,
        metadata: {
          orderId: input.orderId,
          exchangePostId: participant.exchangePostId,
          cancellationId: cancellation.id,
          action: input.action,
          actorParty: actor.party,
          versionBefore: input.expectedVersion,
          versionAfter: decision.version,
          orderCancelled: decision.effect === "cancel_order"
        }
      })
    });
    return { outcome: "created", payload, notifications };
  }

  private async loadParticipant(orderId: number): Promise<ParticipantContext | null> {
    return (await this.client.exchangeMatchParticipant.findFirst({
      where: { bookingOrderId: orderId, deletedAt: null },
      select: {
        id: true,
        exchangePostId: true,
        participantUserId: true,
        participantIdentityId: true,
        shopId: true,
        technicianProfileId: true,
        bookingOrderId: true,
        deletedAt: true,
        exchangePost: {
          select: {
            id: true,
            authorUserId: true,
            ownerIdentityId: true,
            deletedAt: true
          }
        },
        bookingOrder: {
          select: {
            id: true,
            orderType: true,
            customerUserId: true,
            serviceId: true,
            shopId: true,
            technicianProfileId: true,
            scheduleSlotId: true,
            status: true,
            priceAmount: true,
            startsAt: true,
            paymentStatus: true,
            paymentConfirmedAt: true,
            paymentRefundedAt: true,
            deletedAt: true,
            shop: {
              select: { id: true, status: true, deletedAt: true }
            },
            technicianProfile: {
              select: {
                id: true,
                userId: true,
                status: true,
                deletedAt: true,
                user: { select: { id: true, isActive: true, deletedAt: true } },
                technicianShopAffiliations: {
                  select: {
                    id: true,
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
            serviceSession: {
              select: { startedAt: true, deletedAt: true }
            }
          }
        },
        cancellations: {
          where: { deletedAt: null },
          orderBy: [{ version: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            bookingOrderId: true,
            initiatedByUserId: true,
            initiatedByIdentityId: true,
            initiatorParty: true,
            reason: true,
            status: true,
            requestedVersion: true,
            version: true,
            resolvedAt: true,
            createdAt: true,
            deletedAt: true
          }
        }
      }
    })) as ParticipantContext | null;
  }

  private async authorize(
    participant: ParticipantContext,
    input: ExchangeCancellationActorInput,
    occurredAt: Date
  ): Promise<ExchangeCancellationActor | null> {
    if (
      participant.deletedAt !== null ||
      !participant.bookingOrder ||
      participant.bookingOrderId !== participant.bookingOrder.id ||
      participant.bookingOrder.customerUserId !== participant.exchangePost.authorUserId ||
      participant.bookingOrder.shopId !== participant.shopId ||
      participant.bookingOrder.technicianProfileId !== participant.technicianProfileId ||
      participant.exchangePost.deletedAt !== null
    ) {
      return null;
    }
    if (this.isDemandOwner(participant, input)) {
      return { userId: input.actorUserId, identityId: input.actorIdentityId, party: "customer" };
    }
    const providerAuthorized =
      (input.actorScope.kind === "technician" &&
        input.actorIdentityType === "technician" &&
        input.actorIdentityScopeType === "technician_profile" &&
        input.actorIdentityScopeId === participant.technicianProfileId &&
        input.actorScope.technicianProfileId === participant.technicianProfileId) ||
      (input.actorScope.kind === "merchant" &&
        MERCHANT_IDENTITY_TYPES.has(input.actorIdentityType) &&
        input.actorScope.shopId === participant.shopId);
    if (!providerAuthorized) return null;
    if (!(await this.hasLiveProviderAuthority(participant, input, occurredAt))) return null;
    return { userId: input.actorUserId, identityId: input.actorIdentityId, party: "provider" };
  }

  private isDemandOwner(
    participant: ParticipantContext,
    input: ExchangeCancellationActorInput
  ): boolean {
    return (
      participant.exchangePost.authorUserId === input.actorUserId &&
      participant.exchangePost.ownerIdentityId === input.actorIdentityId
    );
  }

  private async hasLiveProviderAuthority(
    participant: ParticipantContext,
    input: ExchangeCancellationActorInput,
    occurredAt: Date
  ): Promise<boolean> {
    const order = participant.bookingOrder!;
    if (
      order.shop.id !== participant.shopId ||
      order.shop.deletedAt !== null ||
      !["active", "published"].includes(order.shop.status)
    ) {
      return false;
    }
    const profile = order.technicianProfile;
    const hasLiveTechnician = Boolean(
      profile &&
      profile.id === participant.technicianProfileId &&
      profile.user.id === profile.userId &&
      profile.status === "published" &&
      profile.deletedAt === null &&
      profile.user.isActive &&
      profile.user.deletedAt === null &&
      profile.technicianShopAffiliations.some(
        (affiliation) =>
          affiliation.shopId === participant.shopId &&
          affiliation.workStatus === TechnicianShopWorkStatus.ACTIVE &&
          affiliation.activeKey !== null &&
          affiliation.startsAt <= occurredAt &&
          (affiliation.endsAt === null || affiliation.endsAt > occurredAt) &&
          affiliation.deletedAt === null
      )
    );
    if (!hasLiveTechnician) return false;
    if (input.actorScope.kind === "technician") {
      return profile!.userId === input.actorUserId;
    }
    if (input.actorScope.kind !== "merchant") return false;
    if (
      input.actorIdentityScopeType === "shop" &&
      input.actorIdentityScopeId === participant.shopId
    ) {
      return true;
    }
    if (input.actorIdentityScopeType !== "merchant_account" || !input.actorIdentityScopeId) {
      return false;
    }
    const membership = await this.client.merchantShopMembership.findFirst({
      where: {
        merchantAccountId: input.actorIdentityScopeId,
        shopId: participant.shopId,
        activeKey: { not: null },
        startsAt: { lte: occurredAt },
        OR: [{ endsAt: null }, { endsAt: { gt: occurredAt } }],
        deletedAt: null,
        merchantAccount: { is: { status: "active", deletedAt: null } }
      },
      select: { id: true }
    });
    return membership !== null;
  }

  private toOrderFacts(participant: ParticipantContext) {
    const order = participant.bookingOrder!;
    return {
      id: order.id,
      participantBookingOrderId: participant.bookingOrderId,
      orderType: order.orderType,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentConfirmedAt: order.paymentConfirmedAt,
      paymentRefundedAt: order.paymentRefundedAt,
      serviceStartedAt:
        order.serviceSession?.deletedAt === null ? order.serviceSession.startedAt : null,
      deletedAt: order.deletedAt
    };
  }

  private toDomainRequest(row: CancellationRow): ExchangeCancellationRequest {
    return {
      orderId: row.bookingOrderId,
      initiatedBy: {
        userId: row.initiatedByUserId,
        identityId: row.initiatedByIdentityId,
        party: partyFromDatabase(row.initiatorParty)
      },
      status: statusFromDatabase(row.status),
      version: row.version
    };
  }

  private toPayload(
    participant: ParticipantContext,
    actor: ExchangeCancellationActor
  ): ExchangeCancellationPayload {
    const order = participant.bookingOrder!;
    const latest = participant.cancellations[0] ?? null;
    const allowedActions: ExchangeCancellationPayload["allowedActions"] = [];
    const expectedVersion = latest?.version ?? 0;
    for (const action of ["request", "accept", "reject", "withdraw"] as const) {
      const decision = decideExchangeCancellation({
        action,
        expectedVersion,
        actor,
        order: this.toOrderFacts(participant),
        latestRequest: latest ? this.toDomainRequest(latest) : null
      });
      if (decision.ok) allowedActions.push(action);
    }
    return {
      orderId: order.id,
      orderStatus: order.status.toLowerCase() as ExchangeCancellationPayload["orderStatus"],
      viewerParty: actor.party,
      allowedActions,
      cancellation: latest
        ? {
            id: latest.id,
            status: statusFromDatabase(latest.status),
            reason: latest.reason,
            initiatorParty: partyFromDatabase(latest.initiatorParty),
            version: latest.version,
            requestedAt: latest.createdAt.toISOString(),
            resolvedAt: latest.resolvedAt?.toISOString() ?? null
          }
        : null
    };
  }

  private async createRequest(
    input: ExchangeCancellationCommandInput,
    actor: ExchangeCancellationActor,
    version: number
  ): Promise<CancellationRow> {
    if (!input.reason) this.abort("invalid_state");
    return (await this.client.exchangeBookingCancellation.create({
      data: {
        bookingOrderId: input.orderId,
        activeOrderId: input.orderId,
        initiatedByUserId: input.actorUserId,
        initiatedByIdentityId: input.actorIdentityId,
        initiatorParty: partyToDatabase(actor.party),
        reason: input.reason,
        status: DatabaseStatus.PENDING,
        requestedVersion: version,
        version,
        createdAt: input.occurredAt
      }
    })) as CancellationRow;
  }

  private async resolveRequest(
    input: ExchangeCancellationCommandInput,
    actor: ExchangeCancellationActor,
    latest: CancellationRow | null,
    version: number
  ): Promise<CancellationRow> {
    if (!latest) this.abort("invalid_state");
    const status =
      input.action === "accept"
        ? DatabaseStatus.ACCEPTED
        : input.action === "reject"
          ? DatabaseStatus.REJECTED
          : DatabaseStatus.WITHDRAWN;
    const updated = await this.client.exchangeBookingCancellation.updateMany({
      where: {
        id: latest.id,
        bookingOrderId: input.orderId,
        status: DatabaseStatus.PENDING,
        version: input.expectedVersion,
        activeOrderId: input.orderId,
        deletedAt: null
      },
      data: {
        activeOrderId: null,
        status,
        version,
        resolvedByUserId: input.actorUserId,
        resolvedByIdentityId: input.actorIdentityId,
        resolverParty: partyToDatabase(actor.party),
        resolvedAt: input.occurredAt
      }
    });
    if (updated.count !== 1) this.abort("version_conflict", latest.version);
    return {
      ...latest,
      status,
      version,
      resolvedAt: input.occurredAt
    };
  }

  private async cancelOrder(
    participant: ParticipantContext,
    input: ExchangeCancellationCommandInput,
    options: ExchangeCancellationSettlementOptions
  ): Promise<void> {
    const order = participant.bookingOrder!;
    const originalStatus = order.status;
    const cancelled = await this.client.bookingOrder.updateMany({
      where: {
        id: order.id,
        orderType: OrderType.REQUEST,
        status: { in: [BookingOrderStatus.PENDING, BookingOrderStatus.CONFIRMED] },
        paymentStatus: ServicePaymentStatus.PENDING,
        paymentConfirmedAt: null,
        paymentRefundedAt: null,
        deletedAt: null
      },
      data: {
        status: BookingOrderStatus.CANCELLED,
        cancelReason: participant.cancellations[0]?.reason ?? "exchange_mutual_cancellation"
      }
    });
    if (cancelled.count !== 1) this.abort("invalid_state");
    const slot = await this.client.scheduleSlot.updateMany({
      where: { id: order.scheduleSlotId, bookedCount: { gt: 0 }, deletedAt: null },
      data: { bookedCount: { decrement: 1 }, status: ScheduleSlotStatus.AVAILABLE }
    });
    if (slot.count !== 1) this.abort("slot_conflict");
    await this.client.orderStatusHistory.create({
      data: {
        bookingOrderId: order.id,
        fromStatus: originalStatus,
        toStatus: BookingOrderStatus.CANCELLED,
        actorUserId: input.actorUserId,
        createdAt: input.occurredAt
      }
    });
    await options.capturePublicationFee({
      exchangePostId: participant.exchangePostId,
      actorUserId: input.actorUserId,
      transactionClient: this.client
    });
    if (originalStatus === BookingOrderStatus.CONFIRMED) {
      const serviceAmountJpy = Number(order.priceAmount);
      if (
        !Number.isSafeInteger(serviceAmountJpy) ||
        serviceAmountJpy < 0 ||
        !order.technicianProfileId
      ) {
        this.abort("invalid_state");
      }
      await options.releaseBookingHold({
        bookingOrderId: order.id,
        shopId: order.shopId,
        technicianProfileId: order.technicianProfileId,
        ...(order.serviceId === null ? {} : { serviceId: order.serviceId }),
        serviceAmountJpy,
        scheduledStartAt: order.startsAt,
        customerUserId: order.customerUserId,
        actorUserId: input.actorUserId,
        transactionClient: this.client
      });
    }
    await options.releaseServicePrepayment({
      bookingOrderId: order.id,
      actorUserId: input.actorUserId,
      transactionClient: this.client
    });
  }

  private async findReplay(
    input: ExchangeCancellationCommandInput,
    actor: ExchangeCancellationActor
  ): Promise<{
    outcome: "replayed";
    payload: ExchangeCancellationPayload;
    notifications: ExchangeCancellationCommittedNotification[];
  } | null> {
    const event = await this.client.exchangeBookingCancellationEvent.findFirst({
      where: { idempotencyKey: input.idempotencyKey, deletedAt: null },
      select: {
        bookingOrderId: true,
        type: true,
        actorUserId: true,
        actorIdentityId: true,
        actorParty: true,
        payloadFingerprint: true,
        resultSnapshot: true
      }
    });
    if (!event) return null;
    if (
      event.bookingOrderId !== input.orderId ||
      event.type !== actionToEvent(input.action) ||
      event.actorUserId !== input.actorUserId ||
      event.actorIdentityId !== input.actorIdentityId ||
      event.actorParty !== partyToDatabase(actor.party) ||
      event.payloadFingerprint !== input.payloadFingerprint
    ) {
      this.abort("idempotency_conflict");
    }
    const parsed = exchangeCancellationPayloadSchema.safeParse(event.resultSnapshot);
    if (!parsed.success) this.abort("idempotency_conflict");
    return { outcome: "replayed", payload: parsed.data, notifications: [] };
  }

  private async createNotification(
    participant: ParticipantContext,
    cancellation: CancellationRow,
    input: ExchangeCancellationCommandInput,
    actor: ExchangeCancellationActor
  ): Promise<ExchangeCancellationCommittedNotification[]> {
    const notifyInitiator = input.action === "accept" || input.action === "reject";
    const recipient = notifyInitiator
      ? {
          userId: cancellation.initiatedByUserId,
          identityId: cancellation.initiatedByIdentityId
        }
      : actor.party === "customer"
        ? {
            userId: participant.participantUserId,
            identityId: participant.participantIdentityId
          }
        : {
            userId: participant.exchangePost.authorUserId,
            identityId: participant.exchangePost.ownerIdentityId
          };
    if (!recipient.identityId) this.abort("invalid_state");
    const row = await this.client.notification.create({
      data: {
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        type: NotificationType.SYSTEM,
        title: `exchange.cancellation.${input.action}.title`,
        body: `exchange.cancellation.${input.action}.body`,
        payload: {
          orderId: input.orderId,
          exchangePostId: participant.exchangePostId,
          cancellationId: cancellation.id,
          status: statusFromDatabase(cancellation.status),
          version: cancellation.version
        },
        createdAt: input.occurredAt
      }
    });
    return [
      {
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
      }
    ];
  }

  private async lockCommandRows(input: ExchangeCancellationCommandInput): Promise<void> {
    await this.lockRequired(
      Prisma.sql`
      SELECT id FROM users
      WHERE id = ${input.actorUserId} AND is_active = TRUE AND deleted_at IS NULL
      FOR UPDATE
    `,
      "not_allowed"
    );
    await this.lockRequired(
      Prisma.sql`
      SELECT id FROM user_identities
      WHERE id = ${input.actorIdentityId}
        AND user_id = ${input.actorUserId}
        AND type = ${input.actorIdentityType}
        AND scope_type <=> ${input.actorIdentityScopeType}
        AND scope_id <=> ${input.actorIdentityScopeId}
        AND is_active = TRUE
        AND deleted_at IS NULL
      FOR UPDATE
    `,
      "not_allowed"
    );
    const publicIdentifierRows = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM public_identifiers
      WHERE user_identity_id = ${input.actorIdentityId}
        AND public_id = ${input.actorPublicId}
        AND status = 'active'
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (publicIdentifierRows.length > 1) this.abort("not_allowed");
    if (publicIdentifierRows.length === 0) {
      if (!CUSTOMER_FALLBACK_IDENTITY_TYPES.has(input.actorIdentityType)) {
        this.abort("not_allowed");
      }
      await this.lockRequired(
        Prisma.sql`
        SELECT id FROM users
        WHERE id = ${input.actorUserId}
          AND needo_id = ${input.actorPublicId}
          AND NOT EXISTS (
            SELECT 1 FROM public_identifiers
            WHERE user_identity_id = ${input.actorIdentityId}
              AND status = 'active'
              AND deleted_at IS NULL
          )
        FOR UPDATE
      `,
        "not_allowed"
      );
    }
    await this.lockRequired(
      Prisma.sql`
      SELECT id FROM booking_orders
      WHERE id = ${input.orderId} AND deleted_at IS NULL
      FOR UPDATE
    `,
      "not_found"
    );
    await this.lockRequired(
      Prisma.sql`
      SELECT id FROM exchange_match_participants
      WHERE booking_order_id = ${input.orderId} AND deleted_at IS NULL
      FOR UPDATE
    `,
      "not_found"
    );

    let participant = await this.loadParticipant(input.orderId);
    if (!participant?.bookingOrder) this.abort("not_found");
    await this.lockRequired(
      Prisma.sql`
      SELECT id FROM exchange_posts
      WHERE id = ${participant.exchangePostId} AND deleted_at IS NULL
      FOR UPDATE
    `,
      "not_found"
    );

    participant = await this.loadParticipant(input.orderId);
    if (!participant?.bookingOrder) this.abort("not_found");
    const isProvider = !this.isDemandOwner(participant, input);
    if (isProvider && input.actorScope.kind !== "customer") {
      await this.lockRequired(
        Prisma.sql`
        SELECT id FROM shops
        WHERE id = ${participant.shopId}
          AND status IN ('active', 'published')
          AND deleted_at IS NULL
        FOR UPDATE
      `,
        "not_allowed"
      );
    }
    if (isProvider && input.actorScope.kind !== "customer") {
      await this.lockRequired(
        Prisma.sql`
        SELECT technician_profiles.id FROM technician_profiles
        INNER JOIN users AS technician_user ON technician_user.id = technician_profiles.user_id
        WHERE technician_profiles.id = ${participant.technicianProfileId}
          AND technician_profiles.status = 'published'
          AND technician_profiles.deleted_at IS NULL
          AND technician_user.is_active = TRUE
          AND technician_user.deleted_at IS NULL
        FOR UPDATE
      `,
        "not_allowed"
      );
      await this.lockRequired(
        Prisma.sql`
        SELECT id FROM technician_shop_affiliations
        WHERE technician_profile_id = ${participant.technicianProfileId}
          AND shop_id = ${participant.shopId}
          AND work_status = 'active'
          AND active_key IS NOT NULL
          AND starts_at <= ${input.occurredAt}
          AND (ends_at IS NULL OR ends_at > ${input.occurredAt})
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
        "not_allowed"
      );
    }
    if (
      isProvider &&
      input.actorScope.kind === "merchant" &&
      input.actorIdentityScopeType === "merchant_account" &&
      input.actorIdentityScopeId
    ) {
      await this.lockRequired(
        Prisma.sql`
        SELECT id FROM merchant_accounts
        WHERE id = ${input.actorIdentityScopeId}
          AND status = 'active'
          AND deleted_at IS NULL
        FOR UPDATE
      `,
        "not_allowed"
      );
      await this.lockRequired(
        Prisma.sql`
        SELECT id FROM merchant_shop_memberships
        WHERE merchant_account_id = ${input.actorIdentityScopeId}
          AND shop_id = ${participant.shopId}
          AND active_key IS NOT NULL
          AND starts_at <= ${input.occurredAt}
          AND (ends_at IS NULL OR ends_at > ${input.occurredAt})
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
        "not_allowed"
      );
    }
    await this.client.$queryRaw(Prisma.sql`
      SELECT id
      FROM exchange_booking_cancellations
      WHERE booking_order_id = ${input.orderId} AND deleted_at IS NULL
      ORDER BY version DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `);
    await this.lockRequired(
      Prisma.sql`
      SELECT id FROM schedule_slots
      WHERE id = ${participant.bookingOrder.scheduleSlotId} AND deleted_at IS NULL
      FOR UPDATE
    `,
      "invalid_state"
    );
  }

  private async lockRequired(
    query: Prisma.Sql,
    outcome: "not_found" | "not_allowed" | "invalid_state"
  ): Promise<void> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(query);
    if (rows.length !== 1) this.abort(outcome);
  }

  private abort(outcome: Failure["outcome"], currentVersion?: number): never {
    throw new CancellationAbort({
      outcome,
      ...(outcome === "version_conflict" ? { currentVersion } : {})
    } as Failure);
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
