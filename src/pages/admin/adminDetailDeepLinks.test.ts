import { describe, expect, it } from "vitest";
import merchantsSource from "./MerchantsPage.tsx?raw";
import techniciansSource from "./TechniciansPage.tsx?raw";
import usersSource from "../../features/platform-user-management/UserListPage.tsx?raw";

describe("operations formal detail deep links", () => {
  it("restores the existing service drawer from a validated URL id", () => {
    expect(merchantsSource).toContain('readPositiveIntegerSearchParam(searchParams, "detailServiceId")');
    expect(merchantsSource).toContain('searchParams.get("module") === "services"');
    expect(merchantsSource).toContain("services.find((service) => service.id === detailServiceId)");
    expect(merchantsSource).toContain('title="服务项目详情"');
  });

  it("restores the existing technician drawer through its formal detail request", () => {
    expect(techniciansSource).toContain('readPositiveIntegerSearchParam(searchParams, "detailTechnicianId")');
    expect(techniciansSource).toContain("technicianDetailRequest.load(detailTechnicianId)");
    expect(techniciansSource).toContain('title={translate("技师集中详情")}');
  });

  it("restores the existing user drawer with the formal user id", () => {
    expect(usersSource).toContain('readPositiveIntegerSearchParam(searchParams, "detailUserId")');
    expect(usersSource).toContain("setSelectedUserId(detailUserId)");
    expect(usersSource).toContain("<UserDetailDrawer");
  });
});
