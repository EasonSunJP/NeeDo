import { SocialPostVisibility } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const now = new Date("2026-08-30T06:00:00.000Z");

const author = {
  id: 41,
  username: "Aya",
  avatarUrl: null,
  createdAt: now,
  identities: [{ type: "customer", displayName: "Aya", isDefault: true }]
};

function createFixture(options: { replyTargetExists?: boolean; activeReplyCount?: number } = {}) {
  const transaction = {
    socialPost: {
      findFirst: jest.fn(async () =>
        options.replyTargetExists === false ? null : { id: 700 }
      ),
      create: jest.fn(async ({ data }) => ({
        id: 701,
        authorUserId: data.authorUserId,
        authorIdentityId: data.authorIdentityId,
        content: data.content,
        media: data.media,
        replyToPostId: data.replyToPostId,
        visibility: SocialPostVisibility.PUBLIC,
        createdAt: now,
        updatedAt: now,
        author,
        authorIdentity: { id: 71, type: "customer", displayName: "Aya" },
        _count: { replies: options.activeReplyCount ?? 0 }
      }))
    },
    auditLog: { create: jest.fn(async () => ({ id: 901 })) }
  };
  const client = { $transaction: jest.fn(async (operation) => operation(transaction)) };
  return { repository: new RealtimeRepository(client as never), transaction };
}

const createInput = () => ({
  authorUserId: 41,
  authorIdentityId: 71,
  content: "reply",
  visibility: "public" as const,
  mentionUserIds: [],
  context: { ip: "127.0.0.1", userAgent: "social-reply-test" },
  media: { items: [], postType: "reply" as const, replyToPostId: 700 }
});

describe("RealtimeRepository Social post replies", () => {
  it("filters the paginated formal list by the first-class reply relation", async () => {
    const client = {
      socialPost: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0)
      }
    };
    const repository = new RealtimeRepository(client as never);

    await repository.listSocialPosts(71, { page: 2, pageSize: 100, replyToPostId: 700 }, 41);

    const expectedWhere = expect.objectContaining({ deletedAt: null, replyToPostId: 700 });
    expect(client.socialPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
      skip: 100,
      take: 100
    }));
    expect(client.socialPost.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("validates and persists an active reply target with an authoritative active reply count", async () => {
    const { repository, transaction } = createFixture({ activeReplyCount: 0 });

    const result = await repository.createSocialPost(createInput());

    expect(transaction.socialPost.findFirst).toHaveBeenCalledWith({
      where: { id: 700, deletedAt: null },
      select: { id: true }
    });
    expect(transaction.socialPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ replyToPostId: 700 }),
        include: expect.objectContaining({
          _count: { select: { replies: { where: { deletedAt: null } } } }
        })
      })
    );
    expect(result.post).toMatchObject({ replyToPostId: 700, replyCount: 0 });
  });

  it.each(["missing", "soft-deleted"])("rejects a %s reply target before creating the reply", async () => {
    const { repository, transaction } = createFixture({ replyTargetExists: false });

    await expect(repository.createSocialPost(createInput())).rejects.toMatchObject({
      message: "error.social.reply_target_not_found",
      statusCode: 409
    });
    expect(transaction.socialPost.create).not.toHaveBeenCalled();
  });

  it("maps the active reply count returned by the relation include", async () => {
    const { repository } = createFixture({ activeReplyCount: 2 });

    await expect(repository.createSocialPost(createInput())).resolves.toMatchObject({
      post: { replyToPostId: 700, replyCount: 2 }
    });
  });
});
