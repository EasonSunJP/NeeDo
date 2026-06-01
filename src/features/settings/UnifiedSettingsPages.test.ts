import { describe, expect, it } from "vitest";
import { resolveSettingsSelectedPortal, shouldKeepSettingsRoutePortal } from "./UnifiedSettingsPages";
import source from "./UnifiedSettingsPages.tsx?raw";

const serviceRangeSource = source.slice(
  source.indexOf("export function UnifiedSettingsServiceRangePage"),
  source.indexOf("export function UnifiedSettingsAccountPage")
);

describe("UnifiedSettingsServiceRangePage", () => {
  it("uses an isolated settings detail shell with close control and no main nav", () => {
    expect(serviceRangeSource).toContain("navItems={[]}");
    expect(serviceRangeSource).toContain("onClose={closeServiceRangePage}");
  });

  it("keeps search in the header area and removes framed title/location blocks", () => {
    expect(serviceRangeSource).toContain("FloatingHeaderSearchBar");
    expect(serviceRangeSource).toContain("serviceRangeSearchQuery");
    expect(serviceRangeSource).toContain('placeholder={t("搜索地点")}');
    expect(serviceRangeSource).not.toContain("<SurfacePanel>");
    expect(serviceRangeSource).not.toContain("<SectionBlock");
  });

  it("uses a simple two-button bottom action row with the updated save label", () => {
    expect(serviceRangeSource).toContain("simple");
    expect(source).toContain("fixed inset-x-0 bottom-0");
    expect(source).toContain("bg-gradient-to-t");
    expect(serviceRangeSource).toContain('saveLabel={t("保存并关闭")}');
    expect(serviceRangeSource).not.toContain("保存并返回设置中心");
  });

  it("is shared by user, merchant, and technician location settings", () => {
    expect(serviceRangeSource).toContain('portal === "user"');
    expect(serviceRangeSource).toContain("selectHomeLocationManually");
    expect(serviceRangeSource).toContain("updateStoreEntity(store.id");
    expect(serviceRangeSource).toContain("updateTechnicianEntity(technician.id");
    expect(serviceRangeSource).not.toContain('portal !== "technician"');
    expect(serviceRangeSource).not.toContain("当前不可用");
  });

  it("keeps the area chips compact and removes the duplicate section title", () => {
    expect(serviceRangeSource).toContain("min-h-11");
    expect(serviceRangeSource).not.toContain('label={t("可服务区域")}');
    expect(serviceRangeSource).not.toContain('title={t("可服务区域")}');
    expect(serviceRangeSource).not.toContain("min-h-12 rounded-full px-5");
  });
});

describe("UnifiedSettingsPortalPage", () => {
  const portalPageSource = source.slice(
    source.indexOf("export function UnifiedSettingsPortalPage"),
    source.indexOf("function UserProfileSettingsPage")
  );

  it("uses the current settings route as the selected frontend identity", () => {
    expect(resolveSettingsSelectedPortal("technician", "user")).toBe("technician");
    expect(resolveSettingsSelectedPortal("merchant", "user")).toBe("merchant");
    expect(resolveSettingsSelectedPortal("business", "user")).toBe("business");
  });

  it("keeps technician and merchant settings routes when a user session can enter them", () => {
    expect(
      shouldKeepSettingsRoutePortal({
        activePortal: "user",
        canEnterRoutePortal: true,
        routePortal: "technician"
      })
    ).toBe(true);
    expect(
      shouldKeepSettingsRoutePortal({
        activePortal: "user",
        canEnterRoutePortal: true,
        routePortal: "merchant"
      })
    ).toBe(true);
  });

  it("moves portal helper captions behind inline info triggers", () => {
    expect(source).toContain("function SettingsPortalActionRow");
    expect(source).toContain('className="h-4 w-4 text-[10px]"');
    expect(portalPageSource).toContain("info={t(compactPortalLabels[item].caption)}");
    expect(portalPageSource).toContain("info={t(entry.subtitle)}");
    expect(portalPageSource).toContain("trailing={<SettingsArrow />}");
    expect(portalPageSource).not.toContain("{t(compactPortalLabels[item].caption)}</p>");
    expect(portalPageSource).not.toContain("subtitle={t(entry.subtitle)}");
  });
});

describe("UnifiedSettingsPage Xiaobai asset gate", () => {
  const settingsHomeSource = source.slice(
    source.indexOf("export function UnifiedSettingsPage"),
    source.indexOf("export function UnifiedSettingsThemePage")
  );

  it("uses the switch slot for download progress until Xiaobai assets are ready", () => {
    expect(settingsHomeSource).toContain("petAssetReadiness.ready ? (");
    expect(settingsHomeSource).toContain("<SettingsPetAssetProgress");
    expect(settingsHomeSource).not.toContain("disabled={!petAssetReadiness.ready}");
  });
});

describe("UnifiedSettingsProfilePage", () => {
  const userProfileSource = source.slice(
    source.indexOf("function UserProfileSettingsPage"),
    source.indexOf("function TechnicianProfileSettingsPage")
  );
  const technicianProfileSource = source.slice(
    source.indexOf("function TechnicianProfileSettingsPage"),
    source.indexOf("function MerchantProfileSettingsPage")
  );

  it("keeps profile visibility controls out of user and technician profile edit pages", () => {
    expect(userProfileSource).not.toContain("InfoCardVisibilityEditor");
    expect(userProfileSource).not.toContain("信息卡可见范围");
    expect(technicianProfileSource).not.toContain("InfoCardVisibilityEditor");
    expect(technicianProfileSource).not.toContain("信息卡可见范围");
    expect(technicianProfileSource).not.toContain("技师名片预览");
    expect(technicianProfileSource).not.toContain("实时预览");
  });

  it("opens the technician profile edit page without the main bottom navigation", () => {
    expect(technicianProfileSource).toContain("navItems={[]}");
  });
});
