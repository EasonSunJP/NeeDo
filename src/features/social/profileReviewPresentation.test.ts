import { describe, expect, it } from "vitest";
import { getCustomerCustomProfileReviewTags } from "./profileReviewPresentation";

describe("getCustomerCustomProfileReviewTags", () => {
  it("filters shared special tags and keeps customer custom tags", () => {
    expect(
      getCustomerCustomProfileReviewTags([
        "魅力值MAX",
        "服务精神MAX",
        "情绪价值MAX",
        "元气MAX",
        "空调清洗",
        "修水管",
        "当日预约"
      ])
    ).toEqual(["空调清洗", "修水管", "当日预约"]);
  });

  it("normalizes slash separated legacy values", () => {
    expect(getCustomerCustomProfileReviewTags("魅力值MAX / 沟通清楚 / 准时")).toEqual(["沟通清楚", "准时"]);
  });
});
