import { describe, expect, it } from "vitest";
import { technicians } from "../data/mock";
import { serviceReviewSpecialTags } from "../shared/order-detail/serviceReviewTagCatalog";
import { getTechnicianReviewDisplayTags } from "./detailProfiles";

describe("getTechnicianReviewDisplayTags", () => {
  it("starts with the shared four special MAX tags and appends customer custom tags", () => {
    const technician = technicians.find((item) => item.id === "tech-2");

    expect(technician).toBeDefined();
    expect(getTechnicianReviewDisplayTags(technician!)).toEqual([
      ...serviceReviewSpecialTags.map((tag) => tag.label),
      "技术熟练",
      "说明清楚",
      "效率稳定"
    ]);
  });
});
