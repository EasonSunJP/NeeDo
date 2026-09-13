import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import source from "./SupportPage.tsx?raw";

describe("SupportPage", () => {
  it("uses the shared fullscreen header without global navigation or an edge mask", () => {
    expect(source).toContain("<MobileFullscreenPage");
    expect(source).toContain("<MobileFullscreenHeader");
    expect(source).toContain('title="联系客服"');
    expect(source).toContain('info="在线客服与工单尚未接入，当前无法在此发起咨询或创建工单。"');
    expect(source).toContain("onClose={closePage}");
    expect(source).toContain("showSpacer={false}");
    expect(source).toContain("showBottomNav={false}");
    expect(source).toContain("showTopEdgeMask={false}");
    expect(source).not.toContain("ClientEdgeMask");
    expect(source).not.toMatch(/(?:bg-|from-|to-)black|linear-gradient/u);
  });

  it("presents unavailable support categories as non-interactive Test information", () => {
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("客服功能正在准备中");
    expect(source).toContain("在线客服与工单尚未接入，当前无法在此发起咨询或创建工单。");
    expect(source).not.toContain("预计 3 分钟内接入在线客服");
    expect(source).not.toMatch(/supportCategories\.map\([\s\S]*?<button/u);
    expect(source).not.toContain("createTicket");
    expect(source).not.toContain("createConversation");
  });

  it("anchors home on the left and orders on the right in a safe-area aligned action bar", () => {
    expect(source).toContain('data-testid="support-floating-actions"');
    expect(source).toContain("absolute inset-x-0 bottom-0");
    expect(source).toContain("client-app-gutter");
    expect(source).not.toContain("max-w-[480px]");
    expect(source).toContain("grid-cols-2");
    expect(source).toContain("env(safe-area-inset-bottom)");

    const actions = source.slice(source.indexOf('data-testid="support-floating-actions"'));
    expect(actions.indexOf("返回首页")).toBeGreaterThan(-1);
    expect(actions.indexOf("查看我的订单")).toBeGreaterThan(actions.indexOf("返回首页"));
  });

  it("provides complete unavailable-state copy in every supported language", () => {
    const expected = {
      "zh-Hant": [
        "聯絡客服",
        "客服功能正在準備中",
        "線上客服與工單尚未接入，目前無法在此發起諮詢或建立工單。",
        "可諮詢範圍",
      ],
      ja: [
        "サポートに問い合わせる",
        "カスタマーサポート機能は準備中です",
        "オンラインサポートとサポートチケットはまだ正式サービスに接続されていないため、現在ここからお問い合わせやチケット作成はできません。",
        "お問い合わせ対象",
      ],
      en: [
        "Contact customer support",
        "Customer support is being prepared",
        "Online support and support tickets are not connected to the live service yet, so you cannot start an inquiry or create a ticket here.",
        "Topics for support",
      ],
      ko: [
        "고객 지원 문의",
        "고객 지원 기능을 준비 중입니다",
        "온라인 고객 지원과 지원 티켓은 아직 정식 서비스에 연결되지 않아 현재 여기에서 문의를 시작하거나 티켓을 만들 수 없습니다.",
        "문의 가능 항목",
      ],
    } as const;

    for (const [language, values] of Object.entries(expected)) {
      expect(translateText("联系客服", language as keyof typeof expected)).toBe(values[0]);
      expect(translateText("客服功能正在准备中", language as keyof typeof expected)).toBe(values[1]);
      expect(
        translateText(
          "在线客服与工单尚未接入，当前无法在此发起咨询或创建工单。",
          language as keyof typeof expected,
        ),
      ).toBe(values[2]);
      expect(translateText("可咨询范围", language as keyof typeof expected)).toBe(values[3]);
    }
  });
});
