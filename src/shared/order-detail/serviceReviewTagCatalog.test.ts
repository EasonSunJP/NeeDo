import { describe, expect, it } from "vitest";
import {
  serviceReviewSpecialTags,
  serviceReviewStampVisuals,
  splitMaxReviewStampLabel
} from "./serviceReviewTagCatalog";

describe("serviceReviewSpecialTags", () => {
  it("keeps the four approved technician max tags in order without fake counts", () => {
    expect(serviceReviewSpecialTags).toEqual([
      { label: "魅力max", count: 0, kind: "stamp", tone: "appeal" },
      { label: "服务max", count: 0, kind: "stamp", tone: "service" },
      { label: "情绪max", count: 0, kind: "stamp", tone: "empathy" },
      { label: "元气max", count: 0, kind: "stamp", tone: "energy" }
    ]);
    expect(serviceReviewStampVisuals).toEqual([
      { iconSrc: "/images/generated/ui/review-stamp-appeal.svg", tone: "appeal" },
      { iconSrc: "/images/generated/ui/review-stamp-service.svg", tone: "service" },
      { iconSrc: "/images/generated/ui/review-stamp-empathy.svg", tone: "empathy" },
      { iconSrc: "/images/generated/ui/review-stamp-energy.svg", tone: "energy" }
    ]);
  });
});

describe("splitMaxReviewStampLabel", () => {
  it("splits the lowercase max suffix for stacked stamp display", () => {
    expect(splitMaxReviewStampLabel("魅力max")).toEqual({ title: "魅力", marker: "max" });
  });
});
