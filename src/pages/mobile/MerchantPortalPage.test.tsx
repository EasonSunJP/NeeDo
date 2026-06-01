import { describe, expect, it } from "vitest";
import merchantSource from "./MerchantPortalPage.tsx?raw";
import storeDetailSource from "../user/StoreDetailPage.tsx?raw";

describe("MerchantPortalPage store privacy control", () => {
  it("adds the floating privacy menu to the merchant service card only", () => {
    expect(merchantSource).toContain('{ label: "服务展示", value: "service" }');
    expect(merchantSource).toContain('{ label: "数据中心", value: "data" }');
    expect(merchantSource).toContain("function MerchantStorePrivacyControl");
    expect(merchantSource).toContain('data-testid="merchant-store-privacy-control"');
    expect(merchantSource).toContain('data-testid="merchant-store-privacy-options"');
    expect(merchantSource).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(merchantSource).toContain("z-[90]");
    expect(merchantSource).toContain('ariaLabel="开启店铺隐私模式"');
    expect(merchantSource).toContain("InfoTooltipTrigger");
    expect(merchantSource).toContain('description: "仅本人可见"');
    expect(merchantSource).toContain('description: "仅好友可以看到该账号信息"');
    expect(merchantSource).toContain('description: "仅好友以及关联店铺和介绍关系中的关联人可见"');
    expect(merchantSource).toContain("privacyControl={storePrivacyControl}");

    expect(storeDetailSource).toContain("privacyControl?: ReactNode");
    expect(storeDetailSource).toContain("hasPrivacyControl ? <div");
    expect(storeDetailSource).toContain("relative z-50 space-y-3 overflow-visible");
    expect(storeDetailSource).toContain("min-h-[112px]");
    expect(storeDetailSource).toContain('className="absolute right-0 top-12 z-20"');
    expect(storeDetailSource).toContain('<div className="relative z-0">{content}</div>');
  });
});
