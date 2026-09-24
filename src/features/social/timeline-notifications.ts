import type { SocialPost, SocialProfile } from "./types";

export type TimelineUpdateNotification = {
  id: string;
  actorKey: string;
  postId: string;
  createdAt: string;
  content: "好友发布了新动态" | "附近发布了新动态";
  unread: boolean;
};

export function buildTimelineUpdateNotifications({
  actorKey,
  friendPosts,
  nearbyPosts,
  profiles
}: {
  actorKey: string;
  friendPosts: SocialPost[];
  nearbyPosts: SocialPost[];
  profiles: Record<string, SocialProfile>;
}) {
  const notices = new Map<string, TimelineUpdateNotification>();

  const addPosts = (posts: SocialPost[], content: TimelineUpdateNotification["content"]) => {
    posts.forEach((post) => {
      const postActorKey = `${post.authorType}:${post.authorId}`;

      if (
        notices.has(post.id) ||
        post.status !== "published" ||
        post.replyToPostId ||
        postActorKey === actorKey ||
        !profiles[postActorKey]
      ) {
        return;
      }

      notices.set(post.id, {
        id: `timeline-update:${post.id}`,
        actorKey: postActorKey,
        postId: post.id,
        createdAt: post.createdAt,
        content,
        unread: post.viewerViewed !== true
      });
    });
  };

  addPosts(friendPosts, "好友发布了新动态");
  addPosts(nearbyPosts, "附近发布了新动态");

  return [...notices.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
