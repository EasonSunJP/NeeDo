import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Technician } from "../../types/domain";
import {
  TechnicianPublicInfoCard,
  translateTechnicianContactCardText,
} from "./TechnicianPublicInfoCard";
import type { TechnicianFormalContactCardData } from "./types";

const technician: Technician = {
  id: "81",
  systemId: "s0000000081",
  name: "小林技师",
  nickname: "小林技师",
  storeId: "71",
  role: "therapist",
  status: "available",
  rating: 4.8,
  orderCount: 999,
  income: 0,
  skills: ["旧数据标签不得显示"],
  profileTags: ["旧资料标签不得显示"],
  serviceAreas: ["新宿区"],
  acceptRate: 12,
  cancelRate: 0,
  reviewCount: 132,
  languages: ["日本語", "中文"],
  avatar: "/images/generated/profiles/profile-01.jpg",
  age: "29",
  height: "178",
  bio: "预约前请联系。",
  paymentMethods: ["cash"],
};

const formalData: TechnicianFormalContactCardData = {
  metrics: {
    completedOrderCount: 1_281,
    ratingAverage: "4.80",
    reviewCount: 132,
    acceptanceRateBps: 10_000,
  },
  contactDetails: {
    bidBudgetMinJpy: 12_001,
    bidBudgetMaxJpy: 28_009,
    paymentMethods: ["platform", "offline"],
    specialTags: ["准时"],
    profileTags: ["深度放松"],
    services: [
      {
        id: 901,
        shopId: 71,
        name: "肩颈调理",
        priceAmount: 8_801,
        currency: "JPY",
        durationMinutes: 61,
        taxIncluded: true,
        sortOrder: 0,
      },
    ],
  },
};

function render(formal?: TechnicianFormalContactCardData) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(TechnicianPublicInfoCard, {
        dynamicTo: "/social/technicians/81",
        formalData: formal,
        technician,
      }),
    ),
  );
}

describe("TechnicianPublicInfoCard formal contact data", () => {
  it("localizes contact-only empty states in all five App languages", () => {
    const keys = [
      "未设置接单预算",
      "未设置支付方式",
      "暂无特殊标签",
      "暂无标签",
      "暂无服务信息",
      "分钟（含税）",
    ] as const;
    const languages = ["zh", "zh-Hant", "ja", "en", "ko"] as const;

    for (const key of keys) {
      for (const language of languages) {
        const value = translateTechnicianContactCardText(key, language);
        expect(value.trim().length, `${key}:${language}`).toBeGreaterThan(0);
        if (language !== "zh") expect(value, `${key}:${language}`).not.toBe(key);
      }
    }
  });

  it("renders formal completed orders, rating, and acceptance rate in the metric row", () => {
    const markup = render(formalData);

    expect(markup).toContain("1,281");
    expect(markup).toContain("4.8");
    expect(markup).toContain("132 人评价");
    expect(markup).toContain("接单率");
    expect(markup).toContain("100%");
    expect(markup).not.toContain(">999<");
    expect(markup).not.toContain("12%");
  });

  it("renders authorized fields in order with tax-inclusive service duration", () => {
    const markup = render(formalData);
    const budget = markup.indexOf("接单预算");
    const payment = markup.indexOf("支持支付方式");
    const introduction = markup.indexOf("自我介绍");
    const special = markup.indexOf("特殊标签");
    const tags = markup.indexOf(">标签<");
    const services = markup.indexOf("服务信息");

    expect(budget).toBeGreaterThan(-1);
    expect(payment).toBeGreaterThan(budget);
    expect(introduction).toBeGreaterThan(payment);
    expect(special).toBeGreaterThan(introduction);
    expect(tags).toBeGreaterThan(special);
    expect(services).toBeGreaterThan(tags);
    expect(markup).toContain("¥12,001");
    expect(markup).toContain("¥28,009");
    expect(markup).toContain("平台支付、线下支付");
    expect(markup).toContain("准时");
    expect(markup).toContain("深度放松");
    expect(markup).toContain("肩颈调理");
    expect(markup).toContain("¥8,801");
    expect(markup).toContain("61 分钟");
    expect(markup).toContain("含税");
    expect(markup).not.toContain("latitude");
    expect(markup).not.toContain("longitude");
  });

  it("shows authorized empty states and never falls back to legacy private fields", () => {
    const emptyMarkup = render({
      ...formalData,
      contactDetails: {
        bidBudgetMinJpy: null,
        bidBudgetMaxJpy: null,
        paymentMethods: [],
        specialTags: [],
        profileTags: [],
        services: [],
      },
    });
    const publicMarkup = render();

    expect(emptyMarkup).toContain("未设置接单预算");
    expect(emptyMarkup).toContain("未设置支付方式");
    expect(emptyMarkup).toContain("暂无特殊标签");
    expect(emptyMarkup).toContain("暂无标签");
    expect(emptyMarkup).toContain("暂无服务信息");
    expect(publicMarkup).not.toContain("接单预算");
    expect(publicMarkup).not.toContain("支持支付方式");
    expect(publicMarkup).not.toContain("旧数据标签不得显示");
    expect(publicMarkup).not.toContain("旧资料标签不得显示");
    expect(publicMarkup).not.toContain("现金支付");
  });
});
