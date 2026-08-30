import { ExchangeService } from "../src/services/exchange.service";
import type { ExchangeActorRecord, ExchangeRepositoryPort } from "../src/services/exchange.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type {
  ExchangeCommentPayload,
  ExchangeInteractionCounts,
  ExchangePostPayload
} from "../src/types/exchange.types";

const now = new Date("2026-08-30T03:00:00.000Z");

const access: AuthenticatedAccessContext = {
  userId: 7,
  email: "customer@example.test",
  accessTokenJti: "jti-7",
  accessTokenExpiresAt: 2_000_000_000,
  currentIdentityId: 17,
  currentPublicId: "NC12345678",
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 27,
  roles: ["customer"],
  permissions: []
};

const actor: ExchangeActorRecord = {
  userId: 7,
  identityId: 17,
  identityType: "customer",
  scopeType: "customer_profile",
  scopeId: 27,
  publicId: "NC12345678",
  displayName: "佐藤 美咲",
  avatarUrl: null,
  isTestAccount: true,
  customerMembership: {
    profileId: 27,
    membershipLevel: "standard",
    membershipGrantMode: "SELF_SERVICE",
    membershipStartsAt: null,
    membershipExpiresAt: null
  },
  shopScope: null
};

const post: ExchangePostPayload = {
  id: 41,
  type: "demand",
  status: "published",
  title: "渋谷でヘアセットをお願いしたい",
  detail: "イベント前にお願いします。",
  contentLocale: "ja",
  areaLabel: "渋谷区",
  serviceStartAt: "2026-08-31T00:00:00.000Z",
  serviceEndAt: "2026-08-31T01:00:00.000Z",
  expiresAt: "2026-08-31T08:30:00.000Z",
  publishedAt: "2026-08-30T02:00:00.000Z",
  publisher: {
    publicId: actor.publicId,
    identityType: actor.identityType,
    displayName: actor.displayName,
    avatarUrl: actor.avatarUrl
  },
  counts: { comments: 0, likes: 0, shares: 0 },
  viewer: { liked: false, canWithdraw: true },
  demand: {
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: 8_000,
    budgetMaxJpy: 12_000,
    address: {
      line1: "渋谷区",
      line2: "道玄坂1-2-3",
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "owner"
    }
  },
  intelligence: null
};

const comment: ExchangeCommentPayload = {
  id: 301,
  postId: 41,
  author: post.publisher!,
  content: "詳細を教えてください。",
  createdAt: now.toISOString()
};

const counts: ExchangeInteractionCounts = { comments: 4, likes: 21, shares: 5 };

const demandInput = {
  type: "demand" as const,
  title: post.title,
  detail: post.detail,
  contentLocale: "ja" as const,
  serviceStartAt: new Date(post.serviceStartAt),
  serviceEndAt: new Date(post.serviceEndAt),
  expiresAt: new Date(post.expiresAt),
  targetProviderCount: 1,
  matchMode: "quick" as const,
  budgetMode: "total" as const,
  budgetMinJpy: 8_000,
  budgetMaxJpy: 12_000,
  addressLine1: post.areaLabel,
  addressLine2: "道玄坂1-2-3",
  addressLine3: null,
  addressLine2Public: false,
  addressLine3Public: false,
  publisherIdentityPublic: false
};

const createFeeService = () => ({
  resolveCurrent: jest.fn(async () => ({
    ruleSetId: 11,
    ruleSetVersion: 3,
    ruleId: 13,
    amountNdp: 1_000,
    effectiveFrom: null,
    effectiveTo: null
  }))
});

