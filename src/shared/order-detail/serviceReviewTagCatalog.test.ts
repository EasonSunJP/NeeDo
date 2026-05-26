import { describe, expect, it } from "vitest";
import { serviceReviewSpecialTags, splitMaxReviewStampLabel } from "./serviceReviewTagCatalog";

describe("serviceReviewSpecialTags", () => {
  it("keeps the four post-service special MAX tags in order", () => {
    expect(serviceReviewSpecialTags).toEqual([
      { label: "魅力值MAX", count: 13, kind: "stamp", tone: "appeal" },
      { label: "服务精神MAX", count: 2, kind: "stamp", tone: "service" },
      { label: "情绪价值MAX", count: 1, kind: "stamp", tone: "empathy" },
      { label: "元气MAX", count: 1, kind: "stamp", tone: "energy" }
    ]);
  });
});

describe("splitMaxReviewStampLabel", () => {
  it("splits labels ending with MAX for stacked stamp display", () => {
    expect(splitMaxReviewStampLabel("魅力值MAX")).toEqual({
      title: "魅力值",
      marker: "MAX"
    });
  });
});
