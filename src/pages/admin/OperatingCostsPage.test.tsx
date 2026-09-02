import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import source from "./OperatingCostsPage.tsx?raw";
import { parseDirectAssignments } from "./OperatingCostsPage";

describe("formal operating-cost administration", () => {
  it("creates, updates, publishes, deletes, and lists only through the formal API", () => {
    for (const method of [
      "listOperatingCosts",
      "createOperatingCost",
      "updateOperatingCost",
      "publishOperatingCost",
      "deleteOperatingCost",
    ]) {
      expect(source).toContain(`platformPartnersApi.${method}`);
    }
    expect(source).not.toContain("mock");
    expect(source).not.toContain("localStorage");
  });

  it("requires a reason, effective time, period, category, and allocation mode", () => {
    for (const label of [
      "成本类型",
      "周期开始",
      "周期结束",
      "分摊方式",
      "生效时间",
      "设置理由",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain(
      'hasPermission("backoffice:operating-cost:write")',
    );
    expect(source).toContain("当前账号只有读取权限");
  });

  it("parses exact direct JPY amounts or percentage shares", () => {
    expect(
      parseDirectAssignments("shop0000000001=600\nshop0000000002=400"),
    ).toEqual([
      { shopPublicId: "shop0000000001", amountJpy: 600 },
      { shopPublicId: "shop0000000002", amountJpy: 400 },
    ]);
    expect(
      parseDirectAssignments("shop0000000001=60%\nshop0000000002=40%"),
    ).toEqual([
      { shopPublicId: "shop0000000001", shareBps: 6000 },
      { shopPublicId: "shop0000000002", shareBps: 4000 },
    ]);
    expect(() => parseDirectAssignments("wrong=100")).toThrow(
      "直接分配格式无效",
    );
  });

  it("uses the accepted allocation label and participates in runtime i18n", () => {
    expect(source).toContain("按活跃店铺等额分摊");
    expect(source).not.toContain("data-no-i18n");
    expect(translateText("运营成本设置", "ja")).toBe("運営コスト設定");
    expect(translateText("按活跃店铺等额分摊", "en")).toBe(
      "Allocate equally across active shops",
    );
  });
});
