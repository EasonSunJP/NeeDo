import { describe, expect, it } from "vitest";
import {
  favoriteTabs,
  groupFavoritesByTokyoDate,
  sortFavorites,
  type UnifiedFavoriteItem,
} from "./model";

function row(
  key: string,
  activityAt: string,
  pinnedAt: string | null = null,
): UnifiedFavoriteItem {
  return {
    key,
    type: "shop",
    itemKey: key,
    title: key,
    summary: null,
    imageUrl: null,
    detailPath: `/stores/${key}`,
    favoritedAt: activityAt,
    activityAt,
    pinnedAt,
    reaction: null,
    canForward: true,
    canDelete: true,
  };
}

describe("favorites timeline model", () => {
  it("defines the six product tabs in display order", () => {
    expect(favoriteTabs).toEqual([
      "all",
      "shop",
      "technician",
      "service",
      "social_post",
      "chat_record",
    ]);
  });

  it("sorts pinned items before activity time and uses the key as a stable tie-break", () => {
    expect(
      sortFavorites([
        row("shop:z", "2026-09-20T09:00:00.000Z"),
        row("shop:b", "2026-09-19T09:00:00.000Z"),
        row("service:pinned", "2026-09-18T09:00:00.000Z", "2026-09-20T10:00:00.000Z"),
        row("shop:a", "2026-09-19T09:00:00.000Z"),
      ]).map((item) => item.key),
    ).toEqual(["service:pinned", "shop:z", "shop:a", "shop:b"]);
  });

  it("groups today and yesterday by Tokyo calendar date across the UTC boundary", () => {
    const groups = groupFavoritesByTokyoDate(
      [
        row("today", "2026-09-20T15:05:00.000Z"),
        row("yesterday", "2026-09-20T14:59:00.000Z"),
        row("older", "2026-09-19T04:00:00.000Z"),
      ],
      new Date("2026-09-20T15:30:00.000Z"),
      "zh",
    );

    expect(groups.map((group) => group.label)).toEqual([
      "今天",
      "昨天",
      "2026年09月19日",
    ]);
  });
});
