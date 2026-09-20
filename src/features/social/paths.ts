import type { SocialPortalScope, SocialProfileRef } from "./types";
import { profileKey, scopePrefix } from "./utils";

export type SocialComposeParams = {
  author?: string;
  editPostId?: string;
  quotePostId?: string;
};

export const socialReplyFocusState = { focusSocialReply: true } as const;

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
  compose(scope: SocialPortalScope, params?: SocialComposeParams) {
    const search = new URLSearchParams();

    if (params?.author) search.set("author", params.author);
    if (params?.editPostId) search.set("editPostId", params.editPostId);
    if (params?.quotePostId) search.set("quotePostId", params.quotePostId);

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
  repost(scope: SocialPortalScope, postId: string) {
    return `${scopePrefix(scope)}/moments/posts/${postId}/repost`;
  },
  media(scope: SocialPortalScope, postId: string, mediaId: string, index: number) {
    return `${scopePrefix(scope)}/moments/posts/${postId}/media/${mediaId}?index=${index}`;
  },
  accountProfile(scope: SocialPortalScope, userId: number | string, identityId?: number) {
    const path = `${scopePrefix(scope)}/moments/users/${encodeURIComponent(String(userId))}`;
    return identityId ? `${path}?identityId=${encodeURIComponent(String(identityId))}` : path;
  },
  profile(scope: SocialPortalScope, ref: (SocialProfileRef & { identityId?: number }) | string) {
    const nextRef = typeof ref === "string" ? profileKeyToRef(ref) : ref;
    const identityId = typeof ref === "string" ? undefined : ref.identityId;

    if (Number.isSafeInteger(identityId) && (identityId ?? 0) > 0) {
      return `${scopePrefix(scope)}/moments/users/${encodeURIComponent(nextRef.id)}?identityId=${encodeURIComponent(String(identityId))}`;
    }

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
