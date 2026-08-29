import { NotificationType, SocialPostVisibility } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const now = new Date("2026-08-30T05:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "social-update-test" };
const existingChecksum = "a".repeat(64);
const uploadedChecksum = "b".repeat(64);

const author = {
  id: 41,
  username: "Aya",
  avatarUrl: null,
  createdAt: now,
  identities: [{ type: "customer", displayName: "Aya", isDefault: true }]
};

function createFixture(options: { postAuthorUserId?: number; missingUpload?: boolean } = {}) {
  const existingPost = {
    id: 701,
    authorUserId: options.postAuthorUserId ?? 41,
    authorIdentityId: options.postAuthorUserId === 99 ? 199 : 71,
    content: "before",
    media: {
      items: [
        {
          id: "existing",
          type: "image",
          url: `/media/content/${existingChecksum}.png`,
          mediaAssetPublicId: existingChecksum
        }
      ],
      mentionUserIds: [52],
      counters: { likes: 9, replies: 2, reposts: 1, views: 80, bookmarks: 4 }
    },
    visibility: SocialPostVisibility.PUBLIC,
    createdAt: now,
    updatedAt: now,
    author,
    authorIdentity: { id: 71, type: "customer", displayName: "Aya" }
  };
  const transaction = {
    socialPost: {
      findFirst: jest.fn(async () =>
        existingPost.authorUserId === 41 ? existingPost : null
      ),
      update: jest.fn(async ({ data }) => ({
        ...existingPost,
        content: data.content,
        media: data.media,
        visibility: data.visibility,
        updatedAt: now
      }))
    },
    contact: {
      findMany: jest.fn(async () => [
        { contactUserId: 52, contactIdentityId: 152 },
        { contactUserId: 63, contactIdentityId: 163 }
      ])
    },
    mediaAsset: {
      findMany: jest.fn(async () => [
        {
          id: 301,
          checksumSha256: existingChecksum,
          url: `/media/content/${existingChecksum}.png`,
          entityType: "social_post",
          entityId: 701,
          createdAt: now
        },
        ...(options.missingUpload
          ? []
          : [{
              id: 302,
              checksumSha256: uploadedChecksum,
              url: `/media/content/${uploadedChecksum}.webp`,
              entityType: "social_post_upload",
              entityId: 41,
              createdAt: now
            }])
      ]),
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    notification: {
      create: jest.fn(async ({ data }) => ({
        id: 801,
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
    auditLog: { create: jest.fn(async () => ({ id: 901 })) }
  };
  const client = { $transaction: jest.fn(async (operation) => operation(transaction)) };
  return { repository: new RealtimeRepository(client as never), transaction };
}

const updateInput = () => ({
  postId: 701,
  authorUserId: 41,
  authorIdentityId: 71,
  content: "after",
  visibility: "followers" as const,
  mentionUserIds: [52, 63],
  context,
  media: {
    items: [
      { id: "existing", type: "image" as const, mediaAssetPublicId: existingChecksum },
      { id: "uploaded", type: "image" as const, mediaAssetPublicId: uploadedChecksum }
    ],
    postType: "post" as const,
    locationLabel: "东京 银座"
  }
});

describe("RealtimeRepository Social post update", () => {
  it("updates the author's post, reuses its bound image, binds a new upload, and notifies only new reminders", async () => {
    const fixture = createFixture();

    const result = await fixture.repository.updateSocialPost(updateInput());

    expect(result?.post).toMatchObject({ id: 701, content: "after", visibility: "followers" });
    expect(result?.post.media).toEqual({
      items: [
        {
          id: "existing",
          type: "image",
          url: `/media/content/${existingChecksum}.png`,
          mediaAssetPublicId: existingChecksum
        },
        {
          id: "uploaded",
          type: "image",
          url: `/media/content/${uploadedChecksum}.webp`,
          mediaAssetPublicId: uploadedChecksum
        }
      ],
      postType: "post",
      locationLabel: "东京 银座",
      mentionUserIds: [52, 63],
      counters: { likes: 9, replies: 2, reposts: 1, views: 80, bookmarks: 4 }
    });
    expect(fixture.transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: [302] }, entityType: "social_post_upload" }),
      data: { entityType: "social_post", entityId: 701 }
    });
    expect(fixture.transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(fixture.transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipientUserId: 63 })
    });
    expect(fixture.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 41,
        action: "social.post.updated",
        targetType: "SocialPost",
        targetId: 701
      })
    });
  });

  it("does not reveal or mutate a post that is not owned by the editor", async () => {
    const fixture = createFixture({ postAuthorUserId: 99 });

    await expect(fixture.repository.updateSocialPost(updateInput())).resolves.toBeNull();
    expect(fixture.transaction.mediaAsset.findMany).not.toHaveBeenCalled();
    expect(fixture.transaction.socialPost.update).not.toHaveBeenCalled();
  });

  it("rolls back before updating when a requested image is neither pending nor bound to this post", async () => {
    const fixture = createFixture({ missingUpload: true });

    await expect(fixture.repository.updateSocialPost(updateInput())).rejects.toMatchObject({
      message: "error.social.media_not_owned",
      statusCode: 409
    });
    expect(fixture.transaction.socialPost.update).not.toHaveBeenCalled();
    expect(fixture.transaction.notification.create).not.toHaveBeenCalled();
  });
});
