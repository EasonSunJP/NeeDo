import type { AuthSession } from "../../auth/rbac";
import type {
  MerchantReview,
  Paginated
} from "../../features/identity-applications/api";

export function resolveAdminDisplayName(
  session: Pick<AuthSession, "profileDisplayName" | "username" | "email">
): string {
  return session.profileDisplayName?.trim() || session.username.trim() || session.email;
}

function isPlatformIdentity(type: string) {
  return type === "platform" || type === "platform_admin";
}

export function resolveAdminRoleLabel(
  session: Pick<AuthSession, "activeIdentityId" | "currentIdentity" | "identities">,
  fallback: string
): string {
  const activeIdentity =
    session.identities.find(
      (identity) =>
        identity.id === session.activeIdentityId && isPlatformIdentity(identity.type)
    ) ??
    (isPlatformIdentity(session.currentIdentity.type) ? session.currentIdentity : null);

  return activeIdentity?.displayName?.trim() || fallback;
}

function reviewTimestamp(review: MerchantReview) {
  const timestamp = Date.parse(review.submittedAt ?? review.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergePendingMerchantReviews(
  submitted: Paginated<MerchantReview>,
  underReview: Paginated<MerchantReview>
) {
  const uniqueReviews = new Map<number, MerchantReview>();
  [...submitted.list, ...underReview.list].forEach((review) => {
    uniqueReviews.set(review.applicationId, review);
  });

  return {
    total: submitted.total + underReview.total,
    list: Array.from(uniqueReviews.values())
      .sort(
        (left, right) =>
          reviewTimestamp(right) - reviewTimestamp(left) ||
          right.applicationId - left.applicationId
      )
      .slice(0, 5)
  };
}
