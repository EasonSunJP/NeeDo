// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("IM shared recent reaction catalog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("migrates legacy recent emojis and mixes new judgement usage at the front", async () => {
    window.localStorage.setItem(
      "needo.im.recent-emojis.v1",
      JSON.stringify(["😂", "👍"])
    );
    const catalog = await import("./reaction-catalog");

    expect(catalog.getRecentImReactionSnapshot().slice(0, 2)).toEqual(["😂", "👍"]);
    expect(
      JSON.parse(window.localStorage.getItem("needo.im.recent-reactions.v2") ?? "[]").slice(0, 2)
    ).toEqual(["😂", "👍"]);
    catalog.recordRecentImReaction("Thanks");
    expect(catalog.getRecentImReactionSnapshot().slice(0, 3)).toEqual([
      "Thanks",
      "😂",
      "👍"
    ]);
    expect(JSON.parse(window.localStorage.getItem("needo.im.recent-reactions.v2") ?? "[]")).toEqual(
      catalog.getRecentImReactionSnapshot()
    );
  });

  it("keeps only eight valid unique judgement-or-emoji values", async () => {
    window.localStorage.setItem(
      "needo.im.recent-reactions.v2",
      JSON.stringify([
        "bad",
        "OK",
        "OK",
        "😂",
        "NO",
        "👍",
        "Done",
        "Cool",
        "Good",
        "Thanks",
        "❤️"
      ])
    );
    const catalog = await import("./reaction-catalog");

    expect(catalog.getRecentImReactionSnapshot()).toEqual([
      "OK",
      "😂",
      "NO",
      "👍",
      "Done",
      "Cool",
      "Good",
      "Thanks"
    ]);
  });
});
