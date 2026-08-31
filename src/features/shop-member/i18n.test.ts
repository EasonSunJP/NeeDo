import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { shopMembershipTranslations } from "./i18n";

describe("shop membership feature translations", () => {
  it("provides every feature phrase in all four target languages", () => {
    expect(Object.keys(shopMembershipTranslations).length).toBeGreaterThan(40);
    for (const entry of Object.values(shopMembershipTranslations)) {
      expect(entry["zh-Hant"]?.trim()).toBeTruthy();
      expect(entry.ja?.trim()).toBeTruthy();
      expect(entry.en?.trim()).toBeTruthy();
      expect(entry.ko?.trim()).toBeTruthy();
    }
    expect(JSON.stringify(shopMembershipTranslations)).not.toContain("充值、核销、退款仍");
  });

  it("registers feature-local translations with the shared runtime translator", () => {
    expect(translateText("我的会员", "ja")).toBe("マイ会員");
    expect(translateText("查看已加入店铺与会员卡状态", "en")).toBe(
      "View joined stores and membership card status"
    );
    expect(translateText("暂无会员卡", "ko")).toBe("회원 카드가 없습니다");
    expect(translateText("待确认的会员卡调整", "ja")).toBe("確認が必要な会員カード変更");
    expect(translateText("客户已同意", "en")).toBe("Approved by customer");
    expect(translateText("卡状态变化，已失效", "ko")).toBe("카드 상태 변경으로 무효화됨");
    expect(translateText("最近处理记录", "zh-Hant")).toBe("最近處理記錄");
    expect(translateText("已有调整等待客户确认", "ja")).toBe("お客様の確認待ちの変更があります");
    expect(translateText("查看调整申请", "en")).toBe("View change request");
    expect(translateText("调整状态读取失败", "ko")).toBe("변경 상태를 불러오지 못했습니다");
    expect(translateText("shop_membership.card_adjustment.expired.title", "en")).toBe("Membership card change expired");
    expect(translateText("会员卡充值", "ja")).toBe("会員カードチャージ");
    expect(translateText("充值记录", "en")).toBe("Top-up history");
    expect(translateText("shop_membership.card_topup.created.title", "ko")).toBe("회원 카드 충전 완료");
    expect(translateText("金额与次数调整已采用客户 72 小时确认流程；充值已接入正式数据库、审计与通知，核销和退款仍会分别作为独立步骤。上述操作均不会自动发放 NDP。", "en")).toBe(
      "Amount and usage changes use 72-hour customer confirmation. Top-up now uses the formal database, audit, and notifications. Redemption and refunds remain separate steps. None of these actions automatically award NDP."
    );
  });
});
