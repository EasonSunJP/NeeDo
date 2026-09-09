import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { calendarParticipantTranslations } from "./calendar-participant-i18n";
import "./registerCalendarParticipantI18n";

describe("calendar participant translations", () => {
  it("keeps every participant-flow entry complete in the four target languages", () => {
    for (const entry of Object.values(calendarParticipantTranslations)) {
      expect(Object.keys(entry).sort()).toEqual(["en", "ja", "ko", "zh-Hant"]);
      expect(Object.values(entry).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("registers participant copy when the lazy workflow loads", () => {
    expect(translateText("选择参加者", "ja")).toBe("参加者を選択");
    expect(translateText("关闭参加者选择", "en")).toBe("Close participant selection");
    expect(translateText("完成选择", "en")).toBe("Finish selection");
    expect(translateText("我", "ja")).toBe("自分");
    expect(translateText("占用", "ko")).toBe("일정 있음");
  });
});
