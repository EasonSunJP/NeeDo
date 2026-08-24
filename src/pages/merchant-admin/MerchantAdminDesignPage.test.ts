import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantAdminDesignPage.tsx", import.meta.url), "utf8");

describe("MerchantAdminDesignPage production capability gate", () => {
  it("removes browser-local publishing and generated previews", () => {
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("updateStoreEntity");
    expect(source).not.toContain("StoreDetailExperience");
    expect(source).not.toContain("ImageGalleryManager");
    expect(source).not.toContain("发布到本店");
    expect(source).not.toContain("已发布到本店");
  });

  it("names the formal contracts required before design is enabled", () => {
    expect(source).toContain("正式店铺装修功能尚未启用");
    expect(source).toContain("店铺展示配置表与 migration");
    expect(source).toContain("店铺范围草稿、发布与版本 API");
    expect(source).toContain("MediaAsset 上传、排序与删除审计");
    expect(source).toContain("用户端正式配置读取与回滚");
    expect(source).toContain("当前不会把装修配置保存到浏览器");
  });
});
