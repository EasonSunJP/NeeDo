import {
  BookingOrderStatus,
  ExchangeClaimStatus as DatabaseExchangeClaimStatus,
  ExchangeMatchEventType as DatabaseExchangeMatchEventType,
  ExchangeMatchMode as DatabaseExchangeMatchMode,
  ExchangeMatchingStatus as DatabaseExchangeMatchingStatus,
  ExchangePostStatus as DatabaseExchangePostStatus,
  ExchangePostType as DatabaseExchangePostType,
  Prisma,
  ScheduleSlotStatus,
  TechnicianServiceReviewStatus,
  TechnicianShopWorkStatus,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ExchangeClaimOptionPage,
  ExchangeClaimOptionPayload,
  ExchangeClaimPage,
  ExchangeClaimPayload,
  ExchangeClaimServiceRef
} from "../types/exchange-claim.types";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginationInput
} from "../utils/pagination";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type ExchangeClaimProviderScope =
  | { kind: "merchant"; shopId: number }
  | { kind: "technician"; technicianProfileId: number };

export interface ExchangeClaimOptionListInput {
  postId: number;
  scope: ExchangeClaimProviderScope;
  page: number;
  pageSize: number;
  now: Date;
  shopId?: number;
  technicianProfileId?: number;
  serviceRef?: ExchangeClaimServiceRef;
}

export interface ExchangeClaimRequestRecord {
  id: number;
  authorUserId: number;
  ownerIdentityId: number;
  type: "demand" | "intelligence";
  status: "published" | "withdrawn" | "expired";
  serviceStartAt: Date;
  serviceEndAt: Date;
  expiresAt: Date;
  demand: {
    matchMode: "quick" | "selective";
    budgetMinJpy: number | null;
    budgetMaxJpy: number;
  } | null;
}

export interface ExchangeClaimLockedOption {
  scheduleSlotId: number;
  shopId: number;
  technicianProfileId: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  serviceName: string;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
}

export interface ExchangeClaimCreateRepositoryInput {
  exchangePostId: number;
  claimantUserId: number;
  claimantIdentityId: number;
  shopId: number;
  technicianProfileId: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  scheduleSlotId: number;
  quoteAmountJpy: number;
  message: string | null;
  idempotencyKey: string;
  payloadFingerprint: string;
  now: Date;
}

export interface ExchangeClaimLockedRecord {
  id: number;
  exchangePostId: number;
  claimantIdentityId: number;
  status: ExchangeClaimPayload["status"];
  withdrawalIdempotencyKey: string | null;
  withdrawalPayloadFingerprint: string | null;
  claim: ExchangeClaimPayload;
}

interface ExchangeClaimOptionRow {
  scheduleSlotId: number | bigint;
  shopId: number | bigint;
  shopName: string;
  technicianProfileId: number | bigint;
  technicianPublicId: string;
  technicianDisplayName: string;
  serviceId: number | bigint | null;
  technicianServiceId: number | bigint | null;
  serviceName: string;
  durationMinutes: number | bigint;
  startsAt: Date;
  endsAt: Date;
}

interface CountRow {
  total: number | bigint;
}

type ExchangeClaimPrismaClient = PrismaClient | Prisma.TransactionClient;

