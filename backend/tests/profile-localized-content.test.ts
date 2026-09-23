import { mergeLocalizedBio, mergeLocalizedService } from "../src/domain/technician-localized-content";
import { customerProfileUpdateBodySchema } from "../src/validators/customer-profile.validator";
import { merchantProfileUpdateBodySchema } from "../src/validators/merchant-profile.validator";
import { technicianProfileUpdateBodySchema } from "../src/validators/technician-profile.validator";
import { technicianServiceBodySchema } from "../src/validators/pricing-mode.validator";

describe("localized profile content", () => {
  it("copies Japanese bio verbatim into all five locale slots", () => {
    expect(mergeLocalizedBio({ en: "Old" }, { locale: "ja", bio: "日本語だけで対応します", syncAll: true })).toEqual({
      "zh-CN": "日本語だけで対応します",
      "zh-TW": "日本語だけで対応します",
      ja: "日本語だけで対応します",
      en: "日本語だけで対応します",
      ko: "日本語だけで対応します"
    });
  });

  it("keeps other service locales on a single-locale edit", () => {
    expect(mergeLocalizedService({ en: { name: "Old", description: "Old description" } }, { locale: "ja", name: "施術", description: "説明" })).toEqual({
      en: { name: "Old", description: "Old description" },
      ja: { name: "施術", description: "説明" }
    });
  });

  it("copies the complete source service slot when a partial edit is synchronized", () => {
    const result = mergeLocalizedService({ ja: { name: "旧名", description: "既存の説明" }, en: { name: "Old" } }, {
      locale: "ja", name: "新名", syncAll: true
    });
    expect(result.en).toEqual({ name: "新名", description: "既存の説明" });
    expect(result.ko).toEqual({ name: "新名", description: "既存の説明" });
  });

  it("accepts sync-all Japanese text for each profile identity and technician services", () => {
    for (const schema of [customerProfileUpdateBodySchema, merchantProfileUpdateBodySchema, technicianProfileUpdateBodySchema]) {
      expect(schema.safeParse({ localizedBio: { locale: "ja", bio: "日本語で対応します", syncAll: true } }).success).toBe(true);
    }
    expect(technicianServiceBodySchema.partial().safeParse({ localizedContent: { locale: "ja", name: "施術", description: "日本語で対応します", syncAll: true } }).success).toBe(true);
  });
});
