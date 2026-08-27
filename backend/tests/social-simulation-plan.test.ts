import { buildSocialSimulationPlan } from "../src/simulation/social-simulation-plan";
import { SIMULATION_NAMESPACE } from "../src/simulation/three-month-simulation-plan";

describe("formal social simulation plan", () => {
  const plan = buildSocialSimulationPlan();
  const { accounts, posts, friendships } = plan;

  it("creates 15 deterministic realistic posts for every exported test account", () => {
    expect(accounts).toHaveLength(215);
    expect(new Set(accounts.map((account) => account.email)).size).toBe(accounts.length);
    expect(posts).toHaveLength(accounts.length * 15);
    for (const account of accounts) {
      const accountPosts = posts.filter((post) => post.authorKey === account.key);
      expect(accountPosts).toHaveLength(15);
      expect(new Set(accountPosts.map((post) => post.kind))).toEqual(
        new Set(["text", "single_image", "multi_image", "quote", "video"])
      );
    }
    expect(buildSocialSimulationPlan()).toEqual(plan);
  });

  it("uses durable local images, a playable https video and simulation ownership markers", () => {
    const mediaItems = posts.flatMap((post) => post.media.items);
    const images = mediaItems.filter((item) => item.type === "image");
    const videos = mediaItems.filter((item) => item.type === "video");

    expect(images.length).toBeGreaterThanOrEqual(6);
    expect(images.every((item) => item.url.startsWith("/images/generated/"))).toBe(true);
    expect(videos.length).toBe(accounts.length * 3);
    expect(videos[0]?.url).toMatch(/^https:\/\//);
    expect(mediaItems.some((item) => item.url.startsWith("blob:"))).toBe(false);
    expect(
      posts.every(
        (post) =>
          post.media.namespace === SIMULATION_NAMESPACE &&
          post.media.dataset === "social"
      )
    ).toBe(true);
  });

  it("includes the shared formal preview customer and valid quote references", () => {
    expect(posts.some((post) => post.authorKey === "formal-preview-customer")).toBe(true);
    const keys = new Set(posts.map((post) => post.key));
    const quotes = posts.filter((post) => post.kind === "quote");
    expect(quotes.length).toBeGreaterThanOrEqual(2);
    expect(quotes.every((post) => post.quotePostKey && keys.has(post.quotePostKey))).toBe(true);
  });

  it("includes the operations super administrator as an explicit formal test account", () => {
    expect(accounts).toContainEqual(
      expect.objectContaining({
        accountType: "admin",
        email: "admin@lifedance.com",
        socialType: "shop"
      })
    );
  });

  it("gives every account 36 mutual friends across shops, technicians and customers", () => {
    const typeByKey = new Map(accounts.map((account) => [account.key, account.socialType]));
    const friendsByKey = new Map(accounts.map((account) => [account.key, new Set<string>()]));
    for (const friendship of friendships) {
      friendsByKey.get(friendship.leftKey)?.add(friendship.rightKey);
      friendsByKey.get(friendship.rightKey)?.add(friendship.leftKey);
    }

    for (const account of accounts) {
      const friends = [...(friendsByKey.get(account.key) ?? [])];
      expect(friends).toHaveLength(36);
      const friendTypes = new Set(friends.map((key) => typeByKey.get(key)));
      expect(friendTypes).toEqual(new Set(["shop", "technician", "user"]));
    }
  });
});
