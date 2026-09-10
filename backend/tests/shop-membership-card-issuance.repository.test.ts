import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardIssuanceRepository } from "../src/repositories/shop-membership-card-issuance.repository";
import type { CreateMembershipCardIssuanceRepositoryInput } from "../src/services/shop-membership-card-issuance.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const membershipPublicId = "00000000-0000-4000-8000-000000000401";
const planPublicId = "00000000-0000-4000-8000-000000000402";
const planVersionPublicId = "00000000-0000-4000-8000-000000000403";

const membership = {
  id: 31,
  publicId: membershipPublicId,
  status: "ACTIVE",
  shop: {
    id: 71,
    publicId: "00000000-0000-4000-8000-000000000471",
    shopNo: "s000000071",
    name: "青山护理店"
  },
  customerProfile: { displayName: "王小美", user: { id: 41, needoId: "u0000000041" } }
};

const plan = {
  id: 51,
  publicId: planPublicId,
  status: "ACTIVE",
  currentVersionId: 61,
  currentVersion: {
    id: 61,
    publicId: planVersionPublicId,
    version: 3,
    status: "PUBLISHED",
    name: "青山储值会员卡",
    cardType: "STORED_VALUE",
    validityMode: "FIXED_DAYS",
    validityDays: 30,
    fixedExpiryAt: null,
    minInitialPrincipalJpy: 1_000,
    maxInitialPrincipalJpy: 50_000,
    minInitialUses: null,
    maxInitialUses: null,
    platformFeeRateBps: 1_000
  }
};

const card = {
  id: 81,
  publicId: "00000000-0000-4000-8000-000000000481",
  cardNo: "NMC-00112233445566778899AABB",
  name: "青山储值会员卡",
  type: "STORED_VALUE",
  status: "ACTIVE",
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 0,
  remainingUses: null,
  totalUses: null,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "OFFLINE_PAID",
  issuanceReference: "receipt-1",
  issuanceNote: "线下付款",
  issuedAt: now,
  expiresAt: new Date("2026-09-30T03:00:00.000Z"),
  frozenAt: null,
  platformFeeRateBpsSnapshot: 1_000,
  issuanceFingerprint: "fingerprint",
  plan: { publicId: planPublicId },
  planVersion: { publicId: planVersionPublicId, version: 3 },
  membership: {
    shopId: 71,
    customerProfile: { displayName: "王小美", user: { needoId: "u0000000041" } }
  }
};

const issuanceInput: CreateMembershipCardIssuanceRepositoryInput = {
  actorId: 9,
  shopId: 71,
  membershipPublicId,
  planPublicId,
  expectedPlanVersionPublicId: planVersionPublicId,
  cardNo: card.cardNo,
  type: "stored_value" as const,
  name: card.name,
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 0,
  remainingUses: null,
  totalUses: null,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "offline_paid" as const,
  issuanceReference: "receipt-1",
  issuanceNote: "线下付款",
  platformFeeRateBpsSnapshot: 1_000,
  issuanceIdempotencyKey: "00000000-0000-4000-8000-000000000404",
  issuanceFingerprint: "fingerprint",
  issuedAt: now,
  expiresAt: card.expiresAt,
  audit: {
    actorId: 9,
    action: "merchant.shop_membership_card.issue",
    targetType: "ShopMembershipCard",
    ip: "127.0.0.1",
    metadata: { membershipPublicId, planPublicId }
  }
};

