import source from "../scripts/fixtures/stagingtest-public-source-20260924.json";
import { CONTENT_LOCALES } from "../src/constants/content-locales";
import { buildStagingTestFiveLocaleContent } from "../scripts/fixtures/build-stagingtest-five-locale-content";

describe("StagingTest five-locale content", () => {
  it("covers the shop, every menu, and every published technician service", () => {
    const content = buildStagingTestFiveLocaleContent(source);
    expect(content.counts).toEqual({
      shopLocales: 5,
      shopMenus: 3,
      technicians: 26,
      techniciansWithBio: 21,
      techniciansWithoutBio: 5,
      technicianServices: 52
    });
    expect(Object.keys(content.shopLocales).sort()).toEqual([...CONTENT_LOCALES].sort());
    for (const locale of CONTENT_LOCALES) {
      expect(content.shopLocales[locale].serviceMenus).toHaveLength(3);
      expect(content.shopLocales[locale].serviceMenus.map((menu) => menu.serviceId)).toEqual([79, 80, 81]);
      expect(content.shopLocales[locale].carousel.map((slide) => slide.mediaAssetPublicId)).toEqual(
        source.shop.presentationContent.carousel.map((slide) => slide.mediaAssetPublicId)
      );
      expect(content.shopLocales[locale].serviceMenus.every((menu) => menu.name.trim() && menu.description.trim())).toBe(true);
      for (const technician of content.technicians) {
        expect(technician.services.every((service) => {
          const translation = service.localizedContent[locale];
          return translation.name.trim() && translation.description.trim();
        })).toBe(true);
        expect(technician.bioLocales[locale]?.trim()).toBeTruthy();
      }
    }
    expect(content.shopLocales.ja).toEqual(source.shop.presentationContent);
    expect(content.shopLocales.en.description).not.toEqual(content.shopLocales.ja.description);
    expect(content.shopLocales.en.serviceMenus[0]?.name).not.toEqual(content.shopLocales.ja.serviceMenus[0]?.name);
  });

  it("rejects changed source data instead of silently applying stale translations", () => {
    const changed = structuredClone(source);
    changed.technicians[0]!.services[0]!.name = "Untranslated new service";
    expect(() => buildStagingTestFiveLocaleContent(changed)).toThrow("service text");
    const changedDescription = structuredClone(source);
    changedDescription.shop.presentationContent.serviceMenus[0]!.description = "Changed source description";
    expect(() => buildStagingTestFiveLocaleContent(changedDescription)).toThrow("shop menu 79 text");
  });
});
