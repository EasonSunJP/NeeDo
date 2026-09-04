import type { RealtimeRepositoryPort } from "../src/repositories/realtime.repository";
import { RealtimeService } from "../src/services/realtime.service";
import type { UserExperienceService } from "../src/services/user-experience.service";
import type { UserExperienceRecordEventInput } from "../src/domain/user-experience";

const context = { ip: "127.0.0.1", userAgent: "social-like-experience-test" };
const occurredAt = new Date("2026-09-01T10:00:00.000Z");
const post = {
  id: 88,
  authorUserId: 9,
  authorIdentityId: 90,
  content: "formal post",
  counters: { likes: 1, reposts: 0, views: 0, bookmarks: 0 },
  viewerInteraction: { liked: true, bookmarked: false, shared: false }
};

const createHarness = (authorUserId = 9) => {
  const transactionClient = { marker: "social-like-transaction" };
  let active = false;
  const repository = {
    setSocialPostLike: jest.fn(async (input) => {
      const before = active;
      const changed = input.active !== active;
      try {
        if (input.active && changed && input.actorUserId !== authorUserId) {
          await input.onActiveLike?.({
            transactionClient,
            postId: 88,
            authorUserId,
            actorUserId: input.actorUserId
          });
        }
        active = input.active;
        return {
          changed,
          post: {
            ...post,
            authorUserId,
            viewerInteraction: { ...post.viewerInteraction, liked: active }
          }
        };
      } catch (error) {
        active = before;
        throw error;
      }
    }),
    listFollowerRecipients: jest.fn(async () => [])
  } as unknown as jest.Mocked<RealtimeRepositoryPort>;
  return { repository, transactionClient, isActive: () => active };
};

const scopeResolver = {
  resolve: jest.fn(async () => ({
    identityId: 70,
    userId: 7,
    identityType: "customer" as const,
    scopeType: "user" as const,
    scopeId: 7
  }))
};

const createExperienceService = () => {
  const seen = new Set<string>();
  return {
    recordEvent: jest.fn(
      async (input: UserExperienceRecordEventInput, options?: { transactionClient?: unknown }) => {
        void options;
        const duplicate = seen.has(input.idempotencyKey);
        seen.add(input.idempotencyKey);
        return {
          status: duplicate ? ("duplicate" as const) : ("awarded" as const),
          account: {
            publicId: "experience-account-9",
            userId: input.userId,
            totalUnits: 10_000n,
            currentLevel: 1,
            lockVersion: 2
          },
          entry: null
        };
      }
    )
  };
};

describe("received-like experience", () => {
  it("awards the post owner in the like transaction and keeps one lifetime key per actor user", async () => {
    const harness = createHarness();
    const experienceService = createExperienceService();
    const service = new RealtimeService(
      harness.repository,
      { publish: jest.fn(), subscribe: jest.fn() },
      scopeResolver,
      experienceService as Pick<UserExperienceService, "recordEvent">,
      () => occurredAt
    );
    const auth = { userId: 7 } as never;

    await service.setSocialPostLike(auth, 88, true, context);
    await service.setSocialPostLike(auth, 88, false, context);
    await service.setSocialPostLike(auth, 88, true, context);

    expect(experienceService.recordEvent).toHaveBeenCalledTimes(2);
    for (const [input, options] of experienceService.recordEvent.mock.calls) {
      expect(input).toEqual({
        userId: 9,
        eventType: "social_post_liked",
        sourceType: "social_post_like",
        sourcePublicId: "88",
        idempotencyKey: "social-post-like:88:7",
        baseUnits: 10_000n,
        occurredAt
      });
      expect(options).toEqual({ transactionClient: harness.transactionClient });
    }
  });

  it("does not award self-likes", async () => {
    const harness = createHarness(7);
    const experienceService = createExperienceService();
    const service = new RealtimeService(
      harness.repository,
      { publish: jest.fn(), subscribe: jest.fn() },
      scopeResolver,
      experienceService as Pick<UserExperienceService, "recordEvent">
    );

    await service.setSocialPostLike({ userId: 7 } as never, 88, true, context);
    expect(experienceService.recordEvent).not.toHaveBeenCalled();
  });

  it("rolls back the like when experience persistence fails", async () => {
    const harness = createHarness();
    const service = new RealtimeService(
      harness.repository,
      { publish: jest.fn(), subscribe: jest.fn() },
      scopeResolver,
      {
        recordEvent: jest.fn(async () => {
          throw new Error("experience write failed");
        })
      }
    );

    await expect(
      service.setSocialPostLike({ userId: 7 } as never, 88, true, context)
    ).rejects.toThrow("experience write failed");
    expect(harness.isActive()).toBe(false);
  });
});
