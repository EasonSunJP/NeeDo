// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TechnicianProfileInfoModel } from "./model";

const clipboardMocks = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }));
vi.mock("../../lib/share", () => ({ copyTextToClipboard: clipboardMocks.copyTextToClipboard }));

import { TechnicianProfileInfoView } from "./TechnicianProfileInfoView";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const model: TechnicianProfileInfoModel = {
  publicId: "s0000000081",
  displayName: "小林技师",
  avatarUrl: "/avatar.jpg",
  identityLabel: "店铺所属",
  gender: "female",
  age: 29,
  heightCm: 168,
  languages: ["日本語", "中文"],
  bio: "预约前请联系。",
  yearsExperience: 8,
  acceptanceRatePercent: 98,
  ratingAverage: 4.8,
  reviewCount: 132,
  completedOrderCount: 1281,
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 0 },
      { code: "service_max", label: "服务max", count: 0 },
      { code: "emotion_max", label: "情绪max", count: 0 },
      { code: "energy_max", label: "元气max", count: 0 }
    ],
    custom: [
      { label: "手法细致", count: 1 },
      { label: "沟通耐心", count: 2 }
    ]
  },
  services: [
    {
      id: "91",
      coverUrl: "/service.jpg",
      name: "肩颈调理",
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60,
      completedOrderCount: 18,
      shopPublicId: "shop0000000071",
      shopAddress: "東京都港区",
      description: "肩颈放松",
      tags: ["放松"]
    }
  ]
};

function renderView(
  viewModel = model,
  walletSummary = {
    activeCurrency: "TEST_NDP" as const,
    hasTestNdpWallet: true,
    ndp: { available: 12_500, frozen: 0 },
    testNdp: { available: 800, frozen: 0 }
  },
  language?: "zh" | "zh-Hant" | "ja" | "en" | "ko"
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(TechnicianProfileInfoView, {
        model: viewModel,
        language,
        walletSummary,
        privacySlot: createElement("div", null, "隐私模式"),
        serviceAction: () => createElement("button", { type: "button" }, "编辑服务")
      })
    )
  );
}

