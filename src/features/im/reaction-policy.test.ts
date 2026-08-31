import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import * as reactionPolicy from "./reaction-policy";

import {
  encodeImComposerJudgement,
  deriveCurrentUserReactionSlots,
  getImReactionCategory,
  getImReactionFailureMessage,
  isImReactionChoiceDisabled,
  materializeImComposerDraft,
  parseImComposerDraft,
  sortImReactionSummaries
} from "./reaction-policy";

describe("IM reaction policy", () => {
  it("serializes judgement draft tokens into persisted rich message parts", () => {
    const serialize = (
      reactionPolicy as typeof reactionPolicy & {
        serializeImComposerMessage?: (draft: string) => unknown;
        restoreImComposerDraft?: (content: string, richText: unknown) => string;
      }
    ).serializeImComposerMessage;
    const restore = (
      reactionPolicy as typeof reactionPolicy & {
        restoreImComposerDraft?: (content: string, richText: unknown) => string;
      }
    ).restoreImComposerDraft;

    expect(serialize).toBeTypeOf("function");
    expect(restore).toBeTypeOf("function");
    if (!serialize || !restore) return;

    const draft = `确认${encodeImComposerJudgement("OK")}😂${encodeImComposerJudgement("Pending")}`;

    const serialized = serialize(draft) as {
      content: string;
      richText?: unknown;
    };

    expect(serialized).toEqual({
      content: "确认OK😂Pending",
      richText: {
        version: 1,
        parts: [
          { type: "text", value: "确认" },
          { type: "judgement", value: "OK" },
          { type: "text", value: "😂" },
          { type: "judgement", value: "Pending" }
        ]
      }
    });
    expect(restore(serialized.content, serialized.richText)).toBe(draft);
  });

  it("normalizes only complete version-one judgement rich text metadata", () => {
    const normalize = (
      reactionPolicy as typeof reactionPolicy & {
        normalizeImMessageRichText?: (content: string, richText: unknown) => unknown;
      }
    ).normalizeImMessageRichText;

    expect(normalize).toBeTypeOf("function");
    if (!normalize) return;

    expect(normalize("确认Pending", {
      version: 1,
      parts: [
        { type: "text", value: "确认" },
        { type: "judgement", value: "Pending" }
      ]
    })).toEqual({
      version: 1,
      parts: [
        { type: "text", value: "确认" },
        { type: "judgement", value: "Pending" }
      ]
    });
    expect(normalize("确认Pending", {
      version: 1,
      parts: [{ type: "text", value: "确认Pending" }]
    })).toBeUndefined();
  });

  it("keeps judgement choices as opaque draft tokens and materializes them for sending", () => {
    const okToken = encodeImComposerJudgement("OK");
    const pendingToken = encodeImComposerJudgement("Pending");
    const draft = `确认${okToken}😂${pendingToken}`;

    expect(okToken).not.toBe("OK");
    expect(pendingToken).not.toBe("Pending");
    expect(parseImComposerDraft(draft)).toEqual([
      { type: "text", value: "确认" },
      { type: "judgement", token: okToken, value: "OK" },
      { type: "text", value: "😂" },
      { type: "judgement", token: pendingToken, value: "Pending" }
    ]);
    expect(materializeImComposerDraft(draft)).toBe("确认OK😂Pending");
  });

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
