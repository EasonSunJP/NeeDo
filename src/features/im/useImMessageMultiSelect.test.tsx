/** @vitest-environment jsdom */

import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "./model";
import {
  MAX_SELECTED_MESSAGES,
  POINTER_SCROLL_THRESHOLD_PX,
  buildImMessageMultiSelectCopyText,
  classifyPointerRelease,
  isImMessageMultiSelectEligible,
  selectRangeToViewportPoint,
  useImMessageMultiSelect,
} from "./useImMessageMultiSelect";

function message(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    clientSeq: 1,
    content: "message",
    conversationId: "41",
    id: "1",
    localId: "1",
    senderId: "8",
    sentAt: "2026-08-31T00:00:00.000Z",
    status: "sent",
    type: "text",
    ...overrides,
  };
}

describe("IM message multiselect geometry", () => {
  const rows = [
    { centerY: 120, eligible: true, id: "m1" },
    { centerY: 240, eligible: true, id: "m2" },
    { centerY: 360, eligible: true, id: "m3" },
    { centerY: 600, eligible: true, id: "m4" },
    { centerY: 720, eligible: true, id: "m5" },
  ];

  it("selects the canonical inclusive range from the anchor to the nearest upper row", () => {
    expect(selectRangeToViewportPoint({ anchorId: "m3", pointY: 120, rows })).toEqual(["m1", "m2", "m3"]);
  });

  it("selects the canonical inclusive range from the anchor to the nearest lower row", () => {
    expect(selectRangeToViewportPoint({ anchorId: "m3", pointY: 720, rows })).toEqual(["m3", "m4", "m5"]);
  });

  it("ignores ineligible and unrendered rows while preserving canonical order", () => {
    expect(selectRangeToViewportPoint({
      anchorId: "m3",
      pointY: 80,
      rows: [
        { centerY: 40, eligible: false, id: "system" },
        { centerY: null, eligible: true, id: "unrendered" },
        { centerY: 80, eligible: true, id: "m1" },
        { centerY: 160, eligible: false, id: "recalled" },
        { centerY: 240, eligible: true, id: "m3" },
      ],
    })).toEqual(["m1", "m3"]);
  });

  it("returns an empty range when the anchor is not eligible", () => {
    expect(selectRangeToViewportPoint({ anchorId: "system", pointY: 100, rows: [
      { centerY: 100, eligible: false, id: "system" },
      { centerY: 200, eligible: true, id: "m1" },
    ] })).toEqual([]);
  });
});

describe("IM message multiselect eligibility", () => {
  it("accepts only authoritative active non-private messages", () => {
    expect(isImMessageMultiSelectEligible(message())).toBe(true);
    expect(isImMessageMultiSelectEligible(message({ id: "local-1", localId: "local-1" }))).toBe(false);
    expect(isImMessageMultiSelectEligible(message({ type: "system" }))).toBe(false);
    expect(isImMessageMultiSelectEligible(message({ type: "recalled", status: "recalled" }))).toBe(false);
    expect(isImMessageMultiSelectEligible(message({ serverState: "recalled" }))).toBe(false);
    expect(isImMessageMultiSelectEligible(message({ contentPurgedAt: "2026-08-31T00:01:00.000Z" }))).toBe(false);
    expect(isImMessageMultiSelectEligible(message({ ext: { disappearing: { countdown: { days: 0, hours: 1, minutes: 0, months: 0 }, mode: "sent" } } }))).toBe(false);
  });

  it("defines the product selection and gesture limits", () => {
    expect(MAX_SELECTED_MESSAGES).toBe(100);
    expect(POINTER_SCROLL_THRESHOLD_PX).toBe(8);
  });
});

