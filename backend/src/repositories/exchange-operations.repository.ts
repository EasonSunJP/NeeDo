import {
  ExchangeBudgetMode,
  ExchangeClaimStatus,
  ExchangeDemandServiceMode,
  ExchangeMatchMode,
  ExchangeMatchingStatus,
  ExchangePostStatus,
  ExchangePostType,
  ExchangePublisherCapacitySource,
  ExchangeRequestFinancialState,
  ExchangeServiceMode,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type { ExchangeOperationsRepositoryPort } from "../services/exchange-operations.service";
import type {
  ExchangeOperationsClaim,
  ExchangeOperationsCurrency,
  ExchangeOperationsDetail,
  ExchangeOperationsFinancial,
  ExchangeOperationsMatchMode,
  ExchangeOperationsPage,
  ExchangeOperationsPost,
  ExchangeOperationsPostStatus,
  ExchangeOperationsPostType,
  ExchangeOperationsServiceMode,
  ExchangeOperationsTimelineEvent
} from "../types/exchange-operations.types";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

type ExchangeOperationsPrismaClient = Pick<
  PrismaClient,
  "exchangePost" | "auditLog" | "ledgerTransaction"
>;

const claimInclude = {
  claimantIdentity: {
    select: {
      displayName: true,
      publicIdentifier: { select: { publicId: true } },
      user: { select: { needoId: true, username: true } }
    }
  },
  shop: { select: { name: true } },
  technicianProfile: { select: { displayName: true } },
  service: { select: { name: true, durationMinutes: true } },
  technicianService: { select: { name: true, durationMinutes: true } },
  scheduleSlot: { select: { startsAt: true, endsAt: true } }
} satisfies Prisma.ExchangeClaimInclude;

const participantInclude = {
  participantIdentity: {
    select: {
      displayName: true,
      publicIdentifier: { select: { publicId: true } },
      user: { select: { needoId: true, username: true } }
    }
  },
  shop: { select: { name: true } },
  technicianProfile: { select: { displayName: true } },
  bookingOrder: { select: { orderNo: true, status: true } }
} satisfies Prisma.ExchangeMatchParticipantInclude;

const operationsPostInclude = {
  demand: true,
  intelligence: true,
  claims: {
    where: { deletedAt: null },
    include: claimInclude,
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }]
  },
  matching: {
    include: {
      participants: {
        where: { deletedAt: null },
        include: participantInclude,
        orderBy: [{ matchedAt: "asc" as const }, { id: "asc" as const }]
      },
      events: {
        where: { deletedAt: null },
        include: {
          actorUser: { select: { username: true } },
          actorIdentity: { select: { displayName: true } }
        },
        orderBy: [{ sequence: "asc" as const }, { id: "asc" as const }]
      }
    }
  },
  requestFinancial: { include: { walletHold: true } }
} satisfies Prisma.ExchangePostInclude;

type ExchangeOperationsPostRecord = Prisma.ExchangePostGetPayload<{
  include: typeof operationsPostInclude;
}>;

const postTypeFromDatabase: Record<ExchangePostType, ExchangeOperationsPostType> = {
  [ExchangePostType.DEMAND]: "demand",
  [ExchangePostType.INTELLIGENCE]: "intelligence"
};
const statusFromDatabase: Record<ExchangePostStatus, ExchangeOperationsPostStatus> = {
  [ExchangePostStatus.PUBLISHED]: "published",
  [ExchangePostStatus.MATCHED]: "matched",
  [ExchangePostStatus.EXPIRED]: "expired",
  [ExchangePostStatus.WITHDRAWN]: "withdrawn",
  [ExchangePostStatus.CLOSED]: "closed"
};
const statusToDatabase: Record<
  Exclude<ExchangeOperationsPostStatus, "published" | "expired">,
  ExchangePostStatus
> = {
  matched: ExchangePostStatus.MATCHED,
  withdrawn: ExchangePostStatus.WITHDRAWN,
  closed: ExchangePostStatus.CLOSED
};
const matchModeFromDatabase: Record<ExchangeMatchMode, ExchangeOperationsMatchMode> = {
  [ExchangeMatchMode.QUICK]: "quick",
  [ExchangeMatchMode.SELECTIVE]: "selective"
};
const matchModeToDatabase: Record<ExchangeOperationsMatchMode, ExchangeMatchMode> = {
  quick: ExchangeMatchMode.QUICK,
  selective: ExchangeMatchMode.SELECTIVE
};
const demandModeFromDatabase: Record<ExchangeDemandServiceMode, "home" | "store"> = {
  [ExchangeDemandServiceMode.HOME]: "home",
  [ExchangeDemandServiceMode.STORE]: "store"
};
const intelligenceModeFromDatabase: Record<
  ExchangeServiceMode,
  "store" | "onsite" | "flexible"
