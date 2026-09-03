import { describe, expect, it } from "vitest";
import { serviceReviewSpecialTags, splitMaxReviewStampLabel } from "./serviceReviewTagCatalog";

describe("serviceReviewSpecialTags", () => {
  it("keeps the four fixed post-service tags in order without fake counts", () => {
    expect(serviceReviewSpecialTags).toEqual([
      { label: "魅力max", count: 0, kind: "stamp", tone: "appeal" },
      { label: "服务max", count: 0, kind: "stamp", tone: "service" },
      { label: "情绪max", count: 0, kind: "stamp", tone: "empathy" },
      { label: "元气max", count: 0, kind: "stamp", tone: "energy" }
    ]);
  });
});

describe("splitMaxReviewStampLabel", () => {
  it("splits labels ending with max for stacked stamp display", () => {
    expect(splitMaxReviewStampLabel("魅力max")).toEqual({
      title: "魅力",
      marker: "max"
    });
  });
});
