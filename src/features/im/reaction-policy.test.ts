import { describe, expect, it } from "vitest";

import {
  deriveCurrentUserReactionSlots,
  getImReactionCategory,
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
});