> = {
  [ExchangeServiceMode.STORE]: "store",
  [ExchangeServiceMode.ONSITE]: "onsite",
  [ExchangeServiceMode.FLEXIBLE]: "flexible"
};
const claimStatusFromDatabase: Record<ExchangeClaimStatus, ExchangeOperationsClaim["status"]> = {
  [ExchangeClaimStatus.ACTIVE]: "active",
  [ExchangeClaimStatus.WITHDRAWN]: "withdrawn",
  [ExchangeClaimStatus.REQUEST_WITHDRAWN]: "request_withdrawn",
  [ExchangeClaimStatus.REQUEST_EXPIRED]: "request_expired",
  [ExchangeClaimStatus.MATCHED]: "matched",
  [ExchangeClaimStatus.NOT_SELECTED]: "not_selected",
  [ExchangeClaimStatus.MATCHING_CLOSED]: "matching_closed"
};

export const maskExchangeOperationsPublicId = (value: string): string => {
  const normalized = value.trim();
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}••${normalized.slice(-1)}`;
  return `${normalized.slice(0, Math.min(5, normalized.length - 2))}••••${normalized.slice(-2)}`;
};

export const maskExchangeOperationsDisplayName = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return "••";
  const characters = Array.from(normalized);
  if (characters.length === 1) return `${characters[0]}•`;
  return `${characters[0]}${"•".repeat(Math.min(3, characters.length - 1))}${characters.at(-1)}`;
};

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const japanesePhonePattern = /(?:\+81[-\s]?|0)\d{1,4}[-\s(]?\d{1,4}[-\s)]?\d{3,4}\b/g;

export const redactExchangeOperationsText = (value: string): string =>
  value
    .replace(emailPattern, "[redacted-email]")
    .replace(japanesePhonePattern, "[redacted-phone]");

const currency = (value: string): ExchangeOperationsCurrency => {
  if (value === "NDP" || value === "TEST_NDP") return value;
  throw new Error("error.exchange.operations.invalid_currency");
};

const serviceAreas = (value: Prisma.JsonValue): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("error.exchange.invalid_service_areas");
  }
  return value.map((item) => String(item));
};

export class ExchangeOperationsRepository implements ExchangeOperationsRepositoryPort {
  public constructor(private readonly client: ExchangeOperationsPrismaClient = prisma) {}

  public async list(
    input: Parameters<ExchangeOperationsRepositoryPort["list"]>[0]
  ): Promise<ExchangeOperationsPage> {
    const pagination = toPrismaPagination({ page: input.page, pageSize: input.pageSize });
    const where = this.listWhere(input);
    const [records, total] = await Promise.all([
      this.client.exchangePost.findMany({
        where,
        include: operationsPostInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.exchangePost.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapPost(record, input.now)),
      total,
      { page: input.page, pageSize: input.pageSize }
    );
  }

  public async findDetail(postId: number, now: Date): Promise<ExchangeOperationsDetail | null> {
    const record = await this.client.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      include: operationsPostInclude
    });
    if (!record || !this.validSubtype(record)) return null;

    const claimIds = record.claims.map(({ id }) => id);
    const matchingId = record.matching?.id ?? null;
    const auditTargets: Prisma.AuditLogWhereInput[] = [
      { targetType: "ExchangePost", targetId: postId },
      ...(claimIds.length > 0
        ? [{ targetType: "exchange_claim", targetId: { in: claimIds } }]
        : []),
      ...(matchingId ? [{ targetType: "exchange_request_matching", targetId: matchingId }] : [])
    ];
    const [auditLogs, ledgerTransactions] = await Promise.all([
      this.client.auditLog.findMany({
        where: { deletedAt: null, OR: auditTargets },
        include: { actor: { select: { username: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.client.ledgerTransaction.findMany({
        where: { referenceType: "exchange_request", referenceId: postId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      })
    ]);

    const post = this.mapPost(record, now);
    const demand = record.demand && record.demand.deletedAt === null
      ? {
          targetProviderCount: record.demand.targetProviderCount,
          targetProviderLimitSnapshot: record.demand.targetProviderLimitSnapshot,
          publisherCapacitySource:
            record.demand.publisherCapacitySource === ExchangePublisherCapacitySource.SHOP_MERCHANT
              ? ("shop_merchant" as const)
              : ("customer_membership" as const),
          membershipLevelSnapshot: record.demand.membershipLevelSnapshot,
          matchMode: matchModeFromDatabase[record.demand.matchMode],
          budgetMode:
            record.demand.budgetMode === ExchangeBudgetMode.PER_PROVIDER
              ? ("per_provider" as const)
              : ("total" as const),
          budgetMinJpy: record.demand.budgetMinJpy,
          budgetMaxJpy: record.demand.budgetMaxJpy,
          serviceMode: demandModeFromDatabase[record.demand.serviceMode],
          addressLine1: record.demand.addressLine1
        }
      : null;
    const intelligence = record.intelligence && record.intelligence.deletedAt === null
      ? {
          serviceMode: intelligenceModeFromDatabase[record.intelligence.serviceMode],
          addressLabel: record.intelligence.addressLabel,
          serviceAreas: serviceAreas(record.intelligence.serviceAreas),
          originalPriceJpy: record.intelligence.originalPriceJpy,
          campaignPriceJpy: record.intelligence.campaignPriceJpy,
          serviceName: record.intelligence.serviceNameSnapshot,
          serviceDurationMinutes: record.intelligence.serviceDurationSnapshot
        }
      : null;

    return {
      ...post,
      detail: redactExchangeOperationsText(record.detail),
      contentLocale: String(record.contentLocale),
      demand,
      intelligence,
      claims: record.claims.map((claim) => this.mapClaim(claim)),
      matching: record.matching && record.matching.deletedAt === null
        ? {
            status: this.matchingStatus(record.matching.status),
            version: record.matching.version,
            effectiveTargetProviderCount: record.matching.effectiveTargetProviderCount,
            effectiveBudgetMaxJpy: record.matching.effectiveBudgetMaxJpy,
            selectedQuoteTotalJpy: record.matching.selectedQuoteTotalJpy,
            matchedAt: record.matching.matchedAt?.toISOString() ?? null,
            participants: record.matching.participants.map((participant) => ({
              exchangeClaimId: participant.exchangeClaimId,
              providerPublicIdMasked: maskExchangeOperationsPublicId(
                participant.participantIdentity.publicIdentifier?.publicId ??
                  participant.participantIdentity.user.needoId
              ),
              providerDisplayNameMasked: maskExchangeOperationsDisplayName(
                participant.participantIdentity.displayName ??
                  participant.participantIdentity.user.username
              ),
              shopName: participant.shop.name,
              technicianDisplayNameMasked: maskExchangeOperationsDisplayName(
                participant.technicianProfile.displayName
              ),
              serviceName: participant.serviceNameSnapshot,
              durationMinutes: participant.serviceDurationSnapshot,
              quoteAmountJpy: participant.quoteAmountJpy,
              currency: "JPY",
              startsAt: participant.estimatedStartsAt.toISOString(),
              endsAt: participant.estimatedEndsAt.toISOString(),
              matchedAt: participant.matchedAt.toISOString(),
              bookingOrderNo: participant.bookingOrder?.orderNo ?? null,
              bookingStatus: participant.bookingOrder ? String(participant.bookingOrder.status) : null
            }))
          }
        : null,
      timeline: this.timeline(record, auditLogs, ledgerTransactions)
    };
  }

  private listWhere(
    input: Parameters<ExchangeOperationsRepositoryPort["list"]>[0]
  ): Prisma.ExchangePostWhereInput {
    const status = input.status;
    const conditions: Prisma.ExchangePostWhereInput[] = [];

    if (input.type === "demand") {
      conditions.push(
        { type: ExchangePostType.DEMAND },
        { demand: { is: { deletedAt: null } } }
      );
    } else if (input.type === "intelligence") {
      conditions.push(
        { type: ExchangePostType.INTELLIGENCE },
        { intelligence: { is: { deletedAt: null } } }
      );
    } else {
      conditions.push({
        OR: [
          { type: ExchangePostType.DEMAND, demand: { is: { deletedAt: null } } },
          {
            type: ExchangePostType.INTELLIGENCE,
            intelligence: { is: { deletedAt: null } }
          }
        ]
      });
    }

    if (status === "published") {
      conditions.push({ status: ExchangePostStatus.PUBLISHED, expiresAt: { gt: input.now } });
    } else if (status === "expired") {
      conditions.push({
        OR: [
          { status: ExchangePostStatus.EXPIRED },
          { status: ExchangePostStatus.PUBLISHED, expiresAt: { lte: input.now } }
        ]
      });
    } else if (status) {
      conditions.push({ status: statusToDatabase[status] });
    }

    if (input.matchMode) {
      conditions.push({
        demand: { is: { matchMode: matchModeToDatabase[input.matchMode], deletedAt: null } }
      });
    }
    if (input.publisherIdentityType) {
      conditions.push({ publisherIdentityType: input.publisherIdentityType });
    }
    if (input.keyword) {
      conditions.push({
        OR: [
          { title: { contains: input.keyword } },
          { detail: { contains: input.keyword } },
          { publisherPublicId: { contains: input.keyword } },
          { publisherDisplayName: { contains: input.keyword } },
          { areaLabel: { contains: input.keyword } }
        ]
      });
    }

    return {
      deletedAt: null,
      AND: conditions
    };
  }

  private mapPost(record: ExchangeOperationsPostRecord, now: Date): ExchangeOperationsPost {
    if (!this.validSubtype(record)) {
      throw new Error("error.exchange.operations.invalid_subtype");
    }
    const demand = record.demand?.deletedAt === null ? record.demand : null;
    const intelligence = record.intelligence?.deletedAt === null ? record.intelligence : null;
    const financial =
      record.requestFinancial?.deletedAt === null ? record.requestFinancial : null;
    const logicalStatus =
      record.status === ExchangePostStatus.PUBLISHED && record.expiresAt <= now
        ? "expired"
        : statusFromDatabase[record.status];
    const serviceMode: ExchangeOperationsServiceMode = demand
      ? demandModeFromDatabase[demand.serviceMode]
      : intelligenceModeFromDatabase[intelligence!.serviceMode];
    return {
      id: record.id,
      type: postTypeFromDatabase[record.type],
      status: logicalStatus,
      title: record.title,
      publisher: {
        publicIdMasked: maskExchangeOperationsPublicId(record.publisherPublicId),
        displayNameMasked: maskExchangeOperationsDisplayName(record.publisherDisplayName),
        identityType: record.publisherIdentityType
      },
      serviceMode,
      areaLabel: record.areaLabel,
      serviceStartAt: record.serviceStartAt.toISOString(),
      serviceEndAt: record.serviceEndAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      publishedAt: record.createdAt.toISOString(),
      budgetMinJpy: demand?.budgetMinJpy ?? intelligence?.campaignPriceJpy ?? null,
      budgetMaxJpy: demand?.budgetMaxJpy ?? intelligence?.campaignPriceJpy ?? null,
      matchMode: demand ? matchModeFromDatabase[demand.matchMode] : null,
      claimCount: record.claims.length,
      activeClaimCount: record.claims.filter(
        ({ status }) => status === ExchangeClaimStatus.ACTIVE
      ).length,
      matchedCount: record.matching?.participants.length ?? 0,
      financial: financial ? this.mapFinancial(financial) : null
    };
  }

  private validSubtype(record: ExchangeOperationsPostRecord): boolean {
    const demand = record.demand?.deletedAt === null;
    const intelligence = record.intelligence?.deletedAt === null;
    return record.type === ExchangePostType.DEMAND ? demand && !intelligence : intelligence && !demand;
  }

  private mapFinancial(
    financial: NonNullable<ExchangeOperationsPostRecord["requestFinancial"]>
  ): ExchangeOperationsFinancial {
    if (financial.walletHold.deletedAt !== null) {
      throw new Error("error.exchange.operations.invalid_financial_hold");
    }
    const state: ExchangeOperationsFinancial["state"] =
      financial.state === ExchangeRequestFinancialState.CAPTURED
        ? "captured"
        : financial.state === ExchangeRequestFinancialState.RELEASED
          ? "released"
          : "held";
    return {
      state,
      amountNdp: financial.amountNdp,
      currency: currency(financial.currency),
      heldAmountNdp: financial.walletHold.holdAmountNdp,
      capturedAmountNdp: financial.walletHold.capturedAmountNdp,
      releasedAmountNdp: financial.walletHold.releasedAmountNdp,
      ruleSetVersion: financial.feeRuleSetVersion,
      createdAt: financial.createdAt.toISOString(),
      capturedAt: financial.capturedAt?.toISOString() ?? null,
      releasedAt: financial.releasedAt?.toISOString() ?? null
    };
  }

  private mapClaim(claim: ExchangeOperationsPostRecord["claims"][number]): ExchangeOperationsClaim {
    const service = claim.service ?? claim.technicianService;
    if (!service) throw new Error("error.exchange.operations.invalid_claim_service");
    return {
      id: claim.id,
      status: claimStatusFromDatabase[claim.status],
      providerPublicIdMasked: maskExchangeOperationsPublicId(
        claim.claimantIdentity.publicIdentifier?.publicId ?? claim.claimantIdentity.user.needoId
      ),
      providerDisplayNameMasked: maskExchangeOperationsDisplayName(
        claim.claimantIdentity.displayName ?? claim.claimantIdentity.user.username
      ),
      shopName: claim.shop.name,
      technicianDisplayNameMasked: maskExchangeOperationsDisplayName(
        claim.technicianProfile.displayName
      ),
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      quoteAmountJpy: claim.quoteAmountJpy,
      currency: "JPY",
      message: claim.message ? redactExchangeOperationsText(claim.message) : null,
      startsAt: claim.scheduleSlot.startsAt.toISOString(),
      endsAt: claim.scheduleSlot.endsAt.toISOString(),
      createdAt: claim.createdAt.toISOString(),
      withdrawnAt: claim.withdrawnAt?.toISOString() ?? null,
      terminalAt: claim.terminalAt?.toISOString() ?? null
    };
  }

  private matchingStatus(status: ExchangeMatchingStatus): "open" | "matched" | "closed" {
    if (status === ExchangeMatchingStatus.MATCHED) return "matched";
    if (status === ExchangeMatchingStatus.CLOSED) return "closed";
    return "open";
  }

  private timeline(
    record: ExchangeOperationsPostRecord,
    audits: Array<{
      id: number;
      action: string;
      createdAt: Date;
      actor: { username: string } | null;
    }>,
    ledger: Array<{
      id: number;
      type: unknown;
      status: unknown;
      amount: number;
      currency: string;
      createdAt: Date;
    }>
  ): ExchangeOperationsTimelineEvent[] {
    const events: ExchangeOperationsTimelineEvent[] = [
      {
        id: `post:${record.id}:published`,
        source: "post",
        event: "published",
        status: "published",
        actorDisplayNameMasked: maskExchangeOperationsDisplayName(record.publisherDisplayName),
        amount: null,
        currency: null,
        createdAt: record.createdAt.toISOString()
      },
      ...record.claims.flatMap<ExchangeOperationsTimelineEvent>((claim) => {
        const actor = maskExchangeOperationsDisplayName(
          claim.claimantIdentity.displayName ?? claim.claimantIdentity.user.username
        );
        const claimEvents: ExchangeOperationsTimelineEvent[] = [
          {
            id: `claim:${claim.id}:created`,
            source: "claim",
            event: "created",
            status: claimStatusFromDatabase[claim.status],
            actorDisplayNameMasked: actor,
            amount: claim.quoteAmountJpy,
            currency: null,
            createdAt: claim.createdAt.toISOString()
          }
        ];
        const terminalAt = claim.withdrawnAt ?? claim.terminalAt;
        if (terminalAt) {
          claimEvents.push({
            id: `claim:${claim.id}:terminal`,
            source: "claim",
            event: claimStatusFromDatabase[claim.status],
            status: claimStatusFromDatabase[claim.status],
            actorDisplayNameMasked: actor,
            amount: null,
            currency: null,
            createdAt: terminalAt.toISOString()
          });
        }
        return claimEvents;
      }),
      ...(record.matching?.events ?? []).map((event) => ({
        id: `matching:${event.id}`,
        source: "matching" as const,
        event: String(event.type).toLowerCase(),
        status: null,
        actorDisplayNameMasked:
          event.actorIdentity?.displayName || event.actorUser?.username
            ? maskExchangeOperationsDisplayName(
                event.actorIdentity?.displayName ?? event.actorUser!.username
              )
            : null,
        amount: null,
        currency: null,
        createdAt: event.createdAt.toISOString()
      })),
      ...ledger.map((transaction) => ({
        id: `financial:${transaction.id}`,
        source: "financial" as const,
        event: String(transaction.type).toLowerCase(),
        status: String(transaction.status).toLowerCase(),
        actorDisplayNameMasked: null,
        amount: transaction.amount,
        currency: currency(transaction.currency),
        createdAt: transaction.createdAt.toISOString()
      })),
      ...audits.map((audit) => ({
        id: `audit:${audit.id}`,
        source: "audit" as const,
        event: audit.action,
        status: null,
        actorDisplayNameMasked: audit.actor
          ? maskExchangeOperationsDisplayName(audit.actor.username)
          : null,
        amount: null,
        currency: null,
        createdAt: audit.createdAt.toISOString()
      }))
    ];
    if (record.status !== ExchangePostStatus.PUBLISHED) {
      events.push({
        id: `post:${record.id}:terminal`,
        source: "post",
        event: statusFromDatabase[record.status],
        status: statusFromDatabase[record.status],
        actorDisplayNameMasked: null,
        amount: null,
        currency: null,
        createdAt: (record.withdrawnAt ?? record.updatedAt).toISOString()
      });
    }
    return events.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    );
  }
}
