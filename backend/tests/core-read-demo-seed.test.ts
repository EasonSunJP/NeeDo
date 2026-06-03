import { existsSync } from "node:fs";
import path from "node:path";
import {
  CORE_READ_DEMO_CATEGORY_SEEDS,
  CORE_READ_DEMO_SHOP_SEEDS,
  CORE_READ_DEMO_TECHNICIAN_SEEDS
} from "../prisma/seed";

const publicRoot = path.resolve(__dirname, "../../public");
const generatedPrefix = "/images/generated/";

function toPublicPath(url: string) {
  return path.join(publicRoot, url.replace(/^\//, ""));
}

function toThumbnailUrl(url: string) {
  if (!url.startsWith(generatedPrefix) || !/\.(?:jpe?g|png|webp)$/i.test(url)) {
    return null;
  }

  return `/images/generated/thumbnails/${url
    .slice(generatedPrefix.length)
    .replace(/\.(?:jpe?g|png|webp)$/i, ".jpg")}`;
}

describe("core read demo seed contract", () => {
  it("defines the requested demo shop and technician volume", () => {
    expect(CORE_READ_DEMO_SHOP_SEEDS).toHaveLength(10);
    expect(CORE_READ_DEMO_TECHNICIAN_SEEDS).toHaveLength(20);

    const shopSlugs = new Set(CORE_READ_DEMO_SHOP_SEEDS.map((shop) => shop.slug));
    const categoryCodes = new Set(CORE_READ_DEMO_CATEGORY_SEEDS.map((category) => category.code));

    expect(shopSlugs.size).toBe(CORE_READ_DEMO_SHOP_SEEDS.length);
    expect(
      CORE_READ_DEMO_TECHNICIAN_SEEDS.every((technician) => shopSlugs.has(technician.shopSlug))
    ).toBe(true);
    expect(
      CORE_READ_DEMO_TECHNICIAN_SEEDS.every((technician) =>
        categoryCodes.has(technician.categoryCode)
      )
    ).toBe(true);
  });

  it("uses local generated assets that exist with thumbnail counterparts", () => {
    const imageUrls = [
      ...CORE_READ_DEMO_CATEGORY_SEEDS.map((category) => category.iconUrl),
      ...CORE_READ_DEMO_SHOP_SEEDS.map((shop) => shop.coverUrl),
      ...CORE_READ_DEMO_TECHNICIAN_SEEDS.flatMap((technician) => [
        technician.avatarUrl,
        technician.service.coverUrl
      ])
    ];

    for (const url of imageUrls) {
      expect(existsSync(toPublicPath(url))).toBe(true);

      const thumbnailUrl = toThumbnailUrl(url);
      if (thumbnailUrl) {
        expect(existsSync(toPublicPath(thumbnailUrl))).toBe(true);
      }
    }
  });
});
