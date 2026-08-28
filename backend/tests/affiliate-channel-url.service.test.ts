import { AffiliateChannelUrlService } from "../src/services/affiliate-channel-url.service";
import {
  affiliateChannelCreateBodySchema,
  affiliateChannelUpdateBodySchema,
  affiliateProfileUpdateBodySchema
} from "../src/validators/affiliate-profile.validator";

describe("AffiliateChannelUrlService", () => {
  const service = new AffiliateChannelUrlService();

  it.each([
    ["x", "https://x.com/needo", "https://x.com/needo"],
    ["instagram", "https://Instagram.com/needo/#bio", "https://instagram.com/needo/"],
    ["youtube", "https://www.youtube.com/@needo", "https://www.youtube.com/@needo"],
    ["tiktok", "https://www.tiktok.com/@needo", "https://www.tiktok.com/@needo"],
    ["custom", "https://creator.example/profile", "https://creator.example/profile"]
  ] as const)("normalizes a valid %s homepage", (platform, input, expected) => {
    expect(service.normalize(platform, input)).toBe(expected);
  });

  it("accepts the legacy Twitter hostname for the X platform", () => {
    expect(service.normalize("x", "https://twitter.com/needo")).toBe("https://twitter.com/needo");
  });

  it.each([
    ["instagram", "https://example.com/needo", "error.affiliate_profile.channel_domain_invalid"],
    ["youtube", "https://youtube.example/@needo", "error.affiliate_profile.channel_domain_invalid"],
    ["custom", "http://example.com/profile", "error.affiliate_profile.channel_url_invalid"],
    [
      "custom",
      "https://user:secret@example.com/profile",
      "error.affiliate_profile.channel_url_invalid"
    ],
    ["custom", "https://localhost/profile", "error.affiliate_profile.channel_url_invalid"],
    ["custom", "https://127.0.0.1/profile", "error.affiliate_profile.channel_url_invalid"],
    ["custom", "https://192.168.1.5/profile", "error.affiliate_profile.channel_url_invalid"],
    ["custom", "https://[::1]/profile", "error.affiliate_profile.channel_url_invalid"]
  ] as const)("rejects unsafe or mismatched URL %s %s", (platform, input, message) => {
    expect(() => service.normalize(platform, input)).toThrow(message);
  });

  it("converts malformed URLs into the public validation error", () => {
    expect(() => service.normalize("custom", "not a URL")).toThrow(
      "error.affiliate_profile.channel_url_invalid"
    );
  });
});

describe("affiliate profile validators", () => {
  it("requires one mutable profile field beside the version", () => {
    expect(affiliateProfileUpdateBodySchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(
      affiliateProfileUpdateBodySchema.safeParse({ expectedVersion: 1, bio: "美容紹介" }).success
    ).toBe(true);
  });

  it("requires a label for custom channels", () => {
    const result = affiliateChannelCreateBodySchema.safeParse({
      expectedProfileVersion: 1,
      platform: "custom",
      homepageUrl: "https://creator.example/profile",
      sortOrder: 0
    });

    expect(result.success).toBe(false);
  });

  it("rejects a custom label for preset channels", () => {
    const result = affiliateChannelCreateBodySchema.safeParse({
      expectedProfileVersion: 1,
      platform: "instagram",
      customLabel: "Photo",
      homepageUrl: "https://instagram.com/needo",
      sortOrder: 0
    });

    expect(result.success).toBe(false);
  });

  it("allows a partial channel update for service-level merged validation", () => {
    expect(
      affiliateChannelUpdateBodySchema.safeParse({
        expectedProfileVersion: 2,
        homepageUrl: "https://instagram.com/needo-new"
      }).success
    ).toBe(true);
    expect(affiliateChannelUpdateBodySchema.safeParse({ expectedProfileVersion: 2 }).success).toBe(
      false
    );
  });
});