describe("TechnicianProfileInfoView", () => {
  it("shows the authored bio for the active content language", () => {
    const markup = renderView({ ...model, bioLocales: { "zh-CN": "中文护理介绍", ja: "日本語の紹介" } }, undefined, "zh");
    expect(markup).toContain("中文护理介绍");
    expect(markup).not.toContain("日本語の紹介");
    expect(renderView({ ...model, bioLocales: { "zh-CN": "中文护理介绍", ja: "日本語の紹介" } }, undefined, "ja")).toContain("日本語の紹介");
    expect(renderView({ ...model, bioLocales: { "zh-CN": "中文护理介绍" } }, undefined, "en")).toContain(model.bio);
  });
  it("copies the formal technician ID when its row is clicked", async () => {
    clipboardMocks.copyTextToClipboard.mockReset().mockResolvedValue(true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<MemoryRouter><TechnicianProfileInfoView model={model} /></MemoryRouter>));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="复制 NeeDo ID"]')?.click());

    expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith("s0000000081");
    expect(container.textContent).toContain("已复制");
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the approved metrics and basic-information order", () => {
    const markup = renderView();
    const years = markup.indexOf("从业年数");
    const acceptance = markup.indexOf("接单率");
    const reviews = markup.indexOf("评价");
    const completed = markup.indexOf("完成订单数");
    const gender = markup.indexOf("性别");
    const languages = markup.indexOf("语言能力");
    const introduction = markup.indexOf("自我介绍");
    const special = markup.indexOf("特殊标签");
    const custom = markup.indexOf(">标签<");
    const privacy = markup.indexOf("隐私模式");
    const services = markup.indexOf("服务信息");

    expect(years).toBeLessThan(acceptance);
    expect(acceptance).toBeLessThan(reviews);
    expect(reviews).toBeLessThan(completed);
    expect(gender).toBeLessThan(languages);
    expect(languages).toBeLessThan(introduction);
    expect(introduction).toBeLessThan(special);
    expect(special).toBeLessThan(custom);
    expect(custom).toBeLessThan(privacy);
    expect(privacy).toBeLessThan(services);
    expect(markup).toContain('data-testid="technician-profile-completed-orders"');
    expect(markup).toContain('data-testid="technician-profile-wallet"');
    expect(markup).toContain('data-testid="technician-profile-secondary-metrics"');
    expect(markup).toContain("NDP");
    expect(markup).toContain("12,500");
    expect(markup).toContain("Test NDP 800");
    expect(markup).toContain('data-testid="technician-profile-services"');
  });

  it("pins every basic-information field to a stable grid column", () => {
    const template = document.createElement("template");
    template.innerHTML = renderView();
    const grid = template.content.querySelector('[data-testid="technician-profile-basic-grid"]');

    expect(grid).not.toBeNull();
    expect(Array.from(grid?.children ?? []).map((element) => element.className)).toEqual([
      expect.stringContaining("col-start-1"),
      expect.stringContaining("col-start-2"),
      expect.stringContaining("col-start-3")
    ]);
  });

  it("uses profile defaults without inventing unavailable service-card aggregates", () => {
    const markup = renderView({
      ...model,
      acceptanceRatePercent: null,
      ratingAverage: null,
      reviewCount: null,
      completedOrderCount: null
    });
    const text = markup.replace(/<[^>]+>/g, "");

    expect(text).toContain("接单率100%");
    expect(text).toContain("评价5.0/5");
    expect(text).toContain("0 次");
    expect(text).toContain("完成订单数0");
    expect(text).toContain("-");
    expect(text).not.toContain("未读取");
  });

  it("always shows four fixed counts and only shows custom multipliers above one", () => {
    const text = renderView().replace(/<[^>]+>/g, "");

    expect(text).toContain("魅力max×0");
    expect(text).toContain("服务max×0");
    expect(text).toContain("情绪max×0");
    expect(text).toContain("元气max×0");
    expect(text).toContain("手法细致");
    expect(text).not.toContain("手法细致 ×1");
    expect(text).toContain("沟通耐心 ×2");
  });

  it("uses canonical fixed stamp labels instead of DTO labels", () => {
    const markup = renderView({
      ...model,
      reviewTagSummary: {
        ...model.reviewTagSummary,
        special: [
          { code: "appeal_max", label: "错误魅力", count: 4 },
          { code: "service_max", label: "错误服务", count: 3 },
          { code: "emotion_max", label: "错误情绪", count: 2 },
          { code: "energy_max", label: "错误元气", count: 1 }
        ]
      }
    });

    expect(markup).toContain('aria-label="魅力max ×4"');
    expect(markup).toContain('aria-label="服务max ×3"');
    expect(markup).toContain('aria-label="情绪max ×2"');
    expect(markup).toContain('aria-label="元气max ×1"');
    expect(markup).not.toContain("错误魅力");
    expect(markup).not.toContain("错误服务");
    expect(markup).not.toContain("错误情绪");
    expect(markup).not.toContain("错误元气");
  });

  it("renders four theme-aware borderless icon stamps with compact labels", () => {
    const markup = renderView();
    const specialAt = markup.indexOf('data-testid="technician-info-special-tags"');
    const specialTag = markup.slice(markup.lastIndexOf("<section", specialAt), markup.indexOf(">", specialAt) + 1);

    expect(markup).toContain('class="social-profile-review-stamps mt-2 grid grid-cols-4 gap-1 px-0.5 pt-1.5"');
    expect(markup).toContain('data-testid="theme-review-stamp-icon"');
    expect(markup.match(/data-testid="theme-review-stamp-icon"/gu)).toHaveLength(4);
    expect(markup).toContain("text-[color:var(--client-primary)]");
    expect(markup).toContain("color:var(--client-primary)");
    expect(markup).toContain('data-review-stamp-code="appeal_max"');
    expect(markup).toContain('data-review-stamp-code="energy_max"');
    expect(specialTag).not.toContain("border");
    expect(specialTag).not.toContain("panelClassName");
    expect(styles).toMatch(/\.social-profile-review-stamps \.service-review-stamp \{[\s\S]*?border: 0;[\s\S]*?background: none;[\s\S]*?box-shadow: none;/);
    expect(styles).toMatch(/\.social-profile-review-stamps \.service-review-stamp::before,[\s\S]*?content: none;/);
    expect(styles).toContain("--profile-review-stamp-color: var(--client-primary)");
    expect(styles).not.toContain("--profile-review-stamp-color: color-mix");
  });

  it("injects service actions without adding an outer service frame", () => {
    const markup = renderView();
    const servicesStart = markup.indexOf('data-testid="technician-profile-services"');
    const servicesOpenTag = markup.slice(markup.lastIndexOf("<section", servicesStart), markup.indexOf(">", servicesStart) + 1);

    expect(markup).toContain("编辑服务");
    expect(servicesOpenTag).not.toContain("border");
  });
});
