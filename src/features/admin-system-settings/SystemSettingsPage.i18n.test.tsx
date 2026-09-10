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
    expect(adminSystemSettingsText("随时服务测试", "ja")).toBe("いつでもサービスをテスト");
    expect(adminSystemSettingsText("下载当前图片", "zh-Hant")).toBe("下載目前圖片");
    expect(adminSystemSettingsText("下载当前图片", "ja")).toBe("現在の画像をダウンロード");
    expect(adminSystemSettingsText("下载当前图片", "en")).toBe("Download current image");
    expect(adminSystemSettingsText("下载当前图片", "ko")).toBe("현재 이미지 다운로드");
    expect(
      adminSystemSettingsText(
        "开启后可忽略预约时间开始和完成服务，仅用于测试；关闭后最多提前 30 分钟开始，并须在服务结束时间后完成。",
        "en"
      )
    ).toContain("30 minutes");
  });
});
