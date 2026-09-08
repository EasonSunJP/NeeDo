import { describe, expect, it } from "vitest";
import applicationUiSource from "./ApplicationUi.tsx?raw";
import merchantApplicationSource from "./MerchantApplicationPage.tsx?raw";
import technicianApplicationSource from "./TechnicianApplicationPage.tsx?raw";
import storeDetailPageSource from "../../pages/user/StoreDetailPage.tsx?raw";
import { shopTaxonomyCopy } from "../shop-taxonomy/i18n";

describe("identity application page chrome", () => {
  it("renders the approved seven independent merchant application sections", () => {
    const stepZero = merchantApplicationSource.split("{step === 0 ? (")[1]?.split("{step === 1 ? (")[0] ?? "";
    const sectionMarkers = [
      'title="名义"', 'title="基础信息"', "<ShopTaxonomyRegistrationField",
      'title="费用区间"', 'title="店铺简介"', 'title="上传店铺第一张展示图"', 'title="主页效果预览"'
    ];
    let previousIndex = -1;
    for (const marker of sectionMarkers) {
      const index = stepZero.indexOf(marker);
      expect(index, marker).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(shopTaxonomyCopy.zh.title).toBe("服务种类与关键词");
    expect(stepZero.match(/<ApplicationSection /gu)).toHaveLength(6);
    expect(stepZero).not.toContain("<ApplicationCard");
    expect(stepZero).not.toContain('type="file"');
    expect(merchantApplicationSource).not.toContain('label="负责人姓名"');
    expect(merchantApplicationSource.indexOf('label="姓"')).toBeLessThan(merchantApplicationSource.indexOf('label="法人或代表者姓名"'));
  });

  it("uses formal eKYC status and the existing verification route", () => {
    expect(merchantApplicationSource).toContain("platformMembershipSelfApi.getMine()");
    expect(merchantApplicationSource).toContain('navigate("/me/settings/verification")');
    expect(merchantApplicationSource).toContain("setEkycVerified(membership.ekycVerified)");
    expect(merchantApplicationSource).toContain("已本人确认");
    expect(merchantApplicationSource).not.toContain("setEkycVerified(true)");
  });

  it("keeps the formal payload while formatting the preview price range", () => {
    expect(merchantApplicationSource).toContain("responsiblePersonName: form.responsiblePersonName.trim()");
    expect(merchantApplicationSource).toContain("formatMerchantPriceRange(priceRange)");
    expect(merchantApplicationSource).toContain('parseMerchantPriceRange(readDraftString(detail.showcaseDraft, "priceLabel"))');
    expect(merchantApplicationSource).toContain("validateMerchantPriceRange(priceRange)");
    expect(merchantApplicationSource).toContain("ApplicationBottomAction");
    expect(merchantApplicationSource).toContain("ApplicationFileUpload");
    expect(merchantApplicationSource).toContain("StoreDetailExperience embedded");
    expect(merchantApplicationSource).toContain('identityApplicationsApi.uploadMedia(working.id, "showcase", working.version, showcaseImage)');
  });

  it("validates the normalized corporate payload without adding unapproved form fields", () => {
    expect(merchantApplicationSource).toContain("corporateLegalName: payload.corporateLegalName ?? \"\"");
    expect(merchantApplicationSource).toContain("corporateLegalNameKana: payload.corporateLegalNameKana ?? \"\"");
    expect(merchantApplicationSource.split("{step === 3 ? (")[0]).not.toContain('label="法人名称"');
    expect(merchantApplicationSource.split("{step === 3 ? (")[0]).not.toContain('label="法人名称片假名"');
  });

  it("hides the regular user navigation throughout the merchant application flow", () => {
    expect(applicationUiSource).toContain("hideNavigation?: boolean;");
    expect(applicationUiSource).toContain("navItems={hideNavigation ? [] : undefined}");
    expect(merchantApplicationSource).toContain("<ApplicationShell hideNavigation");
  });

  it("uses formal category-first taxonomy selection instead of free-text service tags", () => {
    expect(merchantApplicationSource).toContain("ShopTaxonomyRegistrationField");
    expect(merchantApplicationSource).toContain("serviceCategoryIds: form.serviceCategoryIds");
    expect(merchantApplicationSource).toContain("businessKeywordIds: form.businessKeywordIds");
    expect(merchantApplicationSource).not.toContain('updateForm("tags"');
  });

  it("provides independent titled containers and a themed file chooser", () => {
    expect(applicationUiSource).toContain("export function ApplicationSection");
    expect(applicationUiSource).toContain("TitleWithInfo");
    expect(applicationUiSource).toContain("export function ApplicationFileUpload");
    expect(applicationUiSource).toContain('type="file"');
    expect(applicationUiSource).toContain("sr-only");
  });

  it("keeps both application page entries read-only until the user explicitly submits", () => {
    const technicianInitialLoad = technicianApplicationSource.slice(0, technicianApplicationSource.indexOf("const submitProfile"));
    const merchantInitialLoad = merchantApplicationSource.slice(0, merchantApplicationSource.indexOf("const saveShowcase"));

    expect(technicianInitialLoad).not.toContain("createTechnicianDraft(");
    expect(technicianInitialLoad).not.toContain("updateTechnicianProfile(");
    expect(technicianInitialLoad).not.toContain("identityApplicationsApi.submit(");
    expect(merchantInitialLoad).not.toContain("createMerchantDraft(");
    expect(merchantInitialLoad).not.toContain("updateMerchantShowcase(");
    expect(merchantInitialLoad).not.toContain("identityApplicationsApi.submit(");
  });

  it("shows submitted technician and merchant details with a disabled grey review action", () => {
    const technicianPending = technicianApplicationSource.split("{step === 2 ? (")[1] ?? "";
    const merchantPending = merchantApplicationSource.split("{step === 3 ? (")[1] ?? "";

    expect(applicationUiSource).toContain("export function ApplicationReadOnlyField");
    for (const marker of ['label="申请店铺"', 'label="本人姓名"', 'label="擅长项目"']) {
      expect(technicianPending).toContain(marker);
    }
    for (const marker of ['label="申请名义"', 'label="店铺名称"', 'label="银行账户"']) {
      expect(merchantPending).toContain(marker);
    }
    expect(technicianPending).toContain("<ApplicationReviewActions application={application}");
    expect(merchantPending).toContain("<ApplicationReviewActions application={application}");
    expect(technicianPending).not.toContain("ApplicationInput");
    expect(merchantPending).not.toContain("ApplicationInput");
  });

  it("keeps the application header above preview chrome and fixes the action at home-nav position", () => {
    expect(applicationUiSource).toContain('headerFrameClassName="!z-[140]"');
    expect(applicationUiSource).toContain("export function ApplicationBottomAction");
    expect(applicationUiSource).toContain("fixed inset-x-0 bottom-0 z-[100]");
    expect(applicationUiSource).toContain("--client-bottom-nav-inline-gap");
  });

  it("preserves the approved tilde separator in the store preview price range", () => {
    expect(storeDetailPageSource).toContain('return minPrice === maxPrice ? yen(minPrice) : `${yen(minPrice)} ~ ${yen(maxPrice)}`;');
    expect(storeDetailPageSource).not.toContain('return minPrice === maxPrice ? yen(minPrice) : `${yen(minPrice)}-${yen(maxPrice)}`;');
  });
});
