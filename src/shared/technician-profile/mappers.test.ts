import { describe, expect, it } from "vitest";
import type { CoreTechnicianDetail } from "../../features/core-read/api";
import type { TechnicianSelfProfile } from "../../features/core-read/technicianProfileApi";
import type { TechnicianServicePayload } from "../../features/pricing-mode/api";
import { fromCoreTechnicianDetail, fromTechnicianSelfProfile } from "./mappers";

const reviewTagSummary = {
  special: [
    { code: "appeal_max" as const, label: "魅力max", count: 3 },
    { code: "service_max" as const, label: "服务max", count: 0 },
    { code: "emotion_max" as const, label: "情绪max", count: 1 },
    { code: "energy_max" as const, label: "元气max", count: 0 }
  ],
  custom: [{ label: "手法细致", count: 2 }]
};

const service = {
  id: 91,
  publicId: "service0000000091",
  name: "肩颈调理",
  description: "肩颈放松",
  priceAmount: 8800,
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 18,
  coverImageUrl: "/service.jpg",
  images: [],
  tags: ["放松"],
  shop: { publicId: "shop0000000071", name: "LifeDance", address: "東京都港区" }
} as unknown as TechnicianServicePayload;

describe("technician profile information mappers", () => {
  it("combines the editable self profile with formal public metrics and technician services", () => {
    const selfProfile = {
      publicId: "s0000000081",
      displayName: "小林技师",
      avatarUrl: "/avatar.jpg",
      gender: "female",
      age: 29,
      heightCm: 168,
      languages: ["日本語", "中文"],
      bio: "预约前请联系。",
      employmentType: "full_time",
      yearsExperience: 8,
      reviewTagSummary
    } as TechnicianSelfProfile;
    const detail = {
      acceptanceRatePercent: 98,
      completedOrderCount: 1281,
      reviewSummary: { ratingAverage: "4.80", reviewCount: 132 }
    } as CoreTechnicianDetail;

    expect(fromTechnicianSelfProfile(selfProfile, detail, [service])).toMatchObject({
      publicId: "s0000000081",
      identityLabel: "店铺所属",
      gender: "female",
      yearsExperience: 8,
      acceptanceRatePercent: 98,
      ratingAverage: 4.8,
      reviewCount: 132,
      completedOrderCount: 1281,
      reviewTagSummary,
      services: [{ shopPublicId: "shop0000000071", completedOrderCount: 18 }]
    });
  });

  it("maps the formal public technician detail without reading legacy profile tags", () => {
    const detail = {
      publicId: "s0000000081",
      displayName: "小林技师",
      avatarUrl: "/avatar.jpg",
      shop: null,
      gender: "private",
      age: 29,
      heightCm: 168,
      languages: ["日本語"],
      bio: "公开简介",
      yearsExperience: 5,
      acceptanceRatePercent: 96,
      completedOrderCount: 88,
      reviewSummary: { ratingAverage: "4.90", reviewCount: 12 },
      reviewTagSummary
    } as CoreTechnicianDetail;

    expect(fromCoreTechnicianDetail(detail, [service])).toMatchObject({
      identityLabel: "个人技师",
      ratingAverage: 4.9,
      reviewTagSummary,
      services: [{ id: "91" }]
    });
  });
});
