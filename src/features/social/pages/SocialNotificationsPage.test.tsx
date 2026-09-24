import { describe, expect, it } from "vitest";
import { translateText } from "../../../i18n/translations";
import "../registerRouteI18n";
import source from "./SocialNotificationsPage.tsx?raw";
import { socialRouteTranslations } from "../route-i18n";
import uiSource from "../components/UnifiedSocialUi.tsx?raw";

describe("SocialNotificationsPage", () => {
  it("shows only friend and nearby timeline updates", () => {
    expect(source).toContain("buildTimelineUpdateNotifications");
    expect(source).toContain('getTimelineFeed("friends", actorKey)');
    expect(source).toContain('getTimelineFeed("nearby", actorKey, nearbyLocationContext)');
    expect(source).not.toContain("getNotifications(actorKey).map");
  });

  it("opens the corresponding post from every update", () => {
    expect(source).toContain("to={socialPaths.post(scope, item.postId)}");
    expect(source).toContain('title="动态通知"');
  });

  it("uses a close action and title info, and shows the post view state", () => {
    expect(source).toContain('closeTo={socialPaths.timeline(scope)}');
    expect(source).toContain('info="附近与好友新动态"');
    expect(source).not.toContain('subtitle="附近与好友新动态"');
    expect(source).toContain("<ContactEventTimeline");
    expect(source).toContain("showCommentComposer={false}");
    expect(source).toContain('tone: item.unread ? "green" : "neutral"');
    expect(source).not.toContain("actions={<SocialTopActions");
  });

  it.each([
    "好友发布了新动态",
    "附近发布了新动态",
    "附近与好友新动态",
    "附近或好友发布新动态后，会在这里提示。"
  ])("localizes the new timeline notice copy: %s", (copy) => {
    expect(Object.keys(socialRouteTranslations[copy] ?? {})).toEqual(["zh-Hant", "ja", "en", "ko"]);
  });

  it("translates timeline notices in the shared sidebar row", () => {
    expect(uiSource).toContain("translateText(content, language)");
    expect(translateText("好友发布了新动态", "ja")).toBe("友だちが新しい投稿を公開しました");
    expect(translateText("附近发布了新动态", "ja")).toBe("付近で新しい投稿が公開されました");
  });
});
