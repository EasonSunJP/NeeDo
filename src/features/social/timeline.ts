import type { SocialPost, SocialProfile, SocialTimelineFilterTab } from "./types";
import {
  distanceInKm,
  doAreaHintsMatch,
  extractAreaHints,
  resolveAreaCoordinates,
  uniqueStrings,
  type Coordinates
} from "../../lib/location";
import { profileKey, sortPostsByNewest } from "./utils";

export { extractAreaHints } from "../../lib/location";

export type SocialTimelineLocationContext = {
  coords?: Coordinates;
  areaHints?: string[];
};

const NEARBY_RADIUS_KM = 3;

export function postAuthorKey(post: SocialPost) {
  return profileKey({ entityType: post.authorType, id: post.authorId });
}

export function isVisiblePost(post: SocialPost) {
  return post.status === "published";
}

export function canActorViewPost(post: SocialPost, actorKey: string, follows: Record<string, string[]>) {
  const authorKey = postAuthorKey(post);

  if (authorKey === actorKey) {
    return true;
  }

  if (post.visibility === "public") {
    return true;
  }

  const actorFollowing = new Set(follows[actorKey] ?? []);

  if (post.visibility === "followers") {
    return actorFollowing.has(authorKey);
  }

  if (post.visibility === "friends") {
    return actorFollowing.has(authorKey) && (follows[authorKey] ?? []).includes(actorKey);
  }

  return false;
}

export function isMutualFollow(follows: Record<string, string[]>, actorKey: string, targetKey: string) {
  return (follows[actorKey] ?? []).includes(targetKey) && (follows[targetKey] ?? []).includes(actorKey);
}

export function resolveProfileAreaHints(profile?: SocialProfile) {
  if (!profile) {
    return [];
  }

  const addressValue = typeof profile.extraProfileFields.address === "string" ? profile.extraProfileFields.address : undefined;

  return uniqueStrings([profile.location, addressValue].flatMap((value) => extractAreaHints(value)));
}

export function resolvePostAreaHints(post: SocialPost, profiles: Record<string, SocialProfile>) {
  const author = profiles[postAuthorKey(post)];

  return uniqueStrings([post.locationLabel, ...resolveProfileAreaHints(author)].flatMap((value) => extractAreaHints(value)));
}

function matchesNearbyFilter(
  post: SocialPost,
  profiles: Record<string, SocialProfile>,
  locationContext?: SocialTimelineLocationContext
) {
  const postAreaHints = resolvePostAreaHints(post, profiles);

  if (postAreaHints.length === 0) {
    return false;
  }

  if (locationContext?.coords) {
    const matchesByCoords = postAreaHints.some((areaHint) => {
      const areaCoords = resolveAreaCoordinates(areaHint);

      return areaCoords ? distanceInKm(locationContext.coords!, areaCoords) <= NEARBY_RADIUS_KM : false;
    });

    if (matchesByCoords) {
      return true;
    }
  }

  const actorAreaHints = uniqueStrings((locationContext?.areaHints ?? []).flatMap((value) => extractAreaHints(value)));

  if (actorAreaHints.length === 0) {
    return false;
  }

  return postAreaHints.some((postAreaHint) => actorAreaHints.some((actorAreaHint) => doAreaHintsMatch(postAreaHint, actorAreaHint)));
}

export function filterTimelinePosts({
  posts,
  profiles,
  follows,
  actorKey,
  filter,
  locationContext
}: {
  posts: SocialPost[];
  profiles: Record<string, SocialProfile>;
  follows: Record<string, string[]>;
  actorKey: string;
  filter: SocialTimelineFilterTab;
  locationContext?: SocialTimelineLocationContext;
}) {
  return sortPostsByNewest(
    posts.filter((post) => {
      if (!isVisiblePost(post) || !canActorViewPost(post, actorKey, follows)) {
        return false;
      }

      const authorKey = postAuthorKey(post);

      if (filter === "mine") {
        return authorKey === actorKey;
      }

      if (filter === "friends") {
        return authorKey !== actorKey && isMutualFollow(follows, actorKey, authorKey);
      }

      return matchesNearbyFilter(post, profiles, locationContext);
    })
  );
}
