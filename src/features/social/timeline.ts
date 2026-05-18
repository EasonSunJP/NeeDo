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

function normalizeVisibilityToken(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getProfileVisibilityTokens(profile?: SocialProfile) {
  if (!profile) {
    return new Set<string>();
  }

  const rawFields = Object.values(profile.extraProfileFields ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);
  const tokens = [
    profile.displayName,
    profile.handle,
    profile.location,
    profile.headline,
    profile.entityType,
    ...rawFields.map((value) => (typeof value === "boolean" ? String(value) : value))
  ];

  return new Set(tokens.map(normalizeVisibilityToken).filter(Boolean));
}

function isRelatedActor(follows: Record<string, string[]>, actorKey: string, authorKey: string) {
  return (follows[actorKey] ?? []).includes(authorKey) || (follows[authorKey] ?? []).includes(actorKey);
}

function actorMatchesVisibilityTags(post: SocialPost, actorKey: string, profiles?: Record<string, SocialProfile>) {
  const allowedTags = (post.visibilityTagIds ?? []).map(normalizeVisibilityToken).filter(Boolean);

  if (allowedTags.length === 0) {
    return false;
  }

  const actorTokens = getProfileVisibilityTokens(profiles?.[actorKey]);
  return allowedTags.some((tag) => actorTokens.has(tag));
}

export function canActorViewPost(
  post: SocialPost,
  actorKey: string,
  follows: Record<string, string[]>,
  profiles?: Record<string, SocialProfile>
) {
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

  if (post.visibility === "private") {
    return false;
  }

  if (post.visibility === "user_only" && (post.visibilityProfileKeys ?? []).includes(actorKey)) {
    return true;
  }

  if (post.visibility === "tag_only" && actorMatchesVisibilityTags(post, actorKey, profiles)) {
    return true;
  }

  return Boolean(post.includeRelatedPeople && isRelatedActor(follows, actorKey, authorKey));
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
      if (!isVisiblePost(post) || !canActorViewPost(post, actorKey, follows, profiles)) {
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
