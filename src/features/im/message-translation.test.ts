import { describe, expect, it } from "vitest";
import {
  getImMessageDisplayParts,
  getImMessageDisplayText
} from "./message-translation";
import type { MessageExt } from "./model";

describe("IM message display translation", () => {
  it("keeps disabled message text unchanged", () => {
    expect(getImMessageDisplayText("测试测试", undefined, {
      enabled: false,
      language: "ja"
    })).toBe("测试测试");
  });

  it("translates enabled message text without changing unknown free text or whitespace", () => {
    expect(getImMessageDisplayText("测试测试", undefined, {
      enabled: true,
      language: "ja"
    })).toBe("テストテスト");
    expect(getImMessageDisplayText("  free text  ", undefined, {
      enabled: true,
      language: "ja"
    })).toBe("  free text  ");
  });

  it("translates only rich text segments and preserves judgement tokens without mutating raw input", () => {
    const richText: MessageExt["richText"] = {
      version: 1,
      parts: [
        { type: "judgement", value: "Done" },
        { type: "text", value: "测试" },
        { type: "judgement", value: "OK" }
      ]
    };
    const originalParts = richText.parts.map((part) => ({ ...part }));

    expect(getImMessageDisplayParts("Done测试OK", richText, {
      enabled: true,
      language: "ja"
    })).toEqual([
      { type: "judgement", value: "Done" },
      { type: "text", value: "テスト" },
      { type: "judgement", value: "OK" }
    ]);
    expect(getImMessageDisplayText("Done测试OK", richText, {
      enabled: true,
      language: "ja"
    })).toBe("DoneテストOK");
    expect(richText.parts).toEqual(originalParts);
  });
});