describe("IM message multiselect gesture arbitration", () => {
  it("classifies a drag or actual scroll as a scroll ending gesture", () => {
    expect(classifyPointerRelease({ movedPx: 12, scrollChanged: true, targetKind: "message" })).toBe("scroll-end");
    expect(classifyPointerRelease({ movedPx: 0, scrollChanged: true, targetKind: "message" })).toBe("scroll-end");
  });

  it("cancels only a stationary release outside controls", () => {
    expect(classifyPointerRelease({ movedPx: 0, scrollChanged: false, targetKind: "message" })).toBe("cancel-selection");
    expect(classifyPointerRelease({ movedPx: 0, scrollChanged: false, targetKind: "control" })).toBe("control");
  });
});

describe("IM message multiselect copy text", () => {
  it("uses chronological sender-prefixed rows, visible translations, and preserves multiline bodies", () => {
    const messages = [
      message({ id: "2", clientSeq: 2, senderId: "b", content: "second", sentAt: "2026-08-31T00:02:00.000Z" }),
      message({ id: "1", clientSeq: 1, senderId: "a", content: "line one\nline two", sentAt: "2026-08-31T00:01:00.000Z" }),
    ];
    expect(buildImMessageMultiSelectCopyText({
      messages,
      resolveDisplayedText: (item) => item.id === "2" ? "translated" : undefined,
      resolveSenderName: (item) => item.senderId.toUpperCase(),
      translate: (value) => value,
    })).toBe("A:line one\nline two\nB:translated");
  });

  it("uses localized stable media and card placeholders", () => {
    const messages = [
      message({ id: "1", type: "image", ext: {} }),
      message({ id: "2", type: "video", ext: {} }),
      message({ id: "3", type: "voice", ext: {} }),
      message({ id: "4", type: "file", ext: { fileName: "a.pdf" } }),
      message({ id: "5", type: "location", ext: { location: { address: "A", latitude: 0, longitude: 0, title: "车站" } } }),
      message({ id: "6", type: "contact-card", ext: { contactCard: { avatar: "", displayName: "张三", profileKind: "person", userId: "9" } } }),
      message({ id: "7", type: "service-card", ext: { serviceCard: { cover: "", name: "护理", priceLabel: "1", serviceId: "s", summary: "" } } }),
      message({ id: "8", type: "schedule-invite", ext: { scheduleInvite: { date: "2026-09-01", scheduleId: "s", timeRange: "10:00", title: "会面" } } }),
    ];
    expect(buildImMessageMultiSelectCopyText({
      messages,
      resolveSenderName: () => "A",
      translate: (value) => `t:${value}`,
    }).split("\n")).toEqual([
      "A:t:[图片]",
      "A:t:[视频]",
      "A:t:[语音]",
      "A:t:[文件] a.pdf",
      "A:t:[位置] 车站",
      "A:t:[名片] 张三",
      "A:t:[服务] 护理",
      "A:t:[日程邀请] 会面",
    ]);
  });
});

describe("useImMessageMultiSelect", () => {
  it("does not mutate the anchored selection when a viewport range exceeds 100 messages", async () => {
    const messages = Array.from({ length: 101 }, (_, index) => message({
      clientSeq: index + 1,
      id: String(index + 1),
      localId: String(index + 1),
      sentAt: new Date(Date.UTC(2026, 7, 31, 0, 0, index)).toISOString(),
    }));
    const messageRefs = {
      current: Object.fromEntries(messages.map((item, index) => {
        const element = document.createElement("div");
        element.getBoundingClientRect = () => new DOMRect(0, index * 20, 100, 18);
        return [item.id, element];
      })),
    };
    const scrollRoot = { current: document.createElement("div") };
    let latest!: ReturnType<typeof useImMessageMultiSelect>;

    function Harness() {
      const value = useImMessageMultiSelect({ messages, messageRefs, scrollRoot });
      useLayoutEffect(() => { latest = value; });
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => { latest.enter("1"); });
    let result!: ReturnType<typeof latest.selectToPoint>;
    await act(async () => { result = latest.selectToPoint(10_000); });
    expect(result).toEqual({ status: "overflow", max: 100 });
    expect([...latest.selectedIds]).toEqual(["1"]);
    await act(async () => root.unmount());
  });
});
