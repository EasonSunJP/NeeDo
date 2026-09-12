// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import composerSource from "./UnifiedComposerUi.tsx?raw";
import source from "./UnifiedSocialUi.tsx?raw";
import { UnifiedPostText } from "./UnifiedSocialUi";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("UnifiedSocialUi technician store booking links", () => {
  it("routes user self-profile editing to the personal center", () => {
    const editPathSource = source.slice(
      source.indexOf("function buildSelfProfileEditPath"),
      source.indexOf("function ProfileMetaRow")
    );

    expect(editPathSource).toContain('return "/me";');
    expect(editPathSource).not.toContain('return "/me/settings/profile";');
  });

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
    expect(composerSource).toContain("client-app-frame client-app-gutter");
    expect(composerSource).not.toContain('maxWidth="720px"');
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

  it("routes timeline reply controls to canonical detail with transient focus state", () => {
    const obsoleteReplyComposeCall = ["socialPaths.compose(scope, { reply", "ToPostId: post.id })"].join("");

    expect(source).toContain('import { socialPaths, socialReplyFocusState } from "../paths";');
    expect(source).toContain("onClick={() => navigate(detailHref, { state: socialReplyFocusState })}");
    expect(source).not.toContain(obsoleteReplyComposeCall);
  });
});

describe("UnifiedPostText judgement rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderPostText = async (props: ComponentProps<typeof UnifiedPostText>) => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, undefined, createElement(UnifiedPostText, props))
      );
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders a structured judgement as its shared SVG without duplicating its fallback text", async () => {
    await renderPostText({
      expanded: true,
      profiles: {},
      richText: { version: 1, parts: [{ type: "judgement", value: "Pending" }] },
      scope: "user",
      text: "Pending"
    });

    expect(container.querySelector('[data-social-judgement="Pending"] img')).not.toBeNull();
    expect(container.textContent).not.toContain("PendingPending");
  });

  it("keeps a plain judgement word as text when structured rich text is absent", async () => {
    await renderPostText({
      expanded: true,
      profiles: {},
      scope: "user",
      text: "Pending"
    });

    expect(container.querySelector('[data-social-judgement="Pending"] img')).toBeNull();
    expect(container.textContent).toContain("Pending");
  });

  it("keeps judgement parts structured while collapsing surrounding text", async () => {
    const prefix = "长".repeat(230);
    const suffix = "继续阅读的剩余内容";

    await renderPostText({
      profiles: {},
      richText: {
        version: 1,
        parts: [
          { type: "text", value: prefix },
          { type: "judgement", value: "Pending" },
          { type: "text", value: suffix }
        ]
      },
      scope: "user",
      text: `${prefix}Pending${suffix}`
    });

    expect(container.querySelector('[data-social-judgement="Pending"] img')).not.toBeNull();
    expect(container.textContent).toContain("...");
  });

  it("keeps hashtags and URLs linked within structured text parts", async () => {
    await renderPostText({
      expanded: true,
      profiles: {},
      richText: {
        version: 1,
        parts: [
          { type: "text", value: "查看 #贴纸 " },
          { type: "judgement", value: "Pending" },
          { type: "text", value: " https://example.com" }
        ]
      },
      scope: "user",
      text: "查看 #贴纸 Pending https://example.com"
    });

    expect(container.querySelector('a[href="/moments/tags/%E8%B4%B4%E7%BA%B8"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
  });
});
