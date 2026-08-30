import { describe, expect, it } from "vitest";
import composerSource from "./UnifiedComposerUi.tsx?raw";
import source from "./UnifiedSocialUi.tsx?raw";

describe("UnifiedSocialUi technician store booking links", () => {
  it("routes user-side store technicians into the store booking page", () => {
    expect(source).toContain("buildStoreBookingRoute");
    expect(source).toContain('scope === "user" && mainStoreEntry');
    expect(source).toContain('scope === "user" && hasMainStoreEntry');
    expect(source).toContain("technicianId: profile.id");
  });

  it("does not render the four special review stamps in the dynamic profile header", () => {
    expect(source).not.toContain("<SocialTechnicianReviewStamps />");
    expect(source).not.toContain("function SocialTechnicianReviewStamps");
  });

  it("uses the chat-style shared glass header inside composer selectors", () => {
    expect(composerSource).toContain("<MobileFullscreenHeader");
    expect(composerSource).toContain('className="needo-composer-glass-header"');
    expect(composerSource).toContain('maxWidth="720px"');
    expect(composerSource).not.toContain("fixed inset-x-0 top-0 z-30 border-b");
    expect(composerSource).not.toContain("<FloatingBackButton onClick={onBack}");
  });

  it("keeps follow and unfollow independent from IM friendship mutations", () => {
    const start = source.indexOf("export function SocialFollowButton");
    const end = source.indexOf("function findImUserForSocialProfile", start);
    const followButtonSource = source.slice(start, end);

    expect(followButtonSource).toContain("toggleFollow(actorKey, targetKey)");
    expect(followButtonSource).toContain('following ? "已关注" : "关注"');
    expect(followButtonSource).not.toContain("sendFriendRequest");
    expect(followButtonSource).not.toContain("deleteContact");
    expect(followButtonSource).not.toContain("targetFollowsActor");
    expect(followButtonSource).not.toContain("isSocialFriend");
    expect(followButtonSource).not.toContain("autoFriendTargetRef");
    expect(followButtonSource).not.toContain("friendUnfollowDialog");
  });
});
