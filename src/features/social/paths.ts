import type { SocialPortalScope, SocialProfileRef } from "./types";
import { profileKey, scopePrefix } from "./utils";

export function getSocialScopeFromPathname(pathname: string): SocialPortalScope {
  if (pathname.startsWith("/merchant/")) {
    return "merchant";
  }

  if (pathname.startsWith("/technician/")) {
    return "technician";
  }

  return "user";
}

export const socialPaths = {
  timeline(scope: SocialPortalScope) {
    return `${scopePrefix(scope)}/moments`;
  },
  compose(scope: SocialPortalScope, params?: Record<string, string | undefined>) {
    const search = new URLSearchParams();

    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value) {
        search.set(key, value);
      }
    });

    const query = search.toString();
    return `${scopePrefix(scope)}/moments/compose${query ? `?${query}` : ""}`;
  },
  search(scope: SocialPortalScope, query?: string, tag?: string) {
    const search = new URLSearchParams();

    if (query) {
      search.set("q", query);
    }

    if (tag) {
      search.set("tag", tag);
    }

    const queryString = search.toString();
    return `${scopePrefix(scope)}/moments/search${queryString ? `?${queryString}` : ""}`;
  },
  hashtag(scope: SocialPortalScope, tag: string) {
    return `${scopePrefix(scope)}/moments/tags/${encodeURIComponent(tag)}`;
  },
  drafts(scope: SocialPortalScope) {
    return `${scopePrefix(scope)}/moments/drafts`;
  },
  notifications(scope: SocialPortalScope) {
    return `${scopePrefix(scope)}/moments/notifications`;
  },
  messages(scope: SocialPortalScope) {
    return `${scopePrefix(scope)}/messages`;
  },
  newMessage(scope: SocialPortalScope) {
    return `${scopePrefix(scope)}/messages/new`;
  },
  post(scope: SocialPortalScope, postId: string) {
    return `${scopePrefix(scope)}/moments/posts/${postId}`;
  },
  replies(scope: SocialPortalScope, postId: string) {
    return `${scopePrefix(scope)}/moments/posts/${postId}/replies`;
  },
  repost(scope: SocialPortalScope, postId: string) {
    return `${scopePrefix(scope)}/moments/posts/${postId}/repost`;
  },
  media(scope: SocialPortalScope, postId: string, mediaId: string, index: number) {
    return `${scopePrefix(scope)}/moments/posts/${postId}/media/${mediaId}?index=${index}`;
  },
  profile(scope: SocialPortalScope, ref: SocialProfileRef | string) {
    const nextRef = typeof ref === "string" ? profileKeyToRef(ref) : ref;
    return `${scopePrefix(scope)}/profiles/${nextRef.entityType}/${nextRef.id}`;
  },
  followers(scope: SocialPortalScope, ref: SocialProfileRef | string) {
    const nextRef = typeof ref === "string" ? profileKeyToRef(ref) : ref;
    return `${scopePrefix(scope)}/profiles/${nextRef.entityType}/${nextRef.id}/followers`;
  },
  following(scope: SocialPortalScope, ref: SocialProfileRef | string) {
    const nextRef = typeof ref === "string" ? profileKeyToRef(ref) : ref;
    return `${scopePrefix(scope)}/profiles/${nextRef.entityType}/${nextRef.id}/following`;
  }
};

function profileKeyToRef(value: string): SocialProfileRef {
  const [entityType, id] = value.split(":");
  return {
    entityType: (entityType as SocialProfileRef["entityType"]) || "user",
    id: id || value
  };
}
