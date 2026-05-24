import { describe, expect, it } from "vitest";
import { userStories } from "../../data/mock";
import source from "./UserCenterPage.tsx?raw";

describe("UserCenterPage", () => {
  it("does not show savings badges in recent user feedback", () => {
    expect(source).toContain("近期用户反馈");
    expect(source).not.toMatch(/<Badge[^>]*>已省/);
  });

  it("does not show the service guarantee section", () => {
    expect(source).not.toContain('title="服务保障"');
    expect(source).not.toContain("serviceGuarantees.map");
  });

  it("renders commenter avatars in recent user feedback", () => {
    expect(
      userStories.every((story) => {
        const avatar = (story as { avatar?: unknown }).avatar;
        return typeof avatar === "string" && avatar.length > 0;
      })
    ).toBe(true);
    expect(source).toContain("story.avatar");
    expect(source).toContain("`${story.name}头像`");
  });
});