const createRepository = () =>
  ({
    resolveActor: jest.fn(async () => actor),
    listPosts: jest.fn(async () => ({ list: [post], total: 1, page: 1, page_size: 20 })),
    findPostById: jest.fn(async () => post),
    listComments: jest.fn(async () => ({
      list: [comment],
      total: 1,
      page: 1,
      page_size: 20
    })),
    publishPost: jest.fn(async () => ({ kind: "success" as const, value: post })),
    withdrawPost: jest.fn(async () => ({
      kind: "success" as const,
      value: { ...post, status: "withdrawn" as const }
    })),
    createComment: jest.fn(async () => ({ kind: "success" as const, value: comment })),
    setLike: jest.fn(async () => ({ kind: "success" as const, value: counts })),
    recordShare: jest.fn(async () => ({ kind: "success" as const, value: counts })),
    expireDue: jest.fn(async () => 0)
  }) as unknown as jest.Mocked<ExchangeRepositoryPort>;

describe("ExchangeService", () => {
  it("resolves and verifies the active identity for every request", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now);

    await service.listPosts(access, { type: "intelligence", page: 1, pageSize: 20 });

    expect(repository.resolveActor).toHaveBeenCalledWith({
      userId: 7,
      identityId: 17,
      identityType: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      publicId: "NC12345678"
    });

    repository.resolveActor.mockResolvedValueOnce(null);
    await expect(service.getPost(access, 41)).rejects.toMatchObject({
      message: "error.identity.forbidden",
      statusCode: 403
    });
  });

  it.each([
    ["standard", 1],
    ["silver", 2],
    ["gold", 3],
    ["black", 20]
  ] as const)("caps %s at %i providers", async (membershipLevel, maximum) => {
    const repository = createRepository();
    repository.resolveActor.mockResolvedValue({
      ...actor,
      customerMembership: { ...actor.customerMembership!, membershipLevel }
    });
    const feeService = createFeeService();
    const service = new ExchangeService(repository, () => now, undefined, feeService);

    await expect(service.getRequestPublicationContext(access)).resolves.toEqual({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel,
      maxTargetProviderCount: maximum,
      publicationFee: {
        amountNdp: 1_000,
        currency: "TEST_NDP",
        ruleSetVersion: 3
      }
    });
    expect(feeService.resolveCurrent).toHaveBeenCalledWith(now);
  });

  it("uses the active shop scope for a merchant's 20-provider capacity", async () => {
    const repository = createRepository();
    repository.resolveActor.mockResolvedValue({
      ...actor,
      identityType: "merchant_owner",
      scopeType: "shop",
      scopeId: 81,
      isTestAccount: false,
      customerMembership: null,
      shopScope: { shopId: 81, status: "published" }
    });
    const feeService = createFeeService();
    const service = new ExchangeService(repository, () => now, undefined, feeService);

    await expect(
      service.getRequestPublicationContext({
        ...access,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 81
      })
    ).resolves.toEqual({
      canPublish: true,
      capacitySource: "shop_merchant",
      membershipLevel: null,
      maxTargetProviderCount: 20,
      publicationFee: { amountNdp: 1_000, currency: "NDP", ruleSetVersion: 3 }
    });
  });

  it("fails closed for unknown membership and mismatched merchant scope authority", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now, undefined, createFeeService());

    repository.resolveActor.mockResolvedValueOnce({
      ...actor,
      customerMembership: { ...actor.customerMembership!, membershipLevel: "platinum" }
    });
    await expect(service.getRequestPublicationContext(access)).rejects.toMatchObject({
      message: "error.identity.forbidden",
      statusCode: 403
    });

    repository.resolveActor.mockResolvedValueOnce({
      ...actor,
      identityType: "merchant_owner",
      scopeType: "shop",
      scopeId: 81,
      customerMembership: null,
      shopScope: { shopId: 82, status: "published" }
    });
    await expect(
      service.getRequestPublicationContext({
        ...access,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 81
      })
    ).rejects.toMatchObject({ message: "error.identity.forbidden", statusCode: 403 });
  });

  it("lists only the current user's own demand while keeping the supply-side demand feed", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now);

    await expect(
      service.listPosts(access, { type: "demand", page: 1, pageSize: 20 })
    ).resolves.toEqual(expect.objectContaining({ total: 1 }));
    expect(repository.listPosts).toHaveBeenLastCalledWith({
      type: "demand",
      page: 1,
      pageSize: 20,
      viewerIdentityId: 17,
      authorIdentityId: 17,
      now
    });

    repository.resolveActor.mockResolvedValueOnce({ ...actor, identityType: "merchant_owner" });
    await expect(
      service.listPosts(
        { ...access, currentIdentityType: "merchant_owner" },
        { type: "demand", page: 1, pageSize: 20 }
      )
    ).resolves.toEqual(expect.objectContaining({ total: 1 }));
    expect(repository.listPosts).toHaveBeenLastCalledWith({
      type: "demand",
      page: 1,
      pageSize: 20,
      viewerIdentityId: 17,
      now
    });

    repository.findPostById.mockResolvedValueOnce({
      ...post,
      viewer: { liked: false, canWithdraw: false }
    });
    await expect(service.getPost(access, 41)).rejects.toMatchObject({
      message: "error.exchange.post_not_found",
      statusCode: 404
    });

    repository.findPostById.mockResolvedValueOnce(post);
    await expect(service.getPost(access, 41)).resolves.toEqual(post);
  });

  it("returns not found before exposing or mutating another customer's demand interactions", async () => {
    const repository = createRepository();
    repository.findPostById.mockResolvedValue({
      ...post,
      viewer: { liked: false, canWithdraw: false }
    });
    const service = new ExchangeService(repository, () => now);

    const attempts = [
      () => service.listComments(access, 41, { page: 1, pageSize: 20 }),
      () => service.comment(access, 41, { content: "private" }, "comment-key-00001"),
      () => service.like(access, 41, "like-key-00000001"),
      () => service.unlike(access, 41, "unlike-key-000001"),
      () => service.share(access, 41, "share-key-0000001")
    ];

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({
        message: "error.exchange.post_not_found",
        statusCode: 404
      });
    }
    expect(repository.listComments).not.toHaveBeenCalled();
    expect(repository.createComment).not.toHaveBeenCalled();
    expect(repository.setLike).not.toHaveBeenCalled();
    expect(repository.recordShare).not.toHaveBeenCalled();
  });

  it("allows customers to publish demand and rejects forged intelligence fields", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now);

    await expect(service.publish(access, demandInput, "publish-demand-0001")).resolves.toEqual(
      post
    );
    expect(repository.publishPost).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        input: demandInput,
        idempotencyKey: "publish-demand-0001",
        now,
        audit: expect.objectContaining({
          actorId: 7,
          action: "exchange.post.publish",
          targetType: "ExchangePost"
        })
      })
    );

    await expect(
      service.publish(
        access,
        {
          ...demandInput,
          type: "intelligence",
          areaLabel: "渋谷区",
          serviceMode: "store",
          addressLabel: "渋谷区",
          serviceAreas: ["渋谷区"],
          originalPriceJpy: 15_000,
          campaignPriceJpy: 10_000
        },
        "forged-publish-001"
      )
    ).rejects.toMatchObject({ message: "error.identity.forbidden", statusCode: 403 });
    expect(repository.publishPost).toHaveBeenCalledTimes(1);
  });

  it("rejects a Request target above the publisher's effective membership limit", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now);

    await expect(
      service.publish(access, { ...demandInput, targetProviderCount: 2 }, "publish-over-cap-01")
    ).rejects.toMatchObject({
      message: "error.exchange.request_target_limit",
      statusCode: 409
    });
    expect(repository.publishPost).not.toHaveBeenCalled();
  });

  it("shares demand ownership between customer and affiliate while preserving the publisher identity", async () => {
    const repository = createRepository();
    const affiliateActor = {
      ...actor,
      identityId: 18,
      identityType: "scout",
      scopeType: "global",
      scopeId: null,
      publicId: "NA12345678"
    };
    repository.resolveActor.mockResolvedValue(affiliateActor);
    const scopeResolver = {
      resolve: jest.fn(async () => ({
        identityId: 17,
        userId: 7,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 27
      }))
    };
    const service = new ExchangeService(repository, () => now, scopeResolver);
    const affiliateAccess = {
      ...access,
      currentIdentityId: 18,
      currentIdentityType: "scout",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null,
      currentPublicId: "NA12345678"
    };

    await service.publish(affiliateAccess, demandInput, "affiliate-demand-001");
    await service.listPosts(affiliateAccess, { type: "demand", page: 1, pageSize: 20 });

    expect(repository.publishPost).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          identityId: 18,
          identityType: "scout",
          ownerIdentityId: 17
        })
      })
    );
    expect(repository.listPosts).toHaveBeenCalledWith({
      type: "demand",
      page: 1,
      pageSize: 20,
      viewerIdentityId: 17,
      authorIdentityId: 17,
      now
    });
  });

  it.each(["technician", "merchant", "merchant_owner", "merchant_staff"])(
    "allows a %s identity to publish intelligence",
    async (identityType) => {
      const repository = createRepository();
      repository.resolveActor.mockResolvedValueOnce({ ...actor, identityType });
      repository.publishPost.mockResolvedValueOnce({
        kind: "success",
        value: { ...post, type: "intelligence", demand: null }
      });
      const service = new ExchangeService(repository, () => now);

      await expect(
        service.publish(
          { ...access, currentIdentityType: identityType },
          {
            ...demandInput,
            type: "intelligence",
            areaLabel: "渋谷区",
            serviceMode: "onsite",
            addressLabel: null,
            serviceAreas: ["渋谷区"],
            originalPriceJpy: null,
            campaignPriceJpy: 10_000
          },
          `publish-${identityType}-0001`
        )
      ).resolves.toEqual(expect.objectContaining({ type: "intelligence" }));
    }
  );

  it("passes idempotency keys and transactional audits to comment, share, and withdrawal", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now);

    await expect(
      service.comment(access, 41, { content: comment.content }, "comment-key-00001")
    ).resolves.toEqual(comment);
    await expect(service.share(access, 41, "share-key-0000001")).resolves.toEqual(counts);
    await expect(service.withdraw(access, 41, "withdraw-key-0001")).resolves.toEqual(
      expect.objectContaining({ status: "withdrawn" })
    );

    for (const call of [
      repository.createComment.mock.calls[0]?.[0],
      repository.recordShare.mock.calls[0]?.[0],
      repository.withdrawPost.mock.calls[0]?.[0]
    ]) {
      expect(call).toEqual(
        expect.objectContaining({
          actor,
          idempotencyKey: expect.any(String),
          audit: expect.objectContaining({ actorId: 7, targetType: "ExchangePost" })
        })
      );
    }
  });

  it("uses one actor state for like, unlike, and relike", async () => {
    const repository = createRepository();
    const service = new ExchangeService(repository, () => now);

    await service.like(access, 41, "like-key-00000001");
    await service.unlike(access, 41, "unlike-key-000001");
    await service.like(access, 41, "relike-key-000001");

    expect(repository.setLike.mock.calls.map(([input]) => input.liked)).toEqual([
      true,
      false,
      true
    ]);
    expect(repository.setLike).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actor,
        postId: 41,
        idempotencyKey: "unlike-key-000001",
        audit: expect.objectContaining({ action: "exchange.post.unlike" })
      })
    );
  });

  it.each([
    ["not_found", "error.exchange.post_not_found", 404],
    ["forbidden", "error.exchange.author_required", 403],
    ["unavailable", "error.exchange.post_unavailable", 409]
  ] as const)(
    "maps %s mutation results to a stable domain error",
    async (kind, message, statusCode) => {
      const repository = createRepository();
      repository.withdrawPost.mockResolvedValueOnce({ kind });
      const service = new ExchangeService(repository, () => now);

      await expect(service.withdraw(access, 41, "withdraw-key-0001")).rejects.toMatchObject({
        message,
        statusCode
      });
    }
  );

  it("delegates bounded expiry processing without an authenticated actor", async () => {
    const repository = createRepository();
    repository.expireDue.mockResolvedValueOnce(17);
    const service = new ExchangeService(repository, () => now);

    await expect(service.expireDue(now, 100)).resolves.toBe(17);
    expect(repository.expireDue).toHaveBeenCalledWith(now, 100);
  });
});
