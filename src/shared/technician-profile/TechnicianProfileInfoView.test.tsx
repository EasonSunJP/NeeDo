import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { TechnicianProfileInfoModel } from "./model";
import { TechnicianProfileInfoView } from "./TechnicianProfileInfoView";

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
      usageCount: 18,
      shopPublicId: "shop0000000071",
      shopAddress: "東京都港区",
      description: "肩颈放松",
      tags: ["放松"]
    }
  ]
};

function renderView(viewModel = model) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(TechnicianProfileInfoView, {
        model: viewModel,
        privacySlot: createElement("div", null, "隐私模式"),
        serviceAction: () => createElement("button", { type: "button" }, "编辑服务")
      })
    )
  );
}

describe("TechnicianProfileInfoView", () => {
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
    expect(markup).toContain('data-testid="technician-profile-services"');
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

  it("injects service actions without adding an outer service frame", () => {
    const markup = renderView();
    const servicesStart = markup.indexOf('data-testid="technician-profile-services"');
    const servicesOpenTag = markup.slice(markup.lastIndexOf("<section", servicesStart), markup.indexOf(">", servicesStart) + 1);

    expect(markup).toContain("编辑服务");
    expect(servicesOpenTag).not.toContain("border");
  });
});
