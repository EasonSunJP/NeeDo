import { RealtimeRepository } from "../src/repositories/realtime.repository";

const now = new Date("2026-09-08T01:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "social-pin-test" };

function createPost(id: number, pinnedSocialPostId: number | null) {
  return {
    id,
    authorUserId: 41,
    authorIdentityId: 71,
    content: `post-${id}`,
    media: null,
    replyToPostId: null,
    visibility: "PUBLIC",
    createdAt: now,
    updatedAt: now,
    author: {
      id: 41,
      username: "Aya",
      avatarUrl: null,
      createdAt: now,
      identities: [{ id: 71, type: "customer", displayName: "Aya", isDefault: true }]
    },
    authorIdentity: { id: 71, type: "customer", displayName: "Aya", pinnedSocialPostId },
    _count: { replies: 0, likes: 0, bookmarks: 0, views: 0, shares: 0 }
  };
}

function createFixture(options: { missing?: boolean; reply?: boolean } = {}) {
  let pinnedSocialPostId: number | null = 700;
  const target = {
    ...createPost(701, pinnedSocialPostId),
    replyToPostId: options.reply ? 699 : null
  };
  const transaction = {
    socialPost: {
      findFirst: jest.fn(async () =>
        options.missing || target.replyToPostId !== null ? null : target
      ),
      findUniqueOrThrow: jest.fn(async () => createPost(701, pinnedSocialPostId))
    },
    userIdentity: {
      update: jest.fn(async ({ data }) => {
        pinnedSocialPostId = data.pinnedSocialPostId;
        return { id: 71, pinnedSocialPostId };
      }),
      updateMany: jest.fn(async () => {
        const changed = pinnedSocialPostId === 701;
        if (changed) pinnedSocialPostId = null;
        return { count: changed ? 1 : 0 };
      })
    },
    auditLog: { create: jest.fn(async () => ({ id: 901 })) }
  };
  const client = { $transaction: jest.fn(async (operation) => operation(transaction)) };
  return { repository: new RealtimeRepository(client as never), transaction };
}

describe("RealtimeRepository Social post pin", () => {
  it("atomically replaces the identity's previous pin and writes an audit record", async () => {
    const fixture = createFixture();
    const post = await fixture.repository.setSocialPostPin({
      postId: 701,
      authorUserId: 41,
      authorIdentityId: 71,
      active: true,
      context
    });

    expect(post).toMatchObject({ id: 701, isPinned: true });
    expect(fixture.transaction.userIdentity.update).toHaveBeenCalledWith({
      where: { id: 71 },
      data: { pinnedSocialPostId: 701 }
    });
    expect(fixture.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 41,
        action: "social.post.pinned",
        targetType: "SocialPost",
        targetId: 701,
        metadata: { previousPinnedPostId: 700 }
      })
    });
  });

  it("only clears the pin when the requested post is currently pinned", async () => {
    const fixture = createFixture();
    const post = await fixture.repository.setSocialPostPin({
      postId: 701,
      authorUserId: 41,
      authorIdentityId: 71,
      active: false,
      context
    });

    expect(post).toMatchObject({ id: 701, isPinned: false });
    expect(fixture.transaction.userIdentity.updateMany).toHaveBeenCalledWith({
      where: { id: 71, pinnedSocialPostId: 701 },
      data: { pinnedSocialPostId: null }
    });
  });

  it("does not pin another identity's post or a reply", async () => {
    const missing = createFixture({ missing: true });
    const reply = createFixture({ reply: true });

    await expect(
      missing.repository.setSocialPostPin({
        postId: 701,
        authorUserId: 41,
        authorIdentityId: 71,
        active: true,
        context
      })
    ).resolves.toBeNull();
    await expect(
      reply.repository.setSocialPostPin({
        postId: 701,
        authorUserId: 41,
        authorIdentityId: 71,
        active: true,
        context
      })
    ).resolves.toBeNull();
    expect(reply.transaction.userIdentity.update).not.toHaveBeenCalled();
  });
});