const claimInclude = {
  claimantIdentity: {
    select: {
      displayName: true,
      publicIdentifier: { select: { publicId: true } },
      user: { select: { username: true, avatarUrl: true } }
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
  technicianService: { select: { id: true, name: true, durationMinutes: true } },
  scheduleSlot: { select: { id: true, startsAt: true, endsAt: true } }
} satisfies Prisma.ExchangeClaimInclude;

type ExchangeClaimRecord = Prisma.ExchangeClaimGetPayload<{ include: typeof claimInclude }>;

export class ExchangeClaimRepository {
  public constructor(private readonly client: ExchangeClaimPrismaClient = prisma) {}

  public runInTransaction<T>(
    handler: (repository: ExchangeClaimRepository) => Promise<T>,
    transactionClient?: ExchangeClaimPrismaClient
  ): Promise<T> {
    if (transactionClient) {
      return handler(new ExchangeClaimRepository(transactionClient));
    }
    if (!this.canStartTransaction(this.client)) return handler(this);
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction((transaction) => handler(new ExchangeClaimRepository(transaction)), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
      })
    );
  }

  public async listOptions(input: ExchangeClaimOptionListInput): Promise<ExchangeClaimOptionPage> {
    const pagination = toPrismaPagination(input);
    const filters: Prisma.Sql[] = [
      Prisma.sql`post.\`id\` = ${input.postId}`,
      Prisma.sql`post.\`type\` = 'demand'`,
      Prisma.sql`post.\`status\` = 'published'`,
      Prisma.sql`post.\`expires_at\` > ${input.now}`,
      Prisma.sql`post.\`deleted_at\` IS NULL`,
      Prisma.sql`demand.\`match_mode\` = 'selective'`,
      Prisma.sql`demand.\`deleted_at\` IS NULL`,
      Prisma.sql`slot.\`status\` = 'available'`,
      Prisma.sql`slot.\`booked_count\` < slot.\`capacity\``,
      Prisma.sql`slot.\`technician_profile_id\` IS NOT NULL`,
      Prisma.sql`slot.\`starts_at\` >= post.\`service_start_at\``,
      Prisma.sql`slot.\`ends_at\` <= post.\`service_end_at\``,
      Prisma.sql`slot.\`deleted_at\` IS NULL`,
      Prisma.sql`shop.\`status\` = 'published'`,
      Prisma.sql`shop.\`deleted_at\` IS NULL`,
      Prisma.sql`technician.\`status\` = 'published'`,
      Prisma.sql`technician.\`deleted_at\` IS NULL`,
      Prisma.sql`affiliation.\`active_key\` IS NOT NULL`,
      Prisma.sql`affiliation.\`work_status\` = 'active'`,
      Prisma.sql`affiliation.\`starts_at\` <= ${input.now}`,
      Prisma.sql`(affiliation.\`ends_at\` IS NULL OR affiliation.\`ends_at\` > ${input.now})`,
      Prisma.sql`affiliation.\`deleted_at\` IS NULL`,
      Prisma.sql`technician_identity.\`type\` = 'technician'`,
      Prisma.sql`technician_identity.\`is_active\` = TRUE`,
      Prisma.sql`technician_identity.\`deleted_at\` IS NULL`,
      Prisma.sql`technician_public.\`kind\` = 's'`,
      Prisma.sql`technician_public.\`status\` = 'active'`,
      Prisma.sql`technician_public.\`deleted_at\` IS NULL`,
      Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM \`entity_suspensions\` AS suspension
        WHERE suspension.\`subject_type\` = 'shop'
          AND suspension.\`shop_id\` = shop.\`id\`
          AND suspension.\`active_key\` IS NOT NULL
          AND suspension.\`status\` = 'active'
          AND suspension.\`deleted_at\` IS NULL
      )`,
      Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM \`exchange_match_participants\` AS matched_participant
        WHERE matched_participant.\`technician_profile_id\` = slot.\`technician_profile_id\`
          AND matched_participant.\`estimated_starts_at\` < slot.\`ends_at\`
          AND matched_participant.\`estimated_ends_at\` > slot.\`starts_at\`
          AND matched_participant.\`active_reservation_key\` IS NOT NULL
          AND matched_participant.\`deleted_at\` IS NULL
      )`,
      Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM \`exchange_claims\` AS active_claim
        JOIN \`schedule_slots\` AS claimed_slot
          ON claimed_slot.\`id\` = active_claim.\`schedule_slot_id\`
         AND claimed_slot.\`deleted_at\` IS NULL
        WHERE active_claim.\`technician_profile_id\` = slot.\`technician_profile_id\`
          AND active_claim.\`status\` = 'active'
          AND active_claim.\`deleted_at\` IS NULL
          AND claimed_slot.\`starts_at\` < slot.\`ends_at\`
          AND claimed_slot.\`ends_at\` > slot.\`starts_at\`
      )`,
      Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM \`booking_orders\` AS busy_order
        WHERE busy_order.\`technician_profile_id\` = slot.\`technician_profile_id\`
          AND busy_order.\`status\` IN ('confirmed', 'in_service')
          AND busy_order.\`starts_at\` < slot.\`ends_at\`
          AND busy_order.\`ends_at\` > slot.\`starts_at\`
          AND busy_order.\`deleted_at\` IS NULL
      )`,
      Prisma.sql`(
        (
          shop.\`pricing_mode\` = 'merchant'
          AND slot.\`service_id\` IS NOT NULL
          AND slot.\`technician_service_id\` IS NULL
          AND shop_service.\`shop_id\` = slot.\`shop_id\`
          AND shop_service.\`status\` = 'published'
          AND shop_service.\`deleted_at\` IS NULL
        )
        OR
        (
          shop.\`pricing_mode\` = 'technician'
          AND slot.\`service_id\` IS NULL
          AND slot.\`technician_service_id\` IS NOT NULL
          AND technician_service.\`shop_id\` = slot.\`shop_id\`
          AND technician_service.\`technician_id\` = slot.\`technician_profile_id\`
          AND technician_service.\`is_active\` = TRUE
          AND technician_service.\`is_bookable\` = TRUE
          AND technician_service.\`review_status\` = 'approved'
          AND technician_service.\`deleted_at\` IS NULL
        )
      )`
    ];

    filters.push(
      input.scope.kind === "merchant"
        ? Prisma.sql`slot.\`shop_id\` = ${input.scope.shopId}`
        : Prisma.sql`slot.\`technician_profile_id\` = ${input.scope.technicianProfileId}`
    );
    if (input.shopId) filters.push(Prisma.sql`slot.\`shop_id\` = ${input.shopId}`);
    if (input.technicianProfileId) {
      filters.push(Prisma.sql`slot.\`technician_profile_id\` = ${input.technicianProfileId}`);
    }
    if (input.serviceRef) {
      const [kind, rawId] = input.serviceRef.split(":") as ["shop" | "technician", string];
      const serviceId = Number(rawId);
      filters.push(
        kind === "shop"
          ? Prisma.sql`slot.\`service_id\` = ${serviceId}`
          : Prisma.sql`slot.\`technician_service_id\` = ${serviceId}`
      );
    }

    const from = Prisma.sql`
      FROM \`exchange_posts\` AS post
      JOIN \`exchange_demands\` AS demand ON demand.\`post_id\` = post.\`id\`
      JOIN \`schedule_slots\` AS slot
        ON slot.\`starts_at\` >= post.\`service_start_at\`
       AND slot.\`ends_at\` <= post.\`service_end_at\`
      JOIN \`shops\` AS shop ON shop.\`id\` = slot.\`shop_id\`
      JOIN \`technician_profiles\` AS technician
        ON technician.\`id\` = slot.\`technician_profile_id\`
      JOIN \`technician_shop_affiliations\` AS affiliation
        ON affiliation.\`shop_id\` = slot.\`shop_id\`
       AND affiliation.\`technician_profile_id\` = slot.\`technician_profile_id\`
      JOIN \`users\` AS technician_user
        ON technician_user.\`id\` = technician.\`user_id\`
       AND technician_user.\`is_active\` = TRUE
       AND technician_user.\`deleted_at\` IS NULL
      JOIN \`user_identities\` AS technician_identity
        ON technician_identity.\`user_id\` = technician_user.\`id\`
      JOIN \`public_identifiers\` AS technician_public
        ON technician_public.\`user_identity_id\` = technician_identity.\`id\`
      LEFT JOIN \`services\` AS shop_service ON shop_service.\`id\` = slot.\`service_id\`
      LEFT JOIN \`technician_services\` AS technician_service
        ON technician_service.\`id\` = slot.\`technician_service_id\`
    `;
    const where = Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;

    const [countRows, rows] = await Promise.all([
      this.client.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        ${from}
        ${where}
      `),
      this.client.$queryRaw<ExchangeClaimOptionRow[]>(Prisma.sql`
        SELECT
          slot.\`id\` AS scheduleSlotId,
          shop.\`id\` AS shopId,
          shop.\`name\` AS shopName,
          technician.\`id\` AS technicianProfileId,
          technician_public.\`public_id\` AS technicianPublicId,
          technician.\`display_name\` AS technicianDisplayName,
          slot.\`service_id\` AS serviceId,
          slot.\`technician_service_id\` AS technicianServiceId,
          COALESCE(shop_service.\`name\`, technician_service.\`name\`) AS serviceName,
          COALESCE(shop_service.\`duration_minutes\`, technician_service.\`duration_minutes\`) AS durationMinutes,
          slot.\`starts_at\` AS startsAt,
          slot.\`ends_at\` AS endsAt
        ${from}
        ${where}
        ORDER BY slot.\`starts_at\` ASC, slot.\`id\` ASC
        LIMIT ${pagination.take} OFFSET ${pagination.skip}
      `)
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapOption(row)),
      Number(countRows[0]?.total ?? 0),
      pagination
    );
  }

  public async lockRequest(postId: number): Promise<ExchangeClaimRequestRecord | null> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM \`exchange_posts\`
      WHERE id = ${postId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!locked[0]) return null;
    return this.findRequest(postId);
  }

  public async findRequest(postId: number): Promise<ExchangeClaimRequestRecord | null> {
    const row = await this.client.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      select: {
        id: true,
        authorUserId: true,
        ownerIdentityId: true,
        type: true,
        status: true,
        serviceStartAt: true,
        serviceEndAt: true,
        expiresAt: true,
        demand: {
          select: { matchMode: true, budgetMinJpy: true, budgetMaxJpy: true }
        }
      }
    });
    if (!row) return null;
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      ownerIdentityId: row.ownerIdentityId,
      type: row.type === DatabaseExchangePostType.DEMAND ? "demand" : "intelligence",
      status:
        row.status === DatabaseExchangePostStatus.PUBLISHED
          ? "published"
          : row.status === DatabaseExchangePostStatus.WITHDRAWN
            ? "withdrawn"
            : "expired",
      serviceStartAt: row.serviceStartAt,
      serviceEndAt: row.serviceEndAt,
      expiresAt: row.expiresAt,
      demand: row.demand
        ? {
            matchMode:
              row.demand.matchMode === DatabaseExchangeMatchMode.SELECTIVE ? "selective" : "quick",
            budgetMinJpy: row.demand.budgetMinJpy,
            budgetMaxJpy: row.demand.budgetMaxJpy
          }
        : null
    };
  }

  public async lockMatching(postId: number): Promise<{
    id: number;
    status: "open" | "matched" | "closed";
    version: number;
  } | null> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM \`exchange_request_matchings\`
      WHERE exchange_post_id = ${postId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!locked[0]) return null;
    const row = await this.client.exchangeRequestMatching.findUnique({
      where: { exchangePostId: postId },
      select: { id: true, status: true, version: true }
    });
    return row
      ? {
          id: row.id,
          status: row.status.toLowerCase() as "open" | "matched" | "closed",
          version: row.version
        }
      : null;
  }

  public async advanceMatchingForClaimEvent(input: {
    matchingId: number;
    exchangePostId: number;
    claimId: number;
    type: "claim_added" | "claim_withdrawn";
    actorUserId: number;
    actorIdentityId: number;
    versionBefore: number;
    at: Date;
  }): Promise<boolean> {
    const versionAfter = input.versionBefore + 1;
    const updated = await this.client.exchangeRequestMatching.updateMany({
      where: {
        id: input.matchingId,
        exchangePostId: input.exchangePostId,
        status: DatabaseExchangeMatchingStatus.OPEN,
        version: input.versionBefore,
        deletedAt: null
      },
      data: { version: versionAfter, updatedAt: input.at }
    });
    if (updated.count !== 1) return false;
    await this.client.exchangeMatchEvent.create({
      data: {
        matchingId: input.matchingId,
        sequence: versionAfter,
        type:
          input.type === "claim_added"
            ? DatabaseExchangeMatchEventType.CLAIM_ADDED
            : DatabaseExchangeMatchEventType.CLAIM_WITHDRAWN,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        versionBefore: input.versionBefore,
        versionAfter,
        payload: {
          exchangePostId: input.exchangePostId,
          exchangeClaimId: input.claimId
        },
        createdAt: input.at,
        updatedAt: input.at
      }
    });
    return true;
  }

  public async findOptionCandidate(
    scheduleSlotId: number,
    scope: ExchangeClaimProviderScope
  ): Promise<{ technicianProfileId: number } | null> {
    const row = await this.client.scheduleSlot.findFirst({
      where: {
        id: scheduleSlotId,
        ...(scope.kind === "merchant"
          ? { shopId: scope.shopId, technicianProfileId: { not: null } }
          : { technicianProfileId: scope.technicianProfileId }),
        deletedAt: null
      },
      select: { technicianProfileId: true }
    });
    return row?.technicianProfileId ? { technicianProfileId: row.technicianProfileId } : null;
  }

  public async lockTechnician(technicianProfileId: number): Promise<boolean> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM \`technician_profiles\`
      WHERE id = ${technicianProfileId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    return Boolean(locked[0]);
  }

  public async lockOption(
    scheduleSlotId: number,
    scope: ExchangeClaimProviderScope,
    now: Date = new Date()
  ): Promise<ExchangeClaimLockedOption | null> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM \`schedule_slots\`
      WHERE id = ${scheduleSlotId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!locked[0]) return null;
    const row = await this.client.scheduleSlot.findFirst({
      where: {
        id: scheduleSlotId,
        ...(scope.kind === "merchant"
          ? { shopId: scope.shopId }
          : { technicianProfileId: scope.technicianProfileId }),
        status: ScheduleSlotStatus.AVAILABLE,
        deletedAt: null,
        technicianProfileId: { not: null },
        shop: {
          is: {
            status: "published",
            deletedAt: null,
            entitySuspensions: {
              none: { status: "ACTIVE", activeKey: { not: null }, deletedAt: null }
            }
          }
        },
        technicianProfile: {
          is: {
            status: "published",
            deletedAt: null,
            technicianShopAffiliations: {
              some: {
                ...(scope.kind === "merchant" ? { shopId: scope.shopId } : {}),
                workStatus: TechnicianShopWorkStatus.ACTIVE,
                activeKey: { not: null },
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null
              }
            }
          }
        },
        OR: [
          {
            serviceId: { not: null },
            technicianServiceId: null,
            shop: { is: { pricingMode: "MERCHANT" } },
            service: { is: { status: "published", deletedAt: null } }
          },
          {
            serviceId: null,
            technicianServiceId: { not: null },
            shop: { is: { pricingMode: "TECHNICIAN" } },
            technicianService: {
              is: {
                isActive: true,
                isBookable: true,
                reviewStatus: TechnicianServiceReviewStatus.APPROVED,
                deletedAt: null
              }
            }
          }
        ]
      },
      select: {
        id: true,
        shopId: true,
        technicianProfileId: true,
        serviceId: true,
        technicianServiceId: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        bookedCount: true,
        service: { select: { name: true, durationMinutes: true, shopId: true } },
        technicianService: {
          select: { name: true, durationMinutes: true, shopId: true, technicianId: true }
        },
        technicianProfile: {
          select: {
            technicianShopAffiliations: {
              where: {
                workStatus: TechnicianShopWorkStatus.ACTIVE,
                activeKey: { not: null },
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null
              },
              select: { shopId: true }
            }
          }
        }
      }
    });
    if (
      !row ||
      row.technicianProfileId === null ||
      !row.technicianProfile ||
      row.bookedCount >= row.capacity
    ) {
      return null;
    }
    const selectedService = row.service ?? row.technicianService;
    if (!selectedService) return null;
    if (
      !row.technicianProfile.technicianShopAffiliations.some(
        (affiliation) => affiliation.shopId === row.shopId
      )
    ) {
      return null;
    }
    if (row.service && row.service.shopId !== row.shopId) return null;
    if (
      row.technicianService &&
      (row.technicianService.shopId !== row.shopId ||
        row.technicianService.technicianId !== row.technicianProfileId)
    ) {
      return null;
    }
    return {
      scheduleSlotId: row.id,
      shopId: row.shopId,
      technicianProfileId: row.technicianProfileId,
      serviceId: row.serviceId,
      technicianServiceId: row.technicianServiceId,
      serviceName: selectedService.name,
      durationMinutes: selectedService.durationMinutes,
      startsAt: row.startsAt,
      endsAt: row.endsAt
    };
  }

  public async hasOverlappingActiveClaim(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean> {
    const row = await this.client.exchangeClaim.findFirst({
      where: {
        technicianProfileId,
        status: DatabaseExchangeClaimStatus.ACTIVE,
        deletedAt: null,
        scheduleSlot: {
          is: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, deletedAt: null }
        }
      },
      select: { id: true }
    });
    return Boolean(row);
  }

  public async hasOverlappingMatchParticipant(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean> {
    const row = await this.client.exchangeMatchParticipant.findFirst({
      where: {
        technicianProfileId,
        estimatedStartsAt: { lt: endsAt },
        estimatedEndsAt: { gt: startsAt },
        activeReservationKey: { not: null },
        deletedAt: null
      },
      select: { id: true }
    });
    return Boolean(row);
  }

  public async hasActiveClaimForRequestTechnician(
    exchangePostId: number,
    technicianProfileId: number
  ): Promise<boolean> {
    const row = await this.client.exchangeClaim.findFirst({
      where: {
        exchangePostId,
        technicianProfileId,
        status: DatabaseExchangeClaimStatus.ACTIVE,
        deletedAt: null
      },
      select: { id: true }
    });
    return Boolean(row);
  }

  public async hasConflictingBooking(
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
    return Boolean(row);
  }

  public async create(input: ExchangeClaimCreateRepositoryInput): Promise<ExchangeClaimPayload> {
    const row = await this.client.exchangeClaim.create({
      data: {
        exchangePostId: input.exchangePostId,
        claimantUserId: input.claimantUserId,
        claimantIdentityId: input.claimantIdentityId,
        shopId: input.shopId,
        technicianProfileId: input.technicianProfileId,
        serviceId: input.serviceId,
        technicianServiceId: input.technicianServiceId,
        scheduleSlotId: input.scheduleSlotId,
        quoteAmountJpy: input.quoteAmountJpy,
        currency: "JPY",
        message: input.message,
        status: DatabaseExchangeClaimStatus.ACTIVE,
        activeKey: `request:${input.exchangePostId}:technician:${input.technicianProfileId}`,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        createdAt: input.now,
        updatedAt: input.now
      },
      include: claimInclude
    });
    return this.mapClaim(row);
  }

  public async findIdempotent(
    idempotencyKey: string
  ): Promise<{ claim: ExchangeClaimPayload; fingerprint: string } | null> {
    const row = await this.client.exchangeClaim.findFirst({
      where: { idempotencyKey, deletedAt: null },
      include: claimInclude
    });
    return row ? { claim: this.mapClaim(row), fingerprint: row.payloadFingerprint } : null;
  }

  public async findMine(
    exchangePostId: number,
    claimantIdentityId: number
  ): Promise<ExchangeClaimPayload | null> {
    const row = await this.client.exchangeClaim.findFirst({
      where: { exchangePostId, claimantIdentityId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: claimInclude
    });
    return row ? this.mapClaim(row) : null;
  }

  public async findMineById(
    claimId: number,
    claimantIdentityId: number
  ): Promise<ExchangeClaimPayload | null> {
    const row = await this.client.exchangeClaim.findFirst({
      where: { id: claimId, claimantIdentityId, deletedAt: null },
      include: claimInclude
    });
    return row ? this.mapClaim(row) : null;
  }

  public async listReceived(
    exchangePostId: number,
    ownerIdentityId: number,
    input: PaginationInput
  ): Promise<ExchangeClaimPage> {
    const pagination = toPrismaPagination(input);
    const where = {
      exchangePostId,
      exchangePost: { is: { ownerIdentityId, deletedAt: null } },
      deletedAt: null
    } satisfies Prisma.ExchangeClaimWhereInput;
    const [total, rows] = await Promise.all([
      this.client.exchangeClaim.count({ where }),
      this.client.exchangeClaim.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pagination.take,
        skip: pagination.skip,
        include: claimInclude
      })
    ]);
    return buildPaginatedResponse(
      rows.map((row) => this.mapClaim(row)),
      total,
      pagination
    );
  }

  public async lockClaim(claimId: number): Promise<ExchangeClaimLockedRecord | null> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM \`exchange_claims\`
      WHERE id = ${claimId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!locked[0]) return null;
    const row = await this.client.exchangeClaim.findFirst({
      where: { id: claimId, deletedAt: null },
      include: claimInclude
    });
    if (!row) return null;
    const claim = this.mapClaim(row);
    return {
      id: row.id,
      exchangePostId: row.exchangePostId,
      claimantIdentityId: row.claimantIdentityId,
      status: claim.status,
      withdrawalIdempotencyKey: row.withdrawalIdempotencyKey,
      withdrawalPayloadFingerprint: row.withdrawalPayloadFingerprint,
      claim
    };
  }

  public async withdraw(
    claimId: number,
    claimantIdentityId: number,
    now: Date,
    withdrawalIdempotencyKey: string,
    withdrawalPayloadFingerprint: string
  ): Promise<ExchangeClaimPayload | null> {
    const updated = await this.client.exchangeClaim.updateMany({
      where: {
        id: claimId,
        claimantIdentityId,
        status: DatabaseExchangeClaimStatus.ACTIVE,
        deletedAt: null
      },
      data: {
        status: DatabaseExchangeClaimStatus.WITHDRAWN,
        activeKey: null,
        withdrawnAt: now,
        terminalAt: now,
        withdrawalIdempotencyKey,
        withdrawalPayloadFingerprint,
        updatedAt: now
      }
    });
    if (updated.count !== 1) return null;
    const row = await this.client.exchangeClaim.findFirst({
      where: { id: claimId, claimantIdentityId, deletedAt: null },
      include: claimInclude
    });
    return row ? this.mapClaim(row) : null;
  }

  public async createAudit(input: AuditLogCreateInput): Promise<void> {
    await this.client.auditLog.create({ data: toAuditLogCreateData(input) });
  }

  private mapOption(row: ExchangeClaimOptionRow): ExchangeClaimOptionPayload {
    const serviceId = row.serviceId === null ? null : Number(row.serviceId);
    const technicianServiceId =
      row.technicianServiceId === null ? null : Number(row.technicianServiceId);
    const serviceRef: ExchangeClaimServiceRef = serviceId
      ? `shop:${serviceId}`
      : `technician:${technicianServiceId!}`;
    return {
      scheduleSlotId: Number(row.scheduleSlotId),
      shop: { id: Number(row.shopId), name: row.shopName },
      technician: {
        profileId: Number(row.technicianProfileId),
        publicId: row.technicianPublicId,
        displayName: row.technicianDisplayName
      },
      service: {
        ref: serviceRef,
        name: row.serviceName,
        durationMinutes: Number(row.durationMinutes)
      },
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString()
    };
  }

  private mapClaim(row: ExchangeClaimRecord): ExchangeClaimPayload {
    const technicianIdentity = row.technicianProfile.user.identities[0];
    const providerPublicId = row.claimantIdentity.publicIdentifier?.publicId;
    const technicianPublicId = technicianIdentity?.publicIdentifier?.publicId;
    if (!providerPublicId || !technicianPublicId) {
      throw new Error("error.exchange.claim_identity_projection_missing");
    }
    const selectedService = row.service ?? row.technicianService;
    if (!selectedService) throw new Error("error.exchange.claim_service_projection_missing");
    return {
      id: row.id,
      exchangePostId: row.exchangePostId,
      status:
        row.status === DatabaseExchangeClaimStatus.ACTIVE
          ? "active"
          : row.status === DatabaseExchangeClaimStatus.WITHDRAWN
            ? "withdrawn"
            : row.status === DatabaseExchangeClaimStatus.REQUEST_WITHDRAWN
              ? "request_withdrawn"
              : row.status === DatabaseExchangeClaimStatus.REQUEST_EXPIRED
                ? "request_expired"
                : row.status === DatabaseExchangeClaimStatus.MATCHED
                  ? "matched"
                  : row.status === DatabaseExchangeClaimStatus.NOT_SELECTED
                    ? "not_selected"
                    : "matching_closed",
      provider: {
        publicId: providerPublicId,
        displayName: row.claimantIdentity.displayName ?? row.claimantIdentity.user.username,
        avatarUrl: row.claimantIdentity.user.avatarUrl
      },
      shop: row.shop,
      technician: {
        profileId: row.technicianProfile.id,
        publicId: technicianPublicId,
        displayName: row.technicianProfile.displayName ?? technicianIdentity?.displayName ?? ""
      },
      service: {
        ref: row.service ? `shop:${row.service.id}` : `technician:${row.technicianService!.id}`,
        name: selectedService.name,
        durationMinutes: selectedService.durationMinutes
      },
      scheduleSlotId: row.scheduleSlot.id,
      quoteAmountJpy: row.quoteAmountJpy,
      currency: "JPY",
      message: row.message,
      estimatedStartsAt: row.scheduleSlot.startsAt.toISOString(),
      estimatedEndsAt: row.scheduleSlot.endsAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
      terminalAt: row.terminalAt?.toISOString() ?? null
    };
  }

  private canStartTransaction(client: ExchangeClaimPrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }
}
