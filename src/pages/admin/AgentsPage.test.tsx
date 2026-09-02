import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import source from "./AgentsPage.tsx?raw";

describe("formal agent administration", () => {
  it("uses only the formal partner, referral, rule, and settlement API client", () => {
    for (const method of [
      "listAgents",
      "listShopReferrals",
      "linkShop",
      "getCommissionRules",
      "publishCommissionRule",
      "listSettlements",
      "previewSettlement",
      "confirmSettlement",
      "markSettlementPaid",
    ]) {
      expect(source).toContain(`platformPartnersApi.${method}`);
    }
    expect(source).not.toContain("mock");
    expect(source).not.toContain("localStorage");
  });

  it("shows referred shops, active rule, and latest settlement/payment status in the list", () => {
    expect(source).toContain("administration.referralCount");
    expect(source).toContain("administration.referredShops");
    expect(source).toContain("administration.currentRule");
    expect(source).toContain("administration.latestSettlement");
    expect(source).toContain("已支付");
    expect(source).toContain("已确认");
  });

  it("requires effective evidence for rules, referrals, settlement preview, and payment", () => {
    expect(source).toContain("设置理由");
    expect(source).toContain("确认时间");
    expect(source).toContain("外部凭证编号");
    expect(source).toContain("支付通道费 JPY");
    expect(source).toContain("消费税 JPY");
    expect(source).toContain("支付凭证编号");
  });

  it("renders every pure-profit component before settlement confirmation", () => {
    for (const label of [
      "订单平台服务费",
      "SaaS 费",
      "用户返点",
      "退款／冲正",
      "支付通道费",
      "消费税",
      "运营成本均摊",
      "纯利润",
      "代理商分佣",
    ]) {
      expect(source).toContain(label);
    }
    expect(source.indexOf("SettlementPreviewView")).toBeLessThan(
      source.indexOf("确认并生成结算凭证"),
    );
  });

  it("retains read-only views while hiding each mutation by exact permission", () => {
    expect(source).toContain('hasPermission("backoffice:agent:write")');
    expect(source).toContain(
      'hasPermission("backoffice:agent-settlement:write")',
    );
    expect(source).toContain(
      'hasPermission("backoffice:agent-settlement:pay")',
    );
    expect(source).toContain("当前账号只有读取权限");
  });

  it("uses the accepted rule labels and participates in runtime i18n", () => {
    expect(source).toContain("固定成功奖励（日元）");
    expect(source).toContain("纯利润分成比例");
    expect(source).not.toContain("data-no-i18n");
    expect(translateText("固定成功奖励（日元）", "ja")).toBe(
      "固定成功報酬（円）",
    );
    expect(translateText("纯利润分成比例", "en")).toBe("Net profit share rate");
    expect(translateText("佣金规则版本历史", "ja")).toBe(
      "コミッションルールのバージョン履歴",
    );
  });
});
