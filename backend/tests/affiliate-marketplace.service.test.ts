import { ERROR_CODES } from "../src/constants/error-codes";
import { AffiliateLinkTokenService } from "../src/services/affiliate-link-token.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  AffiliateMarketplaceService,
  type AffiliateClaimPersistenceInput,
  type AffiliateClaimRecord,
  type AffiliateClaimUniqueConflict,
  type AffiliateMarketplaceRepositoryPort,
  type AffiliateMarketplaceTaskRecord,
  type AffiliateMarketplaceTransactionClient
} from "../src/services/affiliate-marketplace.service";
import { buildPaginatedResponse, type PaginatedResponse } from "../src/utils/pagination";

const now = new Date("2026-09-05T00:00:00.000Z");
const actor: AuthenticatedAccessContext = {
  userId: 33,
  email: "claimant@example.test",
  accessTokenJti: "claimant-access",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 4,
  currentIdentityType: "customer",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["customer"],
  permissions: ["page:affiliate-marketplace", "button:affiliate-claim"]
};

const task = (
  overrides: Partial<AffiliateMarketplaceTaskRecord> = {}
): AffiliateMarketplaceTaskRecord => ({
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  lineageKey: "AFF-PUBLIC-22",
  version: 1,
  lockVersion: 3,
  publisherType: "merchant_account",
  publisherMerchantAccountId: 91,
  publisherShopId: null,
  translations: {
    "zh-CN": {
      name: "涩谷服务完成奖励",
      description: "完成服务后获得奖励。",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    "zh-TW": {
      name: "澀谷服務完成獎勵",
      description: "完成服務後獲得獎勵。",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    en: {
      name: "Shibuya completed-service reward",
      description: "Earn after the referred service is completed.",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    ja: {
      name: "渋谷サービス完了報酬",
      description: "紹介したサービスの完了後に報酬を獲得できます。",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    ko: {
      name: "시부야 서비스 완료 보상",
      description: "소개한 서비스 완료 후 보상을 받습니다.",
      sourceLocale: "ja",
      isInitialCopy: false
    }
  },
  name: "Shibuya completed-service reward",
  description: "Earn after the referred service is completed.",
  coverMediaAssetId: null,
  coverImageUrl: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  reservedBudgetNdp: 2_000_000,
  allocatedBudgetNdp: 10_000,
  settledBudgetNdp: 5_000,
  releasedBudgetNdp: 0,
  platformFeeRuleId: null,
  platformFeeBps: 0,
  platformFeeReserveNdp: 0,
  settledPlatformFeeNdp: 0,
  releasedPlatformFeeNdp: 0,
  customerDiscountType: "fixed_jpy",
  fixedDiscountJpy: 500,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 5_000,
  claimStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  claimEndsAt: new Date("2026-09-20T00:00:00.000Z"),
  taskStartsAt: new Date("2026-09-10T00:00:00.000Z"),
  taskEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: 1,
  serviceScopeMode: "selected_services",
  status: "scheduled",
  reviewedById: 99,
  reviewedAt: new Date("2026-08-30T00:00:00.000Z"),
  rejectionReason: null,
  submittedAt: new Date("2026-08-29T00:00:00.000Z"),
  activatedAt: null,
  createdAt: new Date("2026-08-28T00:00:00.000Z"),
  updatedAt: new Date("2026-08-30T00:00:00.000Z"),
  shops: [
    {
      id: 1,
      shopId: 11,
      shopNameSnapshot: "Shibuya Relax",
      publicId: "shop0000000011",
      city: "Tokyo",
      address: "Shibuya 1-1",
      mediaAssets: []
    }
  ],
  services: [
    {
      id: 2,
      shopId: 11,
      serviceId: 101,
      serviceNameSnapshot: "Aroma 60",
      servicePriceJpySnapshot: 8_000
    }
  ],
  budgetReservation: {
    id: 3,
    taskId: 22,
    walletId: 501,
    totalFrozenNdp: 2_000_000,
    commissionFrozenNdp: 2_000_000,
    platformFeeFrozenNdp: 0,
    allocatedNdp: 10_000,
    capturedNdp: 5_000,
    platformFeeCapturedNdp: 0,
    releasedNdp: 0,
    platformFeeReleasedNdp: 0,
    status: "active",
    idempotencyKey: "affiliate-task:22:freeze",
    frozenAt: new Date("2026-08-29T00:00:00.000Z"),
    releasedAt: null
  },
  ...overrides
});

class InMemoryAffiliateMarketplaceRepository implements AffiliateMarketplaceRepositoryPort {
  public tasks = new Map<number, AffiliateMarketplaceTaskRecord>([[22, task()]]);
  public claims = new Map<number, AffiliateClaimRecord>();
  public auditRows: Array<{
    actorUserId: number;
    claimId: number;
    taskId: number;
    publicCode: string;
  }> = [];
  public uniqueConflicts: AffiliateClaimUniqueConflict[] = [];
  public listInputs: unknown[] = [];
  public claimable = true;
  public hideClaimsInsideTransaction = false;
  private insideTransaction = false;
  private nextClaimId = 1;

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateMarketplaceRepositoryPort,
      transactionClient?: AffiliateMarketplaceTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    this.insideTransaction = true;
    try {
      return await handler(this, { marketplaceTransaction: true });
    } finally {
      this.insideTransaction = false;
    }
  }

  public async listClaimableTasks(input: {
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<AffiliateMarketplaceTaskRecord>> {
    this.listInputs.push(input);
    const list = this.claimable ? [...this.tasks.values()] : [];
    return buildPaginatedResponse(list, list.length, input);
  }

  public async findClaimableTaskById(
    taskId: number
  ): Promise<AffiliateMarketplaceTaskRecord | null> {
    return this.claimable ? (this.tasks.get(taskId) ?? null) : null;
  }

  public async findTaskById(taskId: number): Promise<AffiliateMarketplaceTaskRecord | null> {
    return this.tasks.get(taskId) ?? null;
  }

  public async lockClaimableTaskForShare(
    taskId: number
  ): Promise<AffiliateMarketplaceTaskRecord | null> {
    return this.findClaimableTaskById(taskId);
  }

  public async findClaimByTaskAndUser(
    taskId: number,
    userId: number
  ): Promise<AffiliateClaimRecord | null> {
    if (this.insideTransaction && this.hideClaimsInsideTransaction) {
      return null;
    }
    return (
      [...this.claims.values()].find(
        (claim) => claim.taskId === taskId && claim.userId === userId
      ) ?? null
    );
  }

  public async createClaim(input: AffiliateClaimPersistenceInput): Promise<AffiliateClaimRecord> {
    const conflict = this.uniqueConflicts.shift();
    if (conflict) {
      throw conflict;
    }
    const created: AffiliateClaimRecord = {
      id: this.nextClaimId++,
      ...input,
      status: "active",
      claimedAt: now,
      clickCount: 0,
      codeUseCount: 0,
      attributedOrderCount: 0,
      completedOrderCount: 0,
      settledRewardNdp: 0,
      createdAt: now,
      updatedAt: now,
      task: this.tasks.get(input.taskId) ?? task()
    };
    this.claims.set(created.id, created);
    return created;
  }

  public classifyClaimUniqueConflict(error: unknown): AffiliateClaimUniqueConflict | null {
    return error instanceof Error && "field" in error
      ? (error as AffiliateClaimUniqueConflict)
      : null;
  }

  public async listClaimsByUser(input: {
    userId: number;
    status?: "active" | "expired" | "revoked";
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<AffiliateClaimRecord>> {
    const list = [...this.claims.values()].filter(
      (claim) => claim.userId === input.userId && (!input.status || claim.status === input.status)
    );
    return buildPaginatedResponse(list, list.length, input);
  }

  public async findClaimByIdAndUser(
    claimId: number,
    userId: number
  ): Promise<AffiliateClaimRecord | null> {
    const claim = this.claims.get(claimId);
    return claim?.userId === userId ? claim : null;
  }

  public async findClaimByPublicTokenId(
    publicTokenId: string
  ): Promise<AffiliateClaimRecord | null> {
    return [...this.claims.values()].find((claim) => claim.publicTokenId === publicTokenId) ?? null;
  }

  public async createClaimAuditLog(input: {
    actorUserId: number;
    claimId: number;
    taskId: number;
    publicCode: string;
  }): Promise<void> {
    this.auditRows.push(input);
  }
}

const createService = (
  repository = new InMemoryAffiliateMarketplaceRepository()
): {
  service: AffiliateMarketplaceService;
  repository: InMemoryAffiliateMarketplaceRepository;
} => ({
  service: new AffiliateMarketplaceService(
    repository,
    new AffiliateLinkTokenService({
      secret: "test-affiliate-link-secret-with-at-least-32-chars",
      publicBaseUrl: "https://app.needo.test/afirieito",
      createPublicTokenId: () => "ABCDEFGHIJKLMNOPQRSTUVWX"
    }),
    {
      now: () => now,
      createPublicCode: () => "NDO-7K4M9X2P8Q"
    }
  ),
  repository
});

describe("AffiliateMarketplaceService", () => {
  it("returns only the public marketplace view and normalizes pagination", async () => {
    const { service, repository } = createService();
    const presentableTask = {
      ...task({
        totalBudgetNdp: 10_000,
        budgetReservation: {
          ...task().budgetReservation!,
          totalFrozenNdp: 10_000,
          commissionFrozenNdp: 10_000,
          allocatedNdp: 2_000,
          capturedNdp: 1_000,
          releasedNdp: 0
        }
      }),
      coverImageUrl: "https://cdn.needo.test/task-cover.jpg",
      shops: [
        {
          id: 1,
          shopId: 11,
          shopNameSnapshot: "Shibuya Relax",
          publicId: "shop0000000011",
          city: "Tokyo",
          address: "Shibuya 1-1",
          mediaAssets: [
            {
              url: "https://cdn.needo.test/shop-cover.jpg",
              altText: "Shibuya Relax",
              sortOrder: 0
            }
          ]
        }
      ]
    };
    repository.tasks.set(22, presentableTask);

    const result = await service.listTasks(actor, { page: 0, pageSize: 999 });

    expect(result).toEqual({
      list: [
        expect.objectContaining({
          id: 22,
          name: "Shibuya completed-service reward",
          translations: expect.objectContaining({
            ja: expect.objectContaining({ name: "渋谷サービス完了報酬" })
          }),
          rewardNdpPerCompletedOrder: 1_000,
          totalBudgetNdp: 10_000,
          remainingBudgetNdp: 7_000,
          remainingBudgetBps: 7_000,
          coverImageUrl: "https://cdn.needo.test/task-cover.jpg",
          claimable: true,
          shops: [
            expect.objectContaining({
              publicId: "shop0000000011",
              city: "Tokyo",
              address: "Shibuya 1-1",
              mediaAssets: [
                {
                  url: "https://cdn.needo.test/shop-cover.jpg",
                  altText: "Shibuya Relax",
                  sortOrder: 0
                }
              ]
            })
          ]
        })
      ],
      total: 1,
      page: 1,
      page_size: 100
    });
    expect(repository.listInputs).toEqual([
      expect.objectContaining({ page: 1, pageSize: 100, now })
    ]);
    expect(result.list[0]).not.toHaveProperty("publisherMerchantAccountId");
    expect(result.list[0]).not.toHaveProperty("publisherShopId");
    expect(result.list[0]).not.toHaveProperty("budgetReservation");
    expect(result.list[0]).not.toHaveProperty("reservedBudgetNdp");
    expect(result.list[0]).not.toHaveProperty("reviewedById");
  });

  it("creates one claim with a stable code, URL, expiry, and token-free audit row", async () => {
    const { service, repository } = createService();

    const result = await service.claimTask(actor, 22);

    expect(result.created).toBe(true);
    expect(result.claim).toEqual(
      expect.objectContaining({
        id: 1,
        taskId: 22,
        publicCode: "NDO-7K4M9X2P8Q",
        promotionUrl: expect.stringContaining("/afirieito/r/"),
        status: "active",
        expiresAt: task().taskEndsAt
      })
    );
    expect(result.claim).not.toHaveProperty("activeKey");
    expect(result.claim).not.toHaveProperty("tokenHash");
    expect(result.claim).not.toHaveProperty("userId");
    expect(repository.auditRows).toEqual([
      {
        actorUserId: actor.userId,
        claimId: 1,
        taskId: 22,
        publicCode: "NDO-7K4M9X2P8Q"
      }
    ]);
    expect(JSON.stringify(repository.auditRows)).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWX");
  });

  it("returns the original claim for duplicate requests even after task claiming closes", async () => {
    const { service, repository } = createService();
    const first = await service.claimTask(actor, 22);
    repository.claimable = false;

    const duplicate = await service.claimTask(actor, 22);

    expect(duplicate.created).toBe(false);
    expect(duplicate.claim).toEqual(first.claim);
    expect(repository.claims.size).toBe(1);
    expect(repository.auditRows).toHaveLength(1);
  });

  it("distinguishes a missing task from a task that cannot accept a new claim", async () => {
    const missing = createService();
    missing.repository.tasks.clear();
    await expect(missing.service.claimTask(actor, 22)).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_TASK_NOT_FOUND,
      statusCode: 404
    });

    const closed = createService();
    closed.repository.claimable = false;
    await expect(closed.service.claimTask(actor, 22)).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_TASK_INVALID_STATE,
      statusCode: 409,
      message: "error.affiliate.task_not_claimable"
    });
  });

  it("recovers the same claim when concurrent creation hits the active-key unique index", async () => {
    const { service, repository } = createService();
    const concurrentClaim = await repository.createClaim({
      taskId: 22,
      userId: actor.userId,
      activeKey: `22:${actor.userId}`,
      publicCode: "NDO-CONCURRENT1",
      publicTokenId: "ZYXWVUTSRQPONMLKJIHGFEDC",
      tokenHash: "a".repeat(64),
      expiresAt: task().taskEndsAt
    });
    repository.claims.clear();
    repository.hideClaimsInsideTransaction = true;
    repository.uniqueConflicts.push(
      ...Array.from({ length: 5 }, () =>
        Object.assign(new Error("active key conflict"), {
          field: "active_key" as const
        })
      )
    );
    const originalCreateClaim = repository.createClaim.bind(repository);
    repository.createClaim = async (input) => {
      repository.claims.set(concurrentClaim.id, concurrentClaim);
      return originalCreateClaim(input);
    };

    const result = await service.claimTask(actor, 22);

    expect(result.created).toBe(false);
    expect(result.claim.publicCode).toBe("NDO-CONCURRENT1");
    expect(repository.auditRows).toHaveLength(0);
  });

  it("lists and reads only the current user's claims", async () => {
    const { service } = createService();
    const created = await service.claimTask(actor, 22);

    expect(await service.listMyClaims(actor, { page: 1, pageSize: 20 })).toEqual({
      list: [created.claim],
      total: 1,
      page: 1,
      page_size: 20
    });
    expect(await service.getMyClaim(actor, created.claim.id)).toEqual(created.claim);

    await expect(
      service.getMyClaim({ ...actor, userId: actor.userId + 1 }, created.claim.id)
    ).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_CLAIM_NOT_FOUND,
      statusCode: 404
    });
  });

  it("keeps an ended task visible in claim history without marking it usable", async () => {
    const { service, repository } = createService();
    const created = await service.claimTask(actor, 22);
    const storedClaim = repository.claims.get(created.claim.id);
    if (!storedClaim) {
      throw new Error("expected the claim fixture to exist");
    }
    storedClaim.task = task({ status: "ended" });

    const mine = await service.getMyClaim(actor, created.claim.id);

    expect(mine.task).toMatchObject({ status: "ended", claimable: false });
  });

  it("resolves a valid signed link without exposing claimant identity", async () => {
    const { service } = createService();
    const created = await service.claimTask(actor, 22);
    const publicToken = created.claim.promotionUrl.split("/r/")[1];

    const result = await service.resolveLink(publicToken);

    expect(result).toEqual(
      expect.objectContaining({
        claimId: created.claim.id,
        task: expect.objectContaining({ id: 22, claimable: true })
      })
    );
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("tokenHash");
  });

  it("rejects tampered, expired, and revoked promotion links with the same error", async () => {
    const { service, repository } = createService();
    const created = await service.claimTask(actor, 22);
    const publicToken = created.claim.promotionUrl.split("/r/")[1];
    const claim = [...repository.claims.values()][0];

    await expect(service.resolveLink(`${publicToken}x`)).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_LINK_INVALID,
      statusCode: 404
    });

    claim.expiresAt = new Date("2026-09-01T00:00:00.000Z");
    await expect(service.resolveLink(publicToken)).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_LINK_INVALID,
      statusCode: 404
    });

    claim.expiresAt = task().taskEndsAt;
    claim.status = "revoked";
    await expect(service.resolveLink(publicToken)).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_LINK_INVALID,
      statusCode: 404
    });
  });
});
