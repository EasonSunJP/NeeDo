import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SocialRepostPage.tsx", import.meta.url), "utf8");

describe("SocialRepostPage formal friend forwarding", () => {
  it("selects formal contacts and sends the post to one or more friends", () => {
    expect(source).toContain("loadFormalSocialMentionCandidates");
    expect(source).toContain("shareSocialPostToFriends");
    expect(source).toContain("targetUserIds");
    expect(source).toContain("选择好友");
    expect(source).toContain("发送给好友");
    expect(source).not.toContain("已转发到你的时间线");
    expect(source).not.toContain("快速转发会生成一条新的 repost item");
  });
});
