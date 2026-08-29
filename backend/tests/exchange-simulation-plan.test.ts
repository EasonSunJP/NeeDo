import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildExchangeSimulationPlan,
  type ExchangeSimulationActor
} from "../src/simulation/exchange-simulation-plan";
import { EXCHANGE_SIMULATION_NAMESPACE } from "../src/simulation/exchange-simulation.constants";

const actors = Array.from({ length: 90 }, (_, index): ExchangeSimulationActor => {
  const identityType =
    index % 4 === 0
      ? "technician"
      : index % 4 === 1
        ? "merchant_owner"
        : index % 4 === 2
          ? "merchant_staff"
          : "customer";
  return {
    userId: index + 1,
    identityId: index + 101,
    identityType,
    publicId: `${identityType === "customer" ? "u" : "s"}${String(index + 1).padStart(10, "0")}`,
    displayName: `正式测试账号 ${index + 1}`,
    avatarUrl: index % 3 === 0 ? null : `/images/avatars/test-${index + 1}.jpg`
  };
});

describe("formal Exchange simulation plan", () => {
  const plan = buildExchangeSimulationPlan(actors, "needo-exchange-2026-08-30");

  it("is byte-for-byte deterministic and never uses Math.random", () => {
    expect(buildExchangeSimulationPlan(actors, "needo-exchange-2026-08-30")).toEqual(plan);
    expect(JSON.stringify(buildExchangeSimulationPlan(actors, "needo-exchange-2026-08-30"))).toBe(
      JSON.stringify(plan)
    );
    const source = readFileSync(
      resolve(__dirname, "../src/simulation/exchange-simulation-plan.ts"),
      "utf8"
    );
    expect(source).not.toContain("Math.random");
  });

  it("contains exactly 20 demand and 20 intelligence posts with real eligible publishers", () => {
    expect(plan.posts).toHaveLength(40);
    expect(plan.posts.filter((post) => post.type === "demand")).toHaveLength(20);
    expect(plan.posts.filter((post) => post.type === "intelligence")).toHaveLength(20);
    const actorKeys = new Set(actors.map((actor) => `${actor.userId}:${actor.identityId}`));

    for (const post of plan.posts) {
      expect(actorKeys).toContain(`${post.author.userId}:${post.author.identityId}`);
      expect(post.idempotencyKey.startsWith(EXCHANGE_SIMULATION_NAMESPACE)).toBe(true);
      if (post.type === "demand") {
        expect(post.author.identityType).toBe("customer");
        expect(post.demand).not.toBeNull();
        expect(post.intelligence).toBeNull();
      } else {
        expect(["technician", "merchant", "merchant_owner", "merchant_staff"]).toContain(
          post.author.identityType
        );
        expect(post.demand).toBeNull();
        expect(post.intelligence).not.toBeNull();
      }
    }
  });

  it("gives every post the requested actor-linked random interaction ranges", () => {
    const actorKeys = new Set(actors.map((actor) => `${actor.userId}:${actor.identityId}`));
    const countTriples = new Set<string>();

    for (const post of plan.posts) {
      expect(post.comments.length).toBeGreaterThanOrEqual(3);
      expect(post.comments.length).toBeLessThanOrEqual(10);
      expect(post.likes.length).toBeGreaterThanOrEqual(10);
      expect(post.likes.length).toBeLessThanOrEqual(66);
      expect(post.shares.length).toBeGreaterThanOrEqual(2);
      expect(post.shares.length).toBeLessThanOrEqual(15);
      expect(new Set(post.likes.map((like) => like.actor.userId)).size).toBe(post.likes.length);
      expect(new Set(post.shares.map((share) => share.actor.userId)).size).toBe(post.shares.length);
      for (const interaction of [...post.comments, ...post.likes, ...post.shares]) {
        expect(actorKeys).toContain(`${interaction.actor.userId}:${interaction.actor.identityId}`);
        expect(new Date(interaction.createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(post.createdAt).getTime()
        );
      }
      countTriples.add(`${post.comments.length}:${post.likes.length}:${post.shares.length}`);
    }
    expect(countTriples.size).toBeGreaterThan(10);
  });

  it("uses explicit authored locales and plausible deterministic service windows", () => {
    const locales = new Set(plan.posts.map((post) => post.contentLocale));
    expect(locales).toEqual(new Set(["zh-CN", "zh-TW", "en", "ja", "ko"]));
    for (const post of plan.posts) {
      const createdAt = new Date(post.createdAt).getTime();
      const serviceStartAt = new Date(post.serviceStartAt).getTime();
      const serviceEndAt = new Date(post.serviceEndAt).getTime();
      const expiresAt = new Date(post.expiresAt).getTime();
      expect(createdAt).toBeLessThan(serviceStartAt);
      expect(serviceStartAt).toBeLessThan(serviceEndAt);
      expect(serviceEndAt).toBeLessThanOrEqual(expiresAt);
      expect(post.title.trim()).toBe(post.title);
      expect(post.detail.trim()).toBe(post.detail);
    }
  });

  it("fails closed before planning when unique actor capacity is insufficient", () => {
    expect(() => buildExchangeSimulationPlan(actors.slice(0, 66), "too-small")).toThrow(
      "at least 67 eligible real test actors"
    );
    expect(() =>
      buildExchangeSimulationPlan(
        actors.map((actor) => ({ ...actor, identityType: "customer" })),
        "missing-intelligence"
      )
    ).toThrow("intelligence publisher");
  });
});
