import {
  ExchangeMatchingStatus,
  ExchangeMatchMode,
  ExchangePostStatus,
  ExchangePostType,
  type PrismaClient
} from "@prisma/client";
import { ExchangeMatchingRepository } from "../src/repositories/exchange-matching.repository";

const at = new Date("2026-09-01T01:00:00.000Z");

describe("ExchangeMatchingRepository", () => {
  it("locks Request then matching before reading the aggregate", async () => {
    const events: string[] = [];
    const queryRaw = jest.fn(async (query: { sql?: string }) => {
      if (query.sql?.includes("exchange_posts")) events.push("lock-post");
      if (query.sql?.includes("exchange_request_matchings")) events.push("lock-matching");
      return [{ id: query.sql?.includes("exchange_posts") ? 41 : 51 }];
    });
    const repository = new ExchangeMatchingRepository({
      $queryRaw: queryRaw,
      exchangeRequestMatching: {
        findUnique: jest.fn(async () => ({
          id: 51,
          exchangePostId: 41,
          status: ExchangeMatchingStatus.OPEN,
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 30_000,
          selectedQuoteTotalJpy: 0,
          version: 3,
          matchedAt: null,
          exchangePost: {
            id: 41,
            authorUserId: 7,
            ownerIdentityId: 17,
            type: ExchangePostType.DEMAND,
            status: ExchangePostStatus.PUBLISHED,
            expiresAt: new Date("2026-09-01T12:00:00.000Z"),
            demand: { matchMode: ExchangeMatchMode.SELECTIVE }
          },
          participants: []
        }))
      }
    } as unknown as PrismaClient);

    await expect(repository.lockMatching(41)).resolves.toMatchObject({ id: 51, version: 3 });
    expect(events).toEqual(["lock-post", "lock-matching"]);
  });

  it("persists only matching-domain state and audit in the transaction client", async () => {
    const events: string[] = [];
    const client = {
      exchangeMatchParticipant: {
        create: jest.fn(async () => {
          events.push("participant");
          return { id: 71 };
        })
      },
      exchangeClaim: {
        updateMany: jest.fn(async ({ data }: { data: { status: string } }) => {
          events.push(`claim:${data.status}`);
          return { count: 1 };
        })
      },
      exchangeRequestMatching: {
        updateMany: jest.fn(async () => {
          events.push("matching");
          return { count: 1 };
        }),
        findFirst: jest.fn(async () => ({
          id: 51,
          exchangePostId: 41,
          status: ExchangeMatchingStatus.MATCHED,
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 30_000,
          selectedQuoteTotalJpy: 15_000,
          version: 4,
          matchedAt: at,
          exchangePost: {
            id: 41,
            authorUserId: 7,
            ownerIdentityId: 17,
            type: ExchangePostType.DEMAND,
            status: ExchangePostStatus.MATCHED,
            expiresAt: new Date("2026-09-01T12:00:00.000Z"),
            demand: { matchMode: ExchangeMatchMode.SELECTIVE }
          },
          participants: []
        }))
      },
      exchangePost: {
        update: jest.fn(async () => {
          events.push("post");
          return { id: 41 };
        })
      },
      exchangeMatchEvent: {
        create: jest.fn(async () => {
          events.push("event");
          return { id: 81 };
        })
      },
      notification: {
        createMany: jest.fn(async () => {
          events.push("notification");
          return { count: 2 };
        })
      },
      auditLog: {
        create: jest.fn(async () => {
          events.push("audit");
          return { id: 91 };
        })
      }
    };
    const repository = new ExchangeMatchingRepository(client as unknown as PrismaClient);

    await expect(
      repository.completeSelection({
        matchingId: 51,
        exchangePostId: 41,
        selectedClaims: [
          {
            id: 301,
            exchangePostId: 41,
            claimantUserId: 8,
            claimantIdentityId: 18,
            shopId: 11,
            technicianProfileId: 81,
            serviceId: 501,
            technicianServiceId: null,
            scheduleSlotId: 91,
            quoteAmountJpy: 15_000,
            currency: "JPY",
            status: "active",
            estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
            estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z")
          }
        ],
        selectedClaimIds: [301],
        unselectedClaims: [
          {
            id: 302,
            exchangePostId: 41,
            claimantUserId: 9,
            claimantIdentityId: 19,
            shopId: 12,
            technicianProfileId: 82,
            serviceId: 502,
            technicianServiceId: null,
            scheduleSlotId: 92,
            quoteAmountJpy: 16_000,
            currency: "JPY",
            status: "active",
            estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
            estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z")
          }
        ],
        unselectedClaimIds: [302],
        selectedQuoteTotalJpy: 15_000,
        versionBefore: 3,
        versionAfter: 4,
        actorUserId: 7,
        actorIdentityId: 17,
        idempotencyKey: "matching-repository-key-0001",
        payloadFingerprint: "a".repeat(64),
        at,
        audit: {
          actorId: 7,
          action: "exchange.matching.select",
          targetType: "exchange_request_matching",
          targetId: 51
        }
      })
    ).resolves.toMatchObject({ status: "matched", version: 4 });

    expect(events).toEqual([
      "participant",
      "claim:MATCHED",
      "claim:NOT_SELECTED",
      "matching",
      "post",
      "event",
      "notification",
      "audit"
    ]);
    expect(client.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: 8,
          recipientIdentityId: 18,
          actorUserId: 7,
          actorIdentityId: 17,
          type: "SYSTEM",
          title: "exchange.matching.selected.title",
          body: "exchange.matching.selected.body",
          payload: { exchangePostId: 41, exchangeClaimId: 301, status: "matched" }
        }),
        expect.objectContaining({
          recipientUserId: 9,
          recipientIdentityId: 19,
          actorUserId: 7,
          actorIdentityId: 17,
          type: "SYSTEM",
          title: "exchange.matching.not_selected.title",
          body: "exchange.matching.not_selected.body",
          payload: { exchangePostId: 41, exchangeClaimId: 302, status: "not_selected" }
        })
      ]
    });
    expect(client).not.toHaveProperty("bookingOrder");
    expect(client).not.toHaveProperty("wallet");
    expect(client).not.toHaveProperty("ledgerTransaction");
  });
});
