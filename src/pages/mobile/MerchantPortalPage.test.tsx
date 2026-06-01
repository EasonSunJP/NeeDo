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
    expect(merchantSource).toContain("PrivacyModeConfirmDialog");
    expect(merchantSource).toContain("storePrivacyConfirmOpen");
    expect(merchantSource).toContain("confirmStorePrivacyEnabled");
    expect(merchantSource).toContain('className="relative z-[70] w-full" data-testid="merchant-store-privacy-control"');
    expect(merchantSource).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(merchantSource).toContain("z-[90]");
    expect(merchantSource).toContain('ariaLabel="开启店铺隐私模式"');
    expect(merchantSource).toContain("InfoTooltipTrigger");
    expect(merchantSource).toContain('description: "仅本人可见"');
    expect(merchantSource).toContain('description: "仅好友可以看到该账号信息"');
    expect(merchantSource).toContain('description: "仅好友以及关联店铺和介绍关系中的关联人可见"');
    expect(merchantSource).toContain("privacyControl={storePrivacyControl}");

    expect(storeDetailSource).toContain("privacyControl?: ReactNode");
    expect(storeDetailSource).toContain("hasMerchantControls");
    expect(storeDetailSource).toContain("relative z-50 space-y-3 overflow-visible");
    expect(storeDetailSource).toContain("min-h-[112px]");
    expect(storeDetailSource).toContain('className="mt-3 grid grid-cols-2 gap-2"');
    expect(storeDetailSource).toContain('<div className="relative z-0">{content}</div>');
  });

  it("adds the merchant pricing mode switch beside the privacy switch", () => {
    expect(merchantSource).toContain("function MerchantStorePricingModeControl");
    expect(merchantSource).toContain('data-testid="merchant-store-pricing-mode-control"');
    expect(merchantSource).toContain('"切换为技师定价"');
    expect(merchantSource).toContain("storePricingRatioMenuOpen");
    expect(merchantSource).toContain("updateStorePricingRatioMenuOpen");
    expect(merchantSource).toContain("updateStorePrivacyMenuOpen");
    expect(merchantSource).toContain("technicianPricingRatioPercent");
    expect(merchantSource).toContain('data-testid="merchant-pricing-ratio-menu"');
    expect(merchantSource).toContain("店铺报价与技师定价的比例");
    expect(merchantSource).toContain("默认 100%，每次调整 10%。");
    expect(merchantSource).toContain("updateTechnicianPricingRatio(10)");
    expect(merchantSource).toContain("updateTechnicianPricingRatio(-10)");
    expect(merchantSource).toContain('document.addEventListener("pointerdown", closeOnOutsidePointerDown)');
    expect(merchantSource).toContain("setStorePrivacyMenuOpen(false)");
    expect(merchantSource).toContain("setStorePricingRatioMenuOpen(false)");
    expect(merchantSource).toContain('aria-label="增加比例"');
    expect(merchantSource).toContain('aria-label="减少比例"');
    expect(merchantSource).toContain("确认开启");
    expect(merchantSource).not.toContain("window.confirm");
    expect(merchantSource).toContain("pricingControl={storePricingModeControl}");

    expect(storeDetailSource).toContain("pricingControl?: ReactNode");
    expect(storeDetailSource).toContain("hasMerchantControls");
    expect(storeDetailSource).toContain('className="mt-3 grid grid-cols-2 gap-2"');
    expect(storeDetailSource).toContain("{pricingControl ? <div>{pricingControl}</div> : <div />}");
    expect(storeDetailSource).toContain("{privacyControl ? <div>{privacyControl}</div> : <div />}");
  });
});
