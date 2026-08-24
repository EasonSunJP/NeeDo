import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantAdminSettingsPage.tsx", import.meta.url), "utf8");

describe("MerchantAdminSettingsPage formal shop profile", () => {
  it("loads and updates only the authenticated merchant shop API", () => {
    expect(source).toContain("backofficeRealDataApi.merchantShop()");
    expect(source).toContain("backofficeRealDataApi.updateMerchantShop(");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("updateStoreEntity");
    expect(source).not.toContain("merchantAdminDemo");
  });

  it("does not pretend unsupported media or presentation changes are persisted", () => {
    expect(source).not.toContain("readImageFileAsDataUrl");
    expect(source).not.toContain("ImageGalleryManager");
    expect(source).not.toContain("normalizeStorePresentationConfig");
    expect(source).not.toContain("已同步前台");
    expect(source).toContain("图片与轮播尚未启用");
    expect(source).toContain("营业时段尚未启用");
    expect(source).toContain("证照与展示装修尚未启用");
    expect(source).toContain("地图、导航与 eKYC 尚未启用");
  });

  it("shows loading, empty, failure, reset, and saved states", () => {
    expect(source).toContain("正在读取当前店铺正式资料");
    expect(source).toContain("当前身份没有可管理的店铺");
    expect(source).toContain("重新加载店铺资料");
    expect(source).toContain("还原未保存修改");
    expect(source).toContain("店铺基础资料已保存并写入数据库");
  });
});
