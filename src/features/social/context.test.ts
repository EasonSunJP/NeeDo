import { describe, expect, it } from "vitest";
import { resolveSocialActorKey } from "./context";
import type { SocialProfile } from "./types";

function makeProfile(id: string, entityType: SocialProfile["entityType"]): SocialProfile {
  return {
    id,
    entityType,
    displayName: id,
    handle: id,
    avatar: "",
    coverImage: "",
    bio: "",
    joinedAt: "2026-05-26T00:00:00.000Z",
    verifiedStatus: "none",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {}
  };
}

describe("resolveSocialActorKey", () => {
  it("maps formal numeric customer identities back to the existing social profile id", () => {
    const profiles = {
      "user:cus-1": makeProfile("cus-1", "user")
    };

    expect(
      resolveSocialActorKey({
        entityType: "user",
        fallbackId: "cus-1",
        legacyIdPrefix: "cus",
        linkedId: "1",
        profiles
      })
    ).toBe("user:cus-1");
  });

  it("falls back to the first local profile when the linked identity has no matching social profile", () => {
    const profiles = {
      "shop:store-1": makeProfile("store-1", "shop")
    };

    expect(
      resolveSocialActorKey({
        entityType: "shop",
        fallbackId: "store-1",
        legacyIdPrefix: "store",
        linkedId: "999",
        profiles
      })
    ).toBe("shop:store-1");
  });
});
