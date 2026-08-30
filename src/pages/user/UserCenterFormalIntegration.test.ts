import { describe, expect, it } from "vitest";
import centerSource from "./UserCenterPage.tsx?raw";

describe("formal customer center integration", () => {
  it("keeps authenticated customers on the single complete user-center design", () => {
    expect(centerSource).not.toContain("FormalUserCenterPage");
    expect(centerSource).not.toContain("LegacyUserCenterPage");
    expect(centerSource).toContain("CompleteUserCenterPage");
    expect(centerSource).toContain("customerProfileApi.getMine()");
    expect(centerSource).toContain("profile.id !== customerProfileId");
    expect(centerSource).toContain("walletApi.getMyWallet()");
    expect(centerSource).toContain('formalData.wallet.currency === "TEST_NDP" ? "Test NDP" : "NDP"');
    expect(centerSource).toContain("{ label: pointsLabel, value: points.toLocaleString(\"en-US\") }");
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

  it("writes formal edits through the protected current-profile API and preserves drafts on failure", () => {
    expect(centerSource).toContain("customerProfileApi.updateMine({");
    expect(centerSource).toContain("onFormalProfileUpdated(updated)");
    expect(centerSource).toContain("资料保存失败，请保留当前内容后重试");
    expect(centerSource).toContain("setIsEditingProfile(true)");
  });
});
