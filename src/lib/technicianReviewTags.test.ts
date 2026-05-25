import { describe, expect, it } from "vitest";
import { composeTechnicianReviewTags } from "./technicianReviewTags";

describe("composeTechnicianReviewTags", () => {
  it("keeps four special tags and appends customer custom tags", () => {
    expect(
      composeTechnicianReviewTags({
        specialTags: ["特別A", "特別B", "特別C", "特別D", "特別E"],
        fallbackTags: ["空调清洗"],
        customerCustomTags: ["沟通顺畅", "准时", "特別B"]
      })
    ).toEqual(["特別A", "特別B", "特別C", "特別D", "沟通顺畅", "准时"]);
  });

  it("falls back to service skills when no special tags are configured", () => {
    expect(
      composeTechnicianReviewTags({
        specialTags: [],
        fallbackTags: ["空调清洗", "修水管", "当日预约"],
        customerCustomTags: ["说明清楚"]
      })
    ).toEqual(["空调清洗", "修水管", "当日预约", "说明清楚"]);
  });
});