describe("ShopMembershipCardIssuanceRepository", () => {
  it("looks up semantic replay globally and includes deleted card or membership state", async () => {
    const client = {
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(card) }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);
    await expect(
      repository.findByIdempotencyKey(issuanceInput.issuanceIdempotencyKey)
    ).resolves.toMatchObject({ shopId: 71 });
    expect(client.shopMembershipCard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { issuanceIdempotencyKey: issuanceInput.issuanceIdempotencyKey }
      })
    );
    const query = (client.shopMembershipCard.findFirst as jest.Mock).mock.calls[0]![0];
    expect(JSON.stringify(query.where)).not.toContain("deletedAt");
    expect(JSON.stringify(query.where)).not.toContain("shopId");
  });
  it("loads only the current shop active membership and published current version", async () => {
    const client = {
      shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
      shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue(plan) }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(
      repository.getIssuanceContext(71, membershipPublicId, planPublicId)
    ).resolves.toMatchObject({
      kind: "ready",
      value: {
        membership: { customerUserId: 41, customerNeedoId: "u0000000041" },
        version: {
          cardType: "stored_value",
          validity: { mode: "fixed_days", days: 30 },
          platformFeeRateBps: 1_000
        }
      }
    });
    expect(client.shopCustomerMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: membershipPublicId, shopId: 71, deletedAt: null }
      })
    );
    expect(client.shopMembershipCardPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: planPublicId, shopId: 71, deletedAt: null }
      })
    );
  });

  it("rejects a published version whose persisted validity shape is incomplete", async () => {
    const client = {
      shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
      shopMembershipCardPlan: {
        findFirst: jest.fn().mockResolvedValue({
          ...plan,
          currentVersion: { ...plan.currentVersion, validityMode: "FIXED_DAYS", validityDays: null }
        })
      }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(
      repository.getIssuanceContext(71, membershipPublicId, planPublicId)
    ).resolves.toEqual({ kind: "invalid_state" });
  });

  it("creates card, exact audit, and customer notification in one transaction", async () => {
    const transaction = {
      shopMembershipCard: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(card)
      },
      shopMembershipCardStatusEvent: { create: jest.fn().mockResolvedValue({ id: 101 }) },
      shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
      shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 41 }]),
      userIdentity: {
        findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 91 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 92 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(
      repository.issueCardWithAuditAndNotification(issuanceInput)
    ).resolves.toMatchObject({
      kind: "created",
      value: { publicId: card.publicId, planVersion: 3, customerNeedoId: "u0000000041" }
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.shopMembershipCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membershipId: 31,
          planId: 51,
          planVersionId: 61,
          issuedById: 9,
          cardNo: card.cardNo,
          type: "STORED_VALUE",
          issuanceSource: "OFFLINE_PAID",
          principalBalanceJpy: 10_000,
          bonusBalanceJpy: 0,
          issuanceIdempotencyKey: issuanceInput.issuanceIdempotencyKey,
          issuanceFingerprint: "fingerprint"
        })
      })
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.shopMembershipCard.findFirst).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          issuanceSource: { in: ["OFFLINE_PAID", "ONLINE_PAID", "RENEWAL"] },
          membership: { customerProfile: { userId: 41 } }
        })
      })
    );
    expect(transaction.shopMembershipCardStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cardId: 81,
        fromStatus: null,
        toStatus: "ACTIVE",
        source: "ISSUANCE",
        occurredAt: now,
        actorUserId: 9,
        reasonCode: "card_issued",
        metadata: { issuanceSource: "offline_paid" },
        eventKey: `membership-card:${card.publicId}:issued`
      })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "merchant.shop_membership_card.issue",
        targetId: 81,
        metadata: expect.objectContaining({
          cardPublicId: card.publicId,
          membershipPublicId,
          planPublicId
        })
      })
    });
    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 41,
        recipientIdentityId: 141,
        actorUserId: 9,
        actorIdentityId: 109,
        type: "SYSTEM",
        title: "shop_membership.card_issued.title",
        body: "shop_membership.card_issued.body",
        payload: expect.objectContaining({
          cardPublicId: card.publicId,
          membershipPublicId,
          planPublicId
        })
      })
    });
  });

  it("returns the same card on a transactional replay without duplicate audit or notification", async () => {
    const transaction = {
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(card), create: jest.fn() },
      shopCustomerMembership: { findFirst: jest.fn() },
      shopMembershipCardPlan: { findFirst: jest.fn() },
      userIdentity: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(
      repository.issueCardWithAuditAndNotification(issuanceInput)
    ).resolves.toMatchObject({ kind: "replayed", value: { publicId: card.publicId } });
    expect(transaction.shopMembershipCard.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });

  it("rejects a same-key transaction replay with a different fingerprint", async () => {
    const transaction = {
      shopMembershipCard: {
        findFirst: jest.fn().mockResolvedValue({ ...card, issuanceFingerprint: "different" }),
        create: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(repository.issueCardWithAuditAndNotification(issuanceInput)).resolves.toEqual({
      kind: "idempotency_conflict"
    });
    expect(transaction.shopMembershipCard.create).not.toHaveBeenCalled();
  });

  it("rejects a same-key replay owned by another shop", async () => {
    const transaction = {
      shopMembershipCard: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ ...card, membership: { ...card.membership, shopId: 72 } }),
        create: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);
    await expect(repository.issueCardWithAuditAndNotification(issuanceInput)).resolves.toEqual({
      kind: "idempotency_conflict"
    });
    expect(transaction.shopMembershipCard.create).not.toHaveBeenCalled();
  });

  it.each([
    ["offline_paid", { id: 1 }, "invalid_state", "OFFLINE_PAID"],
    ["online_paid", { id: 1 }, "invalid_state", "ONLINE_PAID"],
    ["renewal", null, "invalid_state", "RENEWAL"],
    ["renewal", { id: 1 }, "created", "RENEWAL"],
    ["gift", null, "created", "GIFT"],
    ["trial", null, "created", "TRIAL"],
    ["historical_replacement", null, "created", "HISTORICAL_REPLACEMENT"],
    ["manual_grant", null, "created", "MANUAL_GRANT"]
  ] as const)(
    "enforces platform-global history and maps %s inside the locked transaction",
    async (source, prior, expectedKind, persistedSource) => {
      const issued = { ...card, issuanceSource: persistedSource };
      const transaction = {
        shopMembershipCard: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(prior),
          create: jest.fn().mockResolvedValue(issued)
        },
        shopMembershipCardStatusEvent: { create: jest.fn().mockResolvedValue({ id: 101 }) },
        shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
        shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 41 }]),
        userIdentity: {
          findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 })
        },
        auditLog: { create: jest.fn().mockResolvedValue({ id: 91 }) },
        notification: { create: jest.fn().mockResolvedValue({ id: 92 }) }
      };
      const client = {
        $transaction: jest.fn(async (callback) => callback(transaction))
      } as unknown as PrismaClient;
      const repository = new ShopMembershipCardIssuanceRepository(client);
      const result = await repository.issueCardWithAuditAndNotification({
        ...issuanceInput,
        issuanceSource: source
      });
      expect(result.kind).toBe(expectedKind);
      if (result.kind === "created") expect(result.value.issuanceSource).toBe(source);
      expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        transaction.shopMembershipCard.create.mock.invocationCallOrder[0] ?? Infinity
      );
      expect(transaction.shopMembershipCard.findFirst.mock.invocationCallOrder[2]).toBeLessThan(
        transaction.shopMembershipCard.create.mock.invocationCallOrder[0] ?? Infinity
      );
      const historyWhere = transaction.shopMembershipCard.findFirst.mock.calls[2]![0].where;
      expect(JSON.stringify(historyWhere)).not.toMatch(/deletedAt|status/u);
      expect(transaction.shopMembershipCard.create).toHaveBeenCalledTimes(
        expectedKind === "created" ? 1 : 0
      );
      if (expectedKind === "created")
        expect(transaction.shopMembershipCard.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ issuanceSource: persistedSource })
          })
        );
      expect(transaction.shopMembershipCardStatusEvent.create).toHaveBeenCalledTimes(
        expectedKind === "created" ? 1 : 0
      );
      expect(transaction.auditLog.create).toHaveBeenCalledTimes(expectedKind === "created" ? 1 : 0);
      expect(transaction.notification.create).toHaveBeenCalledTimes(
        expectedKind === "created" ? 1 : 0
      );
    }
  );

  it("does not apply source sequencing or acquire a user lock before exact replay", async () => {
    const transaction = {
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(card), create: jest.fn() },
      $queryRaw: jest.fn(),
      shopMembershipCardStatusEvent: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);
    await expect(
      repository.issueCardWithAuditAndNotification(issuanceInput)
    ).resolves.toMatchObject({ kind: "replayed" });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.shopMembershipCardStatusEvent.create).not.toHaveBeenCalled();
  });

  it.each(["lifecycle", "audit", "notification"] as const)(
    "rolls back every issuance write when %s persistence fails",
    async (failure) => {
      const state = {
        cards: [] as unknown[],
        events: [] as unknown[],
        audits: [] as unknown[],
        notifications: [] as unknown[]
      };
      const transaction = {
        shopMembershipCard: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(async () => {
            state.cards.push(card);
            return card;
          })
        },
        shopMembershipCardStatusEvent: {
          create: jest.fn(async (value) => {
            if (failure === "lifecycle") throw new Error("lifecycle failed");
            state.events.push(value);
            return { id: 101 };
          })
        },
        shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
        shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 41 }]),
        userIdentity: {
          findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 })
        },
        auditLog: {
          create: jest.fn(async (value) => {
            if (failure === "audit") throw new Error("audit failed");
            state.audits.push(value);
            return { id: 91 };
          })
        },
        notification: {
          create: jest.fn(async (value) => {
            if (failure === "notification") throw new Error("notification failed");
            state.notifications.push(value);
            return { id: 92 };
          })
        }
      };
      const client = {
        $transaction: jest.fn(async (callback) => {
          const snapshot = JSON.parse(JSON.stringify(state));
          try {
            return await callback(transaction);
          } catch (error) {
            Object.assign(state, snapshot);
            throw error;
          }
        })
      } as unknown as PrismaClient;
      const repository = new ShopMembershipCardIssuanceRepository(client);
      await expect(repository.issueCardWithAuditAndNotification(issuanceInput)).rejects.toThrow(
        `${failure} failed`
      );
      expect(state).toEqual({ cards: [], events: [], audits: [], notifications: [] });
    }
  );

  const runInterleavedRace = async (
    firstOverrides: Partial<CreateMembershipCardIssuanceRepositoryInput>,
    secondOverrides: Partial<CreateMembershipCardIssuanceRepositoryInput>
  ) => {
    type StoredCard = typeof card & { issuanceIdempotencyKey: string };
    type FindArgs = {
      where: { issuanceIdempotencyKey?: string; issuanceSource?: { in: string[] } };
    };
    type CardCreateArgs = {
      data: {
        issuanceIdempotencyKey: string;
        issuanceFingerprint: string;
        issuanceSource: string;
      };
    };
    type ShopContextArgs = { where: { shopId: number } };
    const state = {
      cards: [] as StoredCard[],
      events: [] as unknown[],
      audits: [] as unknown[],
      notifications: [] as unknown[]
    };
    const transactionOptions: Array<{ isolationLevel?: string } | undefined> = [];
    let lockArrivals = 0;
    let openLockBarrier!: () => void;
    const lockBarrier = new Promise<void>((resolve) => {
      openLockBarrier = resolve;
    });
    let lockTail = Promise.resolve();

    const client = {
      $transaction: jest.fn(
        async (
          callback: (transaction: unknown) => Promise<unknown>,
          options?: { isolationLevel?: string }
        ) => {
          transactionOptions.push(options);
          const snapshot = [...state.cards];
          const staged = {
            cards: [] as StoredCard[],
            events: [] as unknown[],
            audits: [] as unknown[],
            notifications: [] as unknown[]
          };
          let currentShopId = 0;
          const lockRelease: { current: (() => void) | null } = { current: null };
          const visibleCards = () =>
            options?.isolationLevel === "ReadCommitted" ? state.cards : snapshot;
          const transaction = {
            shopMembershipCard: {
              findFirst: jest.fn(async (args: FindArgs) => {
                const visible = visibleCards();
                if (args.where.issuanceIdempotencyKey) {
                  return (
                    visible.find(
                      (item) => item.issuanceIdempotencyKey === args.where.issuanceIdempotencyKey
                    ) ?? null
                  );
                }
                return (
                  visible.find((item) =>
                    args.where.issuanceSource?.in.includes(item.issuanceSource)
                  ) ?? null
                );
              }),
              create: jest.fn(async (args: CardCreateArgs) => {
                const sequence = state.cards.length + staged.cards.length + 1;
                const created = {
                  ...card,
                  id: 80 + sequence,
                  publicId: `00000000-0000-4000-8000-00000000048${sequence}`,
                  issuanceIdempotencyKey: args.data.issuanceIdempotencyKey,
                  issuanceFingerprint: args.data.issuanceFingerprint,
                  issuanceSource: args.data.issuanceSource,
                  membership: { ...card.membership, shopId: currentShopId }
                } as StoredCard;
                staged.cards.push(created);
                return created;
              })
            },
            shopMembershipCardStatusEvent: {
              create: jest.fn(async (value: unknown) => {
                staged.events.push(value);
                return { id: 101 };
              })
            },
            shopCustomerMembership: {
              findFirst: jest.fn(async (args: ShopContextArgs) => {
                currentShopId = args.where.shopId;
                return {
                  ...membership,
                  id: 30 + currentShopId,
                  shop: { ...membership.shop, id: currentShopId }
                };
              })
            },
            shopMembershipCardPlan: { findFirst: jest.fn(async () => plan) },
            $queryRaw: jest.fn(async () => {
              lockArrivals += 1;
              if (lockArrivals === 2) openLockBarrier();
              await lockBarrier;
              let unlock!: () => void;
              const previous = lockTail;
              lockTail = new Promise<void>((resolve) => {
                unlock = resolve;
              });
              await previous;
              lockRelease.current = unlock;
              return [{ id: 41 }];
            }),
            userIdentity: {
              findFirst: jest
                .fn()
                .mockResolvedValueOnce({ id: 141 })
                .mockResolvedValueOnce({ id: 109 })
            },
            auditLog: {
              create: jest.fn(async (value: unknown) => {
                staged.audits.push(value);
                return { id: 91 };
              })
            },
            notification: {
              create: jest.fn(async (value: unknown) => {
                staged.notifications.push(value);
                return { id: 92 };
              })
            }
          };
          try {
            const result = await callback(transaction);
            state.cards.push(...staged.cards);
            state.events.push(...staged.events);
            state.audits.push(...staged.audits);
            state.notifications.push(...staged.notifications);
            return result;
          } finally {
            lockRelease.current?.();
          }
        }
      )
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);
    const race = Promise.all([
      repository.issueCardWithAuditAndNotification({ ...issuanceInput, ...firstOverrides }),
      repository.issueCardWithAuditAndNotification({ ...issuanceInput, ...secondOverrides })
    ]);
    const results = await Promise.race([
      race,
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("concurrency harness deadlocked")), 1_000)
      )
    ]);
    return { results, state, transactionOptions, lockArrivals };
  };

  it("uses current-visible post-lock reads so cross-shop different-key first-paid commands have one winner", async () => {
    const race = await runInterleavedRace(
      { shopId: 71, issuanceIdempotencyKey: "first-key", issuanceFingerprint: "first" },
      {
        shopId: 72,
        issuanceIdempotencyKey: "second-key",
        issuanceFingerprint: "second",
        issuanceSource: "online_paid"
      }
    );
    expect(race.lockArrivals).toBe(2);
    expect(race.transactionOptions).toEqual([
      { isolationLevel: "ReadCommitted" },
      { isolationLevel: "ReadCommitted" }
    ]);
    expect(race.results.map((result) => result.kind).sort()).toEqual(["created", "invalid_state"]);
    expect(race.state.cards).toHaveLength(1);
    expect(race.state.events).toHaveLength(1);
    expect(race.state.audits).toHaveLength(1);
    expect(race.state.notifications).toHaveLength(1);
  });

  it("replays the winner when two interleaved transactions use the same semantic command", async () => {
    const race = await runInterleavedRace({}, {});
    expect(race.results.map((result) => result.kind).sort()).toEqual(["created", "replayed"]);
    expect(race.state.cards).toHaveLength(1);
    expect(race.state.events).toHaveLength(1);
    expect(race.state.audits).toHaveLength(1);
    expect(race.state.notifications).toHaveLength(1);
  });

  it.each([
    ["changed fingerprint", { issuanceFingerprint: "changed" }],
    ["changed shop scope", { shopId: 72 }]
  ] as const)("conflicts after the lock for same-key %s", async (_label, changed) => {
    const race = await runInterleavedRace({}, changed);
    expect(race.results.map((result) => result.kind).sort()).toEqual([
      "created",
      "idempotency_conflict"
    ]);
    expect(race.state.cards).toHaveLength(1);
    expect(race.state.events).toHaveLength(1);
    expect(race.state.audits).toHaveLength(1);
    expect(race.state.notifications).toHaveLength(1);
  });
});
