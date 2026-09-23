import { describe, expect, it } from "vitest";
import { localizedServiceName } from "./localizedText";

describe("localizedServiceName", () => {
  const service = {
    name: "全身もみほぐし 60分",
    localizedContent: {
      "zh-CN": { name: "全身放松按摩 60分钟" },
      en: { name: "Full-Body Massage · 60 min" },
      ja: { name: "全身もみほぐし 60分" }
    }
  };

  it("uses the requested service locale", () => {
    expect(localizedServiceName(service, "zh")).toBe("全身放松按摩 60分钟");
    expect(localizedServiceName(service, "en")).toBe("Full-Body Massage · 60 min");
  });

  it("falls back to the source when a locale is missing", () => {
    expect(localizedServiceName(service, "ko")).toBe(service.name);
  });
});
