import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compareMessageReactionCategories,
  getMessageReactionCategory,
  MESSAGE_JUDGEMENT_REACTIONS
} from "../src/constants/message-reaction.constants";

describe("message reaction policy", () => {
  it.each(["OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"])(
    "classifies %s as judgement",
    (value) => {
      expect(getMessageReactionCategory(value)).toBe("judgement");
    }
  );

  it.each(["😂", "👍", "❤️"])("classifies %s as emoji", (value) => {
    expect(getMessageReactionCategory(value)).toBe("emoji");
  });

  it("keeps the contract values and judgement-first order stable", () => {
    expect(MESSAGE_JUDGEMENT_REACTIONS).toEqual([
      "OK",
      "NO",
      "Pending",
      "+1",
      "Done",
      "Cool",
      "Good",
      "Thanks"
    ]);
    expect(["😂", "Thanks", "OK"].sort(compareMessageReactionCategories)).toEqual([
      "Thanks",
      "OK",
      "😂"
    ]);
  });

  it("keeps the frontend judgement contract in sync", () => {
    const frontendPolicy = readFileSync(
      resolve(__dirname, "../../src/features/im/reaction-policy.ts"),
      "utf8"
    );

    for (const value of MESSAGE_JUDGEMENT_REACTIONS) {
      expect(frontendPolicy).toContain(`"${value}"`);
    }
  });
});
