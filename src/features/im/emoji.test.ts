// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  IM_COMMON_EMOJIS,
  IM_RECENT_EMOJI_LIMIT,
  loadRecentImEmojis,
  recordRecentImEmoji,
  saveRecentImEmojis,
} from "./emoji";

describe("IM emoji catalog and recent usage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("offers a broad standard Unicode catalog across common categories", () => {
    expect(IM_COMMON_EMOJIS.length).toBeGreaterThanOrEqual(120);
    expect(IM_COMMON_EMOJIS).toEqual(expect.arrayContaining([
      "😀", "🥹", "👍", "🙏", "❤️", "🔥", "🎉", "🌹", "☕", "⚽", "🚗", "💡"
    ]));
    expect(new Set(IM_COMMON_EMOJIS).size).toBe(IM_COMMON_EMOJIS.length);
  });

  it("keeps exactly the eight most recently used unique emojis", () => {
    const initial = loadRecentImEmojis();
    expect(initial).toHaveLength(IM_RECENT_EMOJI_LIMIT);

    const updated = recordRecentImEmoji(initial, "🎯");
    expect(updated).toHaveLength(IM_RECENT_EMOJI_LIMIT);
    expect(updated[0]).toBe("🎯");
    expect(recordRecentImEmoji(updated, "😀")[0]).toBe("😀");
    expect(recordRecentImEmoji(updated, "🎯").filter((emoji) => emoji === "🎯")).toHaveLength(1);
  });

  it("persists recent emoji order and safely ignores malformed or unknown values", () => {
    saveRecentImEmojis(["🔥", "✅", "not-an-emoji"]);
    expect(loadRecentImEmojis().slice(0, 2)).toEqual(["🔥", "✅"]);

    window.localStorage.setItem("needo.im.recent-emojis.v1", "{");
    expect(loadRecentImEmojis()).toHaveLength(IM_RECENT_EMOJI_LIMIT);
  });
});
