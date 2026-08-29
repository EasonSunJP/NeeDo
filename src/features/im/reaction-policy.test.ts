import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";

import {
  deriveCurrentUserReactionSlots,
  getImReactionCategory,
  getImReactionFailureMessage,
  isImReactionChoiceDisabled,
  sortImReactionSummaries
} from "./reaction-policy";

describe("IM reaction policy", () => {
  it("derives one independent judgement and emoji slot", () => {
    expect(
      deriveCurrentUserReactionSlots(
        {
          OK: [{ id: "7" }],
          "😂": [{ id: "7" }],
          "👍": [{ id: "8" }]
        },
        "7"
      )
    ).toEqual({ judgement: "OK", emoji: "😂" });
  });

  it("disables only unselected values in an occupied category", () => {
    expect(isImReactionChoiceDisabled("NO", "OK", false)).toBe(true);
    expect(isImReactionChoiceDisabled("OK", "OK", false)).toBe(false);
    expect(isImReactionChoiceDisabled("😂", undefined, false)).toBe(false);
    expect(isImReactionChoiceDisabled("OK", "OK", true)).toBe(true);
  });

  it("orders judgement summaries before emoji summaries", () => {
    expect(sortImReactionSummaries([{ emoji: "😂" }, { emoji: "Thanks" }])).toEqual([
      { emoji: "Thanks" },
      { emoji: "😂" }
    ]);
    expect(getImReactionCategory("+1")).toBe("judgement");
  });

  it("maps occupied slots, rate limits, and unknown failures to explicit copy", () => {
    expect(
      getImReactionFailureMessage(
        new ApiClientError("error.im.reaction_slot_occupied", 40946, 409)
      )
    ).toBe("请先取消已发送的同类回复");
    expect(
      getImReactionFailureMessage(new ApiClientError("error.rate_limit", 42903, 429))
    ).toBe("操作过于频繁，请稍后重试");
    expect(getImReactionFailureMessage(new Error("network"))).toBe(
      "回复操作失败，请稍后重试"
    );
  });
});
