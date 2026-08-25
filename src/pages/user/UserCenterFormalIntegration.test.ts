import { describe, expect, it } from "vitest";
import centerSource from "./UserCenterPage.tsx?raw";

describe("formal customer center integration", () => {
  it("keeps authenticated customers on the single complete user-center design", () => {
    expect(centerSource).not.toContain("FormalUserCenterPage");
    expect(centerSource).not.toContain("LegacyUserCenterPage");
    expect(centerSource).toContain("CompleteUserCenterPage");
    expect(centerSource).toContain("coreReadApi.getCustomerProfile(customerProfileId)");
    expect(centerSource).toContain("walletApi.getMyWallet()");
    expect(centerSource).toContain('data-testid="user-profile-privacy-control"');
    expect(centerSource).toContain("我的订单");
    expect(centerSource).toContain("serviceTools.map");
    expect(centerSource).toContain("账号与服务");
  });

  it("derives each reservation count from a status-filtered paginated API total", () => {
    expect(centerSource).toContain("bookingApi.listOrders({ page: 1, pageSize: 1, status })");
    expect(centerSource).toContain('"pending"');
    expect(centerSource).toContain('"confirmed"');
    expect(centerSource).toContain('"inService"');
    expect(centerSource).toContain('"completed"');
    expect(centerSource).toContain('"cancelled"');
  });

  it("keeps explicit loading and retry states without introducing a second page version", () => {
    expect(centerSource).toContain("正在加载我的正式数据");
    expect(centerSource).toContain("重新加载我的数据");
    expect(centerSource).toContain("formalData");
  });
});
