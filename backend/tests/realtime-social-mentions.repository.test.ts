import { NotificationType, SocialPostVisibility } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const now = new Date("2026-08-30T03:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "social-mention-test" };
const firstChecksum = "a".repeat(64);
const secondChecksum = "b".repeat(64);

const author = {
  id: 41,
  username: "Aya",
  avatarUrl: null,
  createdAt: now,
  identities: [{ type: "customer", displayName: "Aya", isDefault: true }]
};

const createFixture = (
  overrides: {
    contacts?: Array<{ contactUserId: number; contactIdentityId: number }>;
    mediaAssets?: Array<{
      id: number;
      checksumSha256: string;
      url: string;
      createdAt: Date;
    }>;
  } = {}
) => {
  let notificationId = 800;
  const transaction = {
    contact: {
      findMany: jest.fn(
        async () =>
          overrides.contacts ?? [
            { contactUserId: 52, contactIdentityId: 152 },
            { contactUserId: 63, contactIdentityId: 163 }
          ]
      )
    },
    mediaAsset: {
      findMany: jest.fn(
        async () =>
          overrides.mediaAssets ?? [
            {
              id: 301,
              checksumSha256: firstChecksum,
              url: `/media/content/${firstChecksum}.png`,
              createdAt: now
            },
            {
              id: 302,
              checksumSha256: secondChecksum,
              url: `/media/content/${secondChecksum}.webp`,
              createdAt: now
            }
          ]
      ),
      updateMany: jest.fn(async () => ({ count: 2 }))
    },
    socialPost: {
      create: jest.fn(async ({ data }) => ({
        id: 701,
        authorUserId: data.authorUserId,
        authorIdentityId: data.authorIdentityId,
        content: data.content,
        media: data.media,
        replyToPostId: data.replyToPostId,
        visibility: SocialPostVisibility.PUBLIC,
        createdAt: now,
        author,
        authorIdentity: { id: 71, type: "customer", displayName: "Aya" },
        _count: { replies: 0 }
      }))
    },
    notification: {
      create: jest.fn(async ({ data }) => ({
        id: notificationId++,
        recipientUserId: data.recipientUserId,
        recipientIdentityId: data.recipientIdentityId,
        actorUserId: data.actorUserId,
        actorIdentityId: data.actorIdentityId,
        type: NotificationType.SOCIAL,
        title: data.title,
        body: data.body,
        payload: data.payload,
        readAt: null,
        createdAt: now
      }))
    },
    auditLog: {
      create: jest.fn(async () => ({ id: 901 }))
    }
  };
  const client = {
    $transaction: jest.fn(async (operation) => operation(transaction))
  };
  return { client, repository: new RealtimeRepository(client as never), transaction };
};

const createInput = () => ({
  authorUserId: 41,
  authorIdentityId: 71,
  content: "formal Good",
  visibility: "public" as const,
  mentionUserIds: [52, 63],
  context,
  media: {
    items: [
      { id: "m1", type: "image" as const, mediaAssetPublicId: firstChecksum, alt: "First" },
      { id: "m2", type: "image" as const, mediaAssetPublicId: secondChecksum }
    ],
    postType: "post" as const,
    locationLabel: "东京 银座",
    richText: {
      version: 1 as const,
      parts: [
        { type: "text" as const, value: "formal " },
        { type: "judgement" as const, value: "Good" as const }
      ]
    }
  }
});

describe("RealtimeRepository Social post mentions", () => {
  it("validates contacts and media, then creates the post, notifications, binding, and audit atomically", async () => {
    const fixture = createFixture();

    const result = await fixture.repository.createSocialPost(createInput());

    expect(result.post).toMatchObject({ id: 701, authorUserId: 41 });
    expect(result.post.media).toEqual({
      items: [
        {
          id: "m1",
          type: "image",
          url: `/media/content/${firstChecksum}.png`,
          mediaAssetPublicId: firstChecksum,
          alt: "First"
        },
        {
          id: "m2",
          type: "image",
          url: `/media/content/${secondChecksum}.webp`,
          mediaAssetPublicId: secondChecksum
        }
      ],
      postType: "post",
      locationLabel: "东京 银座",
      richText: {
        version: 1,
        parts: [
          { type: "text", value: "formal " },
          { type: "judgement", value: "Good" }
        ]
      },
      mentionUserIds: [52, 63],
      counters: { likes: 0, replies: 0, reposts: 0, views: 1, bookmarks: 0 }
    });
    expect(result.notifications).toEqual([
      expect.objectContaining({ recipientUserId: 52, type: "social" }),
      expect.objectContaining({ recipientUserId: 63, type: "social" })
    ]);
    expect(fixture.transaction.contact.findMany).toHaveBeenCalledWith({
      where: {
        ownerIdentityId: 71,
        contactUserId: { in: [52, 63] },
        blockedAt: null,
        deletedAt: null,
        contactUser: { isActive: true, deletedAt: null }
      },
      select: { contactUserId: true, contactIdentityId: true },
      orderBy: { contactIdentityId: "asc" }
    });
    expect(fixture.transaction.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 41,
          ownerIdentityId: 71,
          entityType: "social_post_upload",
          usageType: "social_post_public",
          isActive: true,
          deletedAt: null,
          purgedAt: null,
          checksumSha256: { in: [firstChecksum, secondChecksum] }
        })
      })
    );
    expect(fixture.transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: [301, 302] },
        ownerUserId: 41,
        ownerIdentityId: 71,
        entityType: "social_post_upload",
        usageType: "social_post_public"
      }),
      data: { entityType: "social_post", entityId: 701 }
    });
    expect(fixture.transaction.notification.create).toHaveBeenCalledTimes(2);
    expect(fixture.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 41,
        action: "social.post.created",
        targetType: "SocialPost",
        targetId: 701,
        ip: context.ip,
        userAgent: context.userAgent
      })
    });
  });

  it("rejects the whole operation when any mention is not an active unblocked owned contact", async () => {
    const fixture = createFixture({ contacts: [{ contactUserId: 52, contactIdentityId: 152 }] });

    await expect(fixture.repository.createSocialPost(createInput())).rejects.toMatchObject({
      message: "error.social.invalid_mention_contact",
      statusCode: 409
    });
    expect(fixture.transaction.socialPost.create).not.toHaveBeenCalled();
    expect(fixture.transaction.notification.create).not.toHaveBeenCalled();
  });

  it("rejects the whole operation when an uploaded asset is not owned and pending", async () => {
    const fixture = createFixture({
      mediaAssets: [
        {
          id: 301,
          checksumSha256: firstChecksum,
          url: `/media/content/${firstChecksum}.png`,
          createdAt: now
        }
      ]
    });

    await expect(fixture.repository.createSocialPost(createInput())).rejects.toMatchObject({
      message: "error.social.media_not_owned",
      statusCode: 409
    });
    expect(fixture.transaction.socialPost.create).not.toHaveBeenCalled();
    expect(fixture.transaction.notification.create).not.toHaveBeenCalled();
  });
});
