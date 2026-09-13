// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IntelligenceComposerFields } from "./IntelligenceComposerFields";
import type { IntelligenceComposerDraft } from "./exchange-composer-model";
import type { ExchangeIntelligenceServiceOption } from "./types";

const draft: IntelligenceComposerDraft = {
  contentLocale: "zh-CN",
  title: "",
  detail: "",
  serviceRef: "technician:31",
  serviceStartDate: "",
  serviceStartTime: "",
  serviceEndDate: "",
  serviceEndTime: "",
  expiresDate: "",
  expiresTime: "",
  campaignPriceJpy: "8800"
};

const option: ExchangeIntelligenceServiceOption = {
  serviceRef: "technician:31",
  ownerType: "technician",
  name: "指压 60 分钟",
  durationMinutes: 60,
  catalogPriceJpy: 10000,
  currency: "JPY",
  serviceMode: "store",
  available: true,
  shop: {
    publicId: "shop0000000031",
    name: "六本木店",
    city: "港区",
    address: "東京都港区六本木 3-2-1"
  },
  technician: {
    publicId: "s0000000031",
    displayName: "技师 31",
    avatarUrl: null,
    serviceArea: "港区",
    serviceAreas: ["港区"]
  }
};

describe("IntelligenceComposerFields", () => {
  it("shows authoritative service, owner, shop, duration, address, and catalog price", () => {
    const html = renderToStaticMarkup(
      <IntelligenceComposerFields draft={draft} language="zh" onChange={vi.fn()} onRetryServiceOptions={vi.fn()} serviceOptions={[option]} serviceOptionsStatus="ready" />
    );
    expect(html).toContain("指压 60 分钟");
    expect(html).toContain("技师 31");
    expect(html).toContain("六本木店");
    expect(html).toContain("東京都港区六本木 3-2-1");
    expect(html).toContain("¥10,000");
    expect(html).toContain('name="contentLocale"');
    expect(html).toContain('<option value="ja">日本語</option>');
    expect(html).not.toContain('name="contentLocale" disabled=""');
    expect(html).not.toMatch(/name="(?:serviceMode|areaLabel|addressLabel|serviceAreas|originalPriceJpy)"/u);
  });

  it("renders explicit loading, empty, and retryable error states", () => {
    const render = (status: "loading" | "ready" | "error") =>
      renderToStaticMarkup(
        <IntelligenceComposerFields draft={{ ...draft, serviceRef: "" }} language="zh" onChange={vi.fn()} onRetryServiceOptions={vi.fn()} serviceOptions={[]} serviceOptionsStatus={status} />
      );
    expect(render("loading")).toContain("正在读取当前身份可发布的服务");
    expect(render("ready")).toContain("当前身份暂无可发布的正式服务");
    expect(render("error")).toContain("retry-intelligence-services");
  });
});
