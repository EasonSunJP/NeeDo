import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { shopMembershipTranslations } from "./i18n";

describe("shop membership feature translations", () => {
  it("provides every feature phrase in all four target languages", () => {
    expect(Object.keys(shopMembershipTranslations).length).toBeGreaterThan(40);
    for (const entry of Object.values(shopMembershipTranslations)) {
      expect(entry["zh-Hant"]?.trim()).toBeTruthy();
      expect(entry.ja?.trim()).toBeTruthy();
      expect(entry.en?.trim()).toBeTruthy();
      expect(entry.ko?.trim()).toBeTruthy();
    }
  });

  it("registers feature-local translations with the shared runtime translator", () => {
    expect(translateText("我的会员", "ja")).toBe("マイ会員");
    expect(translateText("查看已加入店铺与会员卡状态", "en")).toBe(
      "View joined stores and membership card status"
    );
    expect(translateText("暂无会员卡", "ko")).toBe("회원 카드가 없습니다");
  });
});
