import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const source = {
  category: read("../../pages/user/CategoryPage.tsx"),
  checkout: read("../../pages/user/FormalCheckoutPage.tsx"),
  home: read("../../pages/user/HomePage.tsx"),
  merchantOrders: read("../../pages/mobile/MerchantOrderRoutePages.tsx"),
  orderMiniCard: read("../../components/mobile/OrderServiceMiniCard.tsx"),
  profileDetail: read("../../pages/user/ProfileDetailPage.tsx"),
  profileDelegate: read("../profile-card/SocialProfileMiniCard.tsx"),
  publicTechnicianCard: read("../profile-card/TechnicianPublicInfoCard.tsx"),
  shopDetail: read("../../pages/user/StoreDetailPage.tsx"),
  technicianPortal: read("../../pages/mobile/TechnicianPortalPage.tsx"),
  technicianProfile: read("../technician-profile/TechnicianProfileInfoView.tsx"),
  technicianServices: read("../../pages/user/TechnicianServicesPage.tsx"),
  userOrder: read("../../pages/user/UserOrderDetailPage.tsx")
} as const;

function between(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return value.slice(startIndex, endIndex);
}

function countJsx(value: string, component: string) {
  return value.match(new RegExp(`<${component}\\b`, "gu"))?.length ?? 0;
}

describe("unified service-information-card usage", () => {
  it("follows the real home and search/category JSX delegation chain", () => {
    const recommendation = between(source.home, "function RecommendationCard", "function ReminderMiniCard");
    const serviceDelegate = between(
      source.profileDelegate,
      'if (data.entityType === "service" && data.serviceInfo)',
      "const avatarDetailTo"
    );
    const categoryCard = between(source.category, "function ServicePreviewCard", "export function CategoryPage");

    expect(recommendation).toContain("<SocialProfileMiniCard data={buildServiceMiniCardData(data.service)} detailTo={data.to} />");
    expect(serviceDelegate).toMatch(/return \(\s*<UnifiedServiceInfoCard[\s\S]*data=\{data\.serviceInfo\}/u);
    expect(categoryCard).toContain("return <UnifiedServiceInfoCard data={mapServiceItemToUnifiedData(service)}");
  });

  it("uses the unified JSX body for shop-detail services", () => {
    const compactMenuCard = between(source.shopDetail, "function CompactMenuCard", "function EnvironmentGalleryCard");

    expect(compactMenuCard).toContain("<UnifiedServiceInfoCard");
    expect(compactMenuCard).toContain("data={serviceData}");
    expect(source.shopDetail).toContain("serviceCardsOverride={query.data.services.map(mapCoreServiceCardToUnifiedData)}");
    expect(source.shopDetail).toContain("mapStoreMenuConfigToUnifiedData(menuCard, store)");
  });

  it("routes technician personal and public detail services through the shared profile view", () => {
    expect(source.technicianProfile).toMatch(/model\.services\.map\([\s\S]*<UnifiedServiceInfoCard[\s\S]*data=\{service\}/u);
    expect(source.technicianPortal).toContain("<TechnicianProfileInfoView");
    expect(source.technicianPortal).toMatch(/services\.map\([\s\S]*<UnifiedServiceInfoCard[\s\S]*fromTechnicianServicePayload\(service\)/u);
    expect(source.profileDetail).toContain("<TechnicianProfileInfoView model={model} />");
    expect(source.publicTechnicianCard).toContain("<TechnicianProfileInfoView model={model} />");
  });

  it("uses actual unified-card JSX for checkout, order, merchant, and technician-service consumers", () => {
    expect(source.checkout).toContain("<UnifiedServiceInfoCard data={mapCoreServiceCardToUnifiedData(service)}");
    expect(source.orderMiniCard).toMatch(/<UnifiedServiceInfoCard[\s\S]*data=\{serviceCardData\}/u);
    expect(countJsx(source.userOrder, "UnifiedServiceInfoCard")).toBeGreaterThanOrEqual(4);
    expect(source.userOrder).toContain("data={orderService ? mapCoreServiceCardToUnifiedData(orderService) : buildBookingOrderSnapshotServiceData(order)}");
    expect(countJsx(source.merchantOrders, "UnifiedServiceInfoCard")).toBeGreaterThanOrEqual(4);
    expect(source.merchantOrders).toContain("actionSlot={<DispatchStatusBadge");
    expect(source.merchantOrders).toContain("selectServicePackage(selection)");
    expect(source.technicianServices).toMatch(/services\.map\([\s\S]*<UnifiedServiceInfoCard[\s\S]*mapTechnicianServiceToUnifiedData\(service\)/u);
  });

  it("documents only the HomePage ServiceModule image-navigation tile exemption", () => {
    const tile = between(source.home, "function ServiceModule", "function RecommendationCard");

    expect(tile).toContain("图像化入口，点击进入对应服务列表");
    expect(tile).toContain("to={moduleConfig.targetTo}");
    expect(tile).toContain("<img");
    expect(tile).not.toMatch(/利用回数|店铺 ID|店铺地址|priceAmount|durationMinutes/u);
  });

  it("keeps duplicate service fact-body signatures outside the shared card", () => {
    const homeWithoutNavigationTiles = source.home.replace(
      between(source.home, "function ServiceModule", "function RecommendationCard"),
      ""
    );
    const shopDetailWithoutEditableMenuForm = source.shopDetail.replace(
      between(source.shopDetail, "function CompactMenuCard", "function EnvironmentGalleryCard"),
      ""
    );
    const consumers = [
      homeWithoutNavigationTiles,
      source.category,
      shopDetailWithoutEditableMenuForm,
      source.technicianPortal,
      source.technicianProfile,
      source.profileDetail,
      source.publicTechnicianCard,
      source.checkout,
      source.orderMiniCard,
      source.userOrder,
      source.merchantOrders,
      source.technicianServices
    ].join("\n");

    expect(consumers).not.toMatch(/利用回数：|店铺 ID：|店铺地址：/u);
    expect(consumers).not.toMatch(/usageCount\s*:\s*[^\n]*\.sales/u);
    expect(consumers).not.toMatch(/<img[^>]+alt=\{(?:service|item)\.name\}[^>]*>/u);
    expect(consumers).not.toMatch(/value=\{item\.(?:duration|name|priceLabel)\}/u);
  });
});
