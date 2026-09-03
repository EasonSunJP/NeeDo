import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const consumers = [
  {
    name: "ServiceCard",
    path: "../../components/mobile/ServiceCard.tsx",
    required: ["SocialProfileMiniCard", "buildServiceMiniCardData"]
  },
  {
    name: "OrderServiceMiniCard",
    path: "../../components/mobile/OrderServiceMiniCard.tsx",
    required: ["UnifiedServiceInfoCard", "actionSlot"]
  },
  {
    name: "HomePage",
    path: "../../pages/user/HomePage.tsx",
    required: ["SocialProfileMiniCard", "buildServiceMiniCardData"]
  },
  {
    name: "UserOrderDetailPage",
    path: "../../pages/user/UserOrderDetailPage.tsx",
    required: ["UnifiedServiceInfoCard", "mapCoreServiceCardToUnifiedData"]
  },
  {
    name: "FormalCheckoutPage",
    path: "../../pages/user/FormalCheckoutPage.tsx",
    required: ["UnifiedServiceInfoCard", "mapCoreServiceCardToUnifiedData"]
  },
  {
    name: "MerchantOrderRoutePages",
    path: "../../pages/mobile/MerchantOrderRoutePages.tsx",
    required: ["UnifiedServiceInfoCard", "actionSlot"]
  },
  {
    name: "TechnicianServicesPage",
    path: "../../pages/user/TechnicianServicesPage.tsx",
    required: ["UnifiedServiceInfoCard", "mapTechnicianServiceToUnifiedData"]
  }
] as const;

describe("unified service-information-card usage", () => {
  it("routes every real service-information card through UnifiedServiceInfoCard", () => {
    const violations = consumers.flatMap(({ name, path, required }) => {
      const source = read(path);
      const missing = required.filter((token) => !source.includes(token));
      return missing.length > 0 ? [`${name}: missing ${missing.join(", ")}`] : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps the SocialProfileMiniCard service branch as delegation, not a second card body", () => {
    const source = read("../profile-card/SocialProfileMiniCard.tsx");

    expect(source).toContain('data.entityType === "service" && data.serviceInfo');
    expect(source).toContain("<UnifiedServiceInfoCard");
  });

  it("does not retain a separately named full service preview card", () => {
    const combinedSource = consumers.map(({ path }) => read(path)).join("\n");

    expect(combinedSource).not.toContain("ServicePreviewCard");
  });

  it("exempts only HomePage ServiceModule image navigation tiles", () => {
    const homeSource = read("../../pages/user/HomePage.tsx");

    expect(homeSource).toContain("function ServiceModule(");
    expect(homeSource).toContain("图像化入口，点击进入对应服务列表");
    expect(homeSource).toContain('to={moduleConfig.targetTo}');
    expect(homeSource).not.toContain("function ServicePreviewCard(");
  });

  it("never derives service-card utilization from legacy sales", () => {
    const combinedSource = consumers.map(({ path }) => read(path)).join("\n");

    expect(combinedSource).not.toMatch(/usageCount\s*:\s*[^\n]*\.sales/u);
  });
});
