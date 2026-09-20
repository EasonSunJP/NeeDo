import { describe, expect, it } from "vitest";
import source from "./SocialNotificationsPage.tsx?raw";
import { socialRouteTranslations } from "../route-i18n";

describe("SocialNotificationsPage", () => {
  it("shows only friend and nearby timeline updates", () => {
    expect(source).toContain("buildTimelineUpdateNotifications");
    expect(source).toContain('getTimelineFeed("friends", actorKey)');
    expect(source).toContain('getTimelineFeed("nearby", actorKey, nearbyLocationContext)');
    expect(source).not.toContain("getNotifications(actorKey)");
  });

  it("opens the corresponding post from every update", () => {
    expect(source).toContain("to={socialPaths.post(scope, item.postId)}");
    expect(source).toContain('title="动态通知"');
  });

  it.each([
    "好友发布了新动态",
    "附近发布了新动态",
    "附近与好友新动态",
    "附近或好友发布新动态后，会在这里提示。"
  ])("localizes the new timeline notice copy: %s", (copy) => {
    expect(Object.keys(socialRouteTranslations[copy] ?? {})).toEqual(["zh-Hant", "ja", "en", "ko"]);
  });
});
