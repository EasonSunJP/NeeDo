import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ComposerMentionSelector, summarizeMentionCandidates } from "./UnifiedComposerUi";
import type { SocialMentionCandidate } from "../types";

const contacts: SocialMentionCandidate[] = [
  {
    userId: 52,
    needoId: "u0000000052",
    displayName: "小林さん",
    username: "小林 美咲",
    avatarUrl: "/media/customer-avatars/a.png",
    searchText: "小林さん 小林 美咲 u0000000052"
  },
  {
    userId: 74,
    needoId: "u0000000074",
    displayName: "佐藤 葵",
    username: "佐藤 葵",
    avatarUrl: "",
    searchText: "佐藤 葵 佐藤 葵 u0000000074"
  }
];

describe("ComposerMentionSelector", () => {
  it("renders formal contact identity fields and numeric selection state", () => {
    const markup = renderToStaticMarkup(
      <ComposerMentionSelector
        candidates={contacts}
        onBack={vi.fn()}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
        onToggle={vi.fn()}
        query=""
        selectedUserIds={[52]}
        status="ready"
      />
    );

    expect(markup).toContain("小林さん");
    expect(markup).toContain("@小林 美咲 · u0000000052");
    expect(markup).toContain("佐藤 葵");
    expect(markup).toContain("搜索联系人昵称、用户名或 NeeDoID");
  });

  it("distinguishes loading, failed, and empty-contact states", () => {
    const renderState = (status: "loading" | "ready" | "error") =>
      renderToStaticMarkup(
        <ComposerMentionSelector
          candidates={[]}
          onBack={vi.fn()}
          onQueryChange={vi.fn()}
          onRetry={vi.fn()}
          onToggle={vi.fn()}
          query=""
          selectedUserIds={[]}
          status={status}
        />
      );

    expect(renderState("loading")).toContain("正在加载联系人...");
    expect(renderState("error")).toContain("联系人加载失败，请重试。");
    expect(renderState("ready")).toContain("当前没有可提醒的联系人。");
  });

  it("summarizes selected contact names even though publish uses numeric user ids", () => {
    expect(summarizeMentionCandidates(contacts, [])).toBe("");
    expect(summarizeMentionCandidates(contacts, [52])).toBe("小林さん");
    expect(summarizeMentionCandidates(contacts, [52, 74])).toBe("小林さん 等 2 人");
    expect(summarizeMentionCandidates([], [52, 74])).toBe("2 人");
  });
});
