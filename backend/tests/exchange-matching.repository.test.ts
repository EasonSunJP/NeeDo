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
  it("projects immutable snapshots and booking state only to the owner or selected provider", async () => {
    const matching = {
      id: 51,
      exchangePostId: 41,
      status: ExchangeMatchingStatus.MATCHED,
      effectiveTargetProviderCount: 2,
      effectiveBudgetMaxJpy: 30_000,
      selectedQuoteTotalJpy: 29_000,
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
      participants: [
        {
          id: 71,
          exchangeClaimId: 301,
          participantIdentityId: 18,
          shop: { id: 11, name: "Aoyama Care" },
          technicianProfile: {
            id: 81,
            displayName: "山田 花子",
            user: {
              identities: [
                { displayName: "山田 花子", publicIdentifier: { publicId: "S000000081" } }
              ]
            }
          },
          exchangeClaim: {
            claimantIdentity: {
              displayName: "青山店",
              publicIdentifier: { publicId: "M000000018" },
              user: { username: "aoyama", avatarUrl: null }
            }
          },
          serviceId: 501,
          technicianServiceId: null,
          serviceNameSnapshot: "Matched service snapshot",
          serviceDurationSnapshot: 90,
          quoteAmountJpy: 15_000,
          scheduleSlotId: 91,
          estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
          estimatedEndsAt: new Date("2026-09-02T02:30:00.000Z"),
          matchedAt: at,
          bookingOrderId: 501,
          bookingOrder: { id: 501, orderNo: "ND501", status: "PENDING" }
        },
        {
          id: 72,
          exchangeClaimId: 302,
          participantIdentityId: 19,
          shop: { id: 12, name: "Harajuku Care" },
          technicianProfile: {
            id: 82,
            displayName: "佐々木 花子",
            user: {
              identities: [
                { displayName: "佐々木 花子", publicIdentifier: { publicId: "S000000082" } }
              ]
            }
          },
          exchangeClaim: {
            claimantIdentity: {
              displayName: "原宿店",
              publicIdentifier: { publicId: "M000000019" },
              user: { username: "harajuku", avatarUrl: null }
            }
          },
          serviceId: null,
          technicianServiceId: 601,
          serviceNameSnapshot: "Other immutable snapshot",
          serviceDurationSnapshot: 60,
          quoteAmountJpy: 14_000,
          scheduleSlotId: 92,
          estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
          estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z"),
          matchedAt: at,
          bookingOrderId: null,
          bookingOrder: null
        }
      ]
    };
    const repository = new ExchangeMatchingRepository({
      exchangeRequestMatching: { findFirst: jest.fn(async () => matching) }
    } as unknown as PrismaClient);

    const ownerPayload = await repository.findForViewer(41, 17);
    const providerPayload = await repository.findForViewer(41, 18);
    const nonSelectedPayload = await repository.findForViewer(41, 99);

    expect(ownerPayload?.payload.participants[0]).toMatchObject({
      service: { name: "Matched service snapshot", durationMinutes: 90 },
      booking: { orderId: 501, orderNo: "ND501", status: "pending" }
    });
    expect(
      (ownerPayload?.payload.viewer as { canCreateBookings?: boolean } | undefined)
        ?.canCreateBookings
    ).toBe(false);
    expect(providerPayload?.payload.participants).toHaveLength(1);
    expect(providerPayload?.payload.participants[0]?.exchangeClaimId).toBe(301);
    expect(nonSelectedPayload).toBeNull();
  });

  it("checks only active participant reservations for matching conflicts", async () => {
    const findFirst = jest.fn(async () => null);
    const repository = new ExchangeMatchingRepository({
      exchangeMatchParticipant: { findFirst }
    } as unknown as PrismaClient);

    await repository.hasParticipantConflict(
      81,
      new Date("2026-09-02T01:00:00.000Z"),
      new Date("2026-09-02T02:00:00.000Z")
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activeReservationKey: { not: null } })
      })
    );
  });

  it("enables booking creation for a matched owner only when every participant remains unbooked", async () => {
    const repository = new ExchangeMatchingRepository({
      exchangeRequestMatching: {
        findFirst: jest.fn(async () => ({
          id: 51,
          exchangePostId: 41,
          status: ExchangeMatchingStatus.MATCHED,
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 15_000,
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
          participants: [
            {
              exchangeClaimId: 301,
              participantIdentityId: 18,
              shop: { id: 11, name: "Aoyama Care" },
              technicianProfile: {
                id: 81,
                displayName: "山田 花子",
                user: {
                  identities: [
                    { displayName: "山田 花子", publicIdentifier: { publicId: "S000000081" } }
                  ]
                }
              },
              exchangeClaim: {
                claimantIdentity: {
                  displayName: "青山店",
                  publicIdentifier: { publicId: "M000000018" },
                  user: { username: "aoyama", avatarUrl: null }
                }
              },
              serviceId: 501,
              technicianServiceId: null,
              serviceNameSnapshot: "Matched service snapshot",
              serviceDurationSnapshot: 90,
              quoteAmountJpy: 15_000,
              scheduleSlotId: 91,
              estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
              estimatedEndsAt: new Date("2026-09-02T02:30:00.000Z"),
              matchedAt: at,
              bookingOrderId: null,
              bookingOrder: null
            }
          ]
        }))
      }
    } as unknown as PrismaClient);

    await expect(repository.findForViewer(41, 17)).resolves.toMatchObject({
      payload: { viewer: { canCreateBookings: true } }
    });
  });

  it("maps every formal BookingOrder status in the matching projection", async () => {
    const expectedStatuses = [
      ["PENDING", "pending"],
      ["CONFIRMED", "confirmed"],
      ["IN_SERVICE", "inService"],
      ["AWAITING_CHECKOUT", "awaitingCheckout"],
      ["AWAITING_PAYMENT_CONFIRMATION", "awaitingPaymentConfirmation"],
      ["COMPLETED", "completed"],
      ["CANCELLED", "cancelled"]
    ] as const;

    for (const [databaseStatus, expectedStatus] of expectedStatuses) {
      const repository = new ExchangeMatchingRepository({
        exchangeRequestMatching: {
          findFirst: jest.fn(async () => ({
            id: 51,
            exchangePostId: 41,
            status: ExchangeMatchingStatus.MATCHED,
            effectiveTargetProviderCount: 1,
            effectiveBudgetMaxJpy: 15_000,
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
            participants: [
              {
                exchangeClaimId: 301,
                participantIdentityId: 18,
                shop: { id: 11, name: "Aoyama Care" },
                technicianProfile: {
                  id: 81,
                  displayName: "山田 花子",
                  user: {
                    identities: [
                      { displayName: "山田 花子", publicIdentifier: { publicId: "S000000081" } }
                    ]
                  }
                },
                exchangeClaim: {
                  claimantIdentity: {
                    displayName: "青山店",
                    publicIdentifier: { publicId: "M000000018" },
                    user: { username: "aoyama", avatarUrl: null }
                  }
                },
                serviceId: 501,
                technicianServiceId: null,
                serviceNameSnapshot: "Matched service snapshot",
                serviceDurationSnapshot: 90,
                quoteAmountJpy: 15_000,
                scheduleSlotId: 91,
                estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
                estimatedEndsAt: new Date("2026-09-02T02:30:00.000Z"),
                matchedAt: at,
                bookingOrderId: 501,
                bookingOrder: { id: 501, orderNo: "ND501", status: databaseStatus }
              }
            ]
          }))
        }
      } as unknown as PrismaClient);

      await expect(repository.findForViewer(41, 17)).resolves.toMatchObject({
        payload: { participants: [{ booking: { status: expectedStatus } }] }
      });
    }
  });

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
        }),
        createMany: jest.fn(async () => {
          events.push("participant");
          return { count: 1 };
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
            serviceNameSnapshot: "Selected shop service",
            serviceDurationSnapshot: 60,
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
            serviceNameSnapshot: "Unselected shop service",
            serviceDurationSnapshot: 60,
            currency: "JPY",
            status: "active",
            estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
            estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z")
          }
        ],
        unselectedClaimIds: [302],
        selectedQuoteTotalJpy: 15_000,
        effectiveTargetProviderCountAfter: 1,
        effectiveBudgetMaxJpyAfter: 30_000,
        adjustments: [],
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
    expect(client.exchangeRequestMatching.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 30_000,
          version: 4
        })
      })
    );
    expect(client.exchangeMatchEvent.create).toHaveBeenCalledTimes(1);
    expect(client.exchangeMatchEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "SELECTIVE_MATCHED",
        sequence: 4,
        versionBefore: 3,
        versionAfter: 4,
        idempotencyKey: "matching-repository-key-0001"
      })
    });
  });

  it("persists budget and target adjustments as one linked atomic event chain", async () => {
    const createdEvents: Array<Record<string, unknown>> = [];
    const client = {
      exchangeMatchParticipant: {
        create: jest.fn(async () => ({ id: 71 })),
        createMany: jest.fn(async () => ({ count: 1 }))
      },
      exchangeClaim: { updateMany: jest.fn(async () => ({ count: 1 })) },
      exchangeRequestMatching: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn(async () => ({
          id: 51,
          exchangePostId: 41,
          status: ExchangeMatchingStatus.MATCHED,
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 31_000,
          selectedQuoteTotalJpy: 31_000,
          version: 6,
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
      exchangePost: { update: jest.fn(async () => ({ id: 41 })) },
      exchangeMatchEvent: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdEvents.push(data);
          return { id: 80 + createdEvents.length };
        })
      },
      notification: { createMany: jest.fn(async () => ({ count: 1 })) },
      auditLog: { create: jest.fn(async () => ({ id: 91 })) }
    };
    const repository = new ExchangeMatchingRepository(client as unknown as PrismaClient);

    await repository.completeSelection({
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
          quoteAmountJpy: 31_000,
          serviceNameSnapshot: "Adjusted shop service",
          serviceDurationSnapshot: 60,
          currency: "JPY",
          status: "active",
          estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
          estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z")
        }
      ],
      selectedClaimIds: [301],
      unselectedClaims: [],
      unselectedClaimIds: [],
      selectedQuoteTotalJpy: 31_000,
      effectiveTargetProviderCountAfter: 1,
      effectiveBudgetMaxJpyAfter: 31_000,
      adjustments: [
        { type: "budget_increased", before: 30_000, after: 31_000 },
        { type: "target_reduced", before: 2, after: 1 }
      ],
      versionBefore: 3,
      versionAfter: 6,
      actorUserId: 7,
      actorIdentityId: 17,
      idempotencyKey: "matching-adjustment-key-0001",
      payloadFingerprint: "b".repeat(64),
      at,
      audit: {
        actorId: 7,
        action: "exchange.matching.select",
        targetType: "exchange_request_matching",
        targetId: 51
      }
    });

    expect(client.exchangeRequestMatching.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 31_000,
          selectedQuoteTotalJpy: 31_000,
          version: 6
        })
      })
    );
    expect(createdEvents).toEqual([
      expect.objectContaining({
        type: "BUDGET_INCREASED",
        sequence: 4,
        versionBefore: 3,
        versionAfter: 4,
        idempotencyKey: null,
        payloadFingerprint: null
      }),
      expect.objectContaining({
        type: "TARGET_REDUCED",
        sequence: 5,
        versionBefore: 4,
        versionAfter: 5,
        idempotencyKey: null,
        payloadFingerprint: null
      }),
      expect.objectContaining({
        type: "SELECTIVE_MATCHED",
        sequence: 6,
        versionBefore: 5,
        versionAfter: 6,
        idempotencyKey: "matching-adjustment-key-0001",
        payloadFingerprint: "b".repeat(64)
      })
    ]);
  });

  it("locks formal service snapshots and writes them through the atomic participant createMany payload", async () => {
    const client = {
      $queryRaw: jest.fn(async () => [{ id: 301 }]),
      exchangeClaim: {
        findMany: jest.fn(async () => [
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
            scheduleSlot: {
              startsAt: new Date("2026-09-02T01:00:00.000Z"),
              endsAt: new Date("2026-09-02T02:00:00.000Z")
            },
            service: { name: "Locked formal service", durationMinutes: 60 },
            technicianService: null
          }
        ]),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      exchangeMatchParticipant: {
        create: jest.fn(async () => ({ id: 71 })),
        createMany: jest.fn(async () => ({ count: 1 }))
      },
      exchangeRequestMatching: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn(async () => null)
      },
      exchangePost: { update: jest.fn(async () => ({ id: 41 })) },
      exchangeMatchEvent: { create: jest.fn(async () => ({ id: 81 })) },
      notification: { createMany: jest.fn(async () => ({ count: 1 })) },
      auditLog: { create: jest.fn(async () => ({ id: 91 })) }
    };
    const repository = new ExchangeMatchingRepository(client as unknown as PrismaClient);

    const claims = await repository.lockActiveClaims(41);

    expect(claims).toEqual([
      expect.objectContaining({
        serviceNameSnapshot: "Locked formal service",
        serviceDurationSnapshot: 60
      })
    ]);

    await repository.completeSelection({
      matchingId: 51,
      exchangePostId: 41,
      selectedClaims: claims,
      selectedClaimIds: [301],
      unselectedClaims: [],
      unselectedClaimIds: [],
      selectedQuoteTotalJpy: 15_000,
      effectiveTargetProviderCountAfter: 1,
      effectiveBudgetMaxJpyAfter: 30_000,
      adjustments: [],
      versionBefore: 3,
      versionAfter: 4,
      actorUserId: 7,
      actorIdentityId: 17,
      idempotencyKey: "matching-snapshot-key-0001",
      payloadFingerprint: "c".repeat(64),
      at,
      audit: {
        actorId: 7,
        action: "exchange.matching.select",
        targetType: "exchange_request_matching",
        targetId: 51
      }
    });

    expect(client.exchangeMatchParticipant.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          exchangeClaimId: 301,
          serviceNameSnapshot: "Locked formal service",
          serviceDurationSnapshot: 60
        })
      ]
    });
  });
});
