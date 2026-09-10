import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Technician } from "../../types/domain";
import cardSource from "./TechnicianPublicInfoCard.tsx?raw";
import { TechnicianPublicInfoCard } from "./TechnicianPublicInfoCard";
import type { TechnicianFormalContactCardData } from "./types";

const technician: Technician = {
  id: "81",
  systemId: "s0000000081",
  name: "小林技师",
  nickname: "小林技师",
  storeId: "71",
  role: "therapist",
  status: "available",
  rating: 1.2,
  orderCount: 999,
  income: 0,
  skills: ["旧数据标签不得显示"],
  profileTags: ["旧资料标签不得显示"],
  serviceAreas: ["新宿区"],
  acceptRate: 12,
  cancelRate: 0,
  reviewCount: 999,
  languages: ["日本語", "中文"],
  avatar: "/images/generated/profiles/profile-01.jpg",
  age: "29",
  height: "178",
  bio: "预约前请联系。",
  gender: "female",
  identityLabel: "店铺所属技师"
};

const formalData: TechnicianFormalContactCardData = {
  gender: "female",
  yearsExperience: 8,
  metrics: {
    completedOrderCount: 1_281,
    ratingAverage: "4.80",
    reviewCount: 132,
    acceptanceRateBps: 10_000
  },
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 3 },
      { code: "service_max", label: "服务max", count: 0 },
      { code: "emotion_max", label: "情绪max", count: 0 },
      { code: "energy_max", label: "元气max", count: 0 }
    ],
    custom: [{ label: "深度放松", count: 2 }]
  },
  contactDetails: {
    bidBudgetMinJpy: 12_001,
    bidBudgetMaxJpy: 28_009,
    paymentMethods: ["platform", "offline"],
    specialTags: ["旧特殊标签不得显示"],
    profileTags: ["旧普通标签不得显示"],
    services: [
      {
        id: 901,
        publicId: "service0000000901",
        shopId: 71,
        shopPublicId: "shop0000000071",
        shopAddress: "東京都港区",
        name: "肩颈调理",
        description: "肩颈放松",
        priceAmount: 8_801,
        currency: "JPY",
        durationMinutes: 61,
        usageCount: 18,
        coverImageUrl: "/service.jpg",
        tags: ["放松"],
        taxIncluded: true,
        sortOrder: 0
      }
    ]
  }
};

function render(formal?: TechnicianFormalContactCardData) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(TechnicianPublicInfoCard, {
        dynamicTo: "/social/technicians/81",
        formalData: formal,
        technician
      })
    )
  );
}

describe("TechnicianPublicInfoCard formal adapter", () => {
  it("delegates its body to the shared technician profile view", () => {
    expect(cardSource).toContain("TechnicianProfileInfoView");
    expect(cardSource).not.toContain("createPortal");
    expect(cardSource).not.toContain("TechnicianPublicInfoCardModal");
    expect(cardSource).not.toContain("serviceReviewSpecialTags");
    expect(cardSource).not.toContain("bidBudgetMinJpy === null");
    expect(cardSource).not.toContain("details.profileTags.map");
    expect(cardSource).not.toContain("details.specialTags.map");
  });

  it("renders formal metrics, review counts, and the unified service card", () => {
    const markup = render(formalData);
    const text = markup.replace(/<[^>]+>/g, "");

    expect(text).toContain("从业年数8 年");
    expect(text).toContain("接单率100%");
    expect(text).toContain("评价4.8/5");
    expect(text).toContain("完成订单数1,281");
    expect(text).toContain("魅力max×3");
    expect(text).toContain("深度放松 ×2");
    expect(text).toContain("￥8,801");
    expect(text).toContain("61分钟");
    expect(text).toContain("18");
    expect(text).not.toContain("利用次数");
    expect(text).not.toContain("店铺 ID");
    expect(text).not.toContain("店铺地址");
    expect(text).not.toContain("旧特殊标签不得显示");
    expect(text).not.toContain("旧普通标签不得显示");
  });

  it("does not fall back to legacy fake metrics or profile tags when formal data is unavailable", () => {
    const markup = render();
    const text = markup.replace(/<[^>]+>/g, "");

    expect(text).not.toContain("999");
    expect(text).not.toContain("1.2/5");
    expect(text).not.toContain("12%");
    expect(text).not.toContain("旧数据标签不得显示");
    expect(text).not.toContain("旧资料标签不得显示");
  });
});
