import { describe, expect, it } from "vitest";
import { adminSystemSettingsCopy, adminSystemSettingsText } from "./i18n";

describe("system settings localization", () => {
  it("defines every workspace label in all five UI languages", () => {
    expect(Object.keys(adminSystemSettingsCopy).sort()).toEqual(["en", "ja", "ko", "zh", "zh-Hant"].sort());
    for (const copy of Object.values(adminSystemSettingsCopy)) {
      expect(copy.tabs).toHaveLength(5);
      expect(copy.title).toBeTruthy();
      expect(copy.save).toBeTruthy();
    }
  });

  it("localizes the critical behavior descriptions instead of leaking Chinese", () => {
    expect(adminSystemSettingsText("线下支付", "en")).toBe("Offline payment");
    expect(adminSystemSettingsText("新 IP 地址登录时也发送验证码（可与上方时间规则组合）", "ja")).toContain("IP");
    expect(adminSystemSettingsText("此规则只清理服务器保存的数据，并仅对保存后的新规则生效；不会删除用户设备本地的聊天记录或媒体缓存。", "ko")).not.toContain("不会删除");
  });
});
