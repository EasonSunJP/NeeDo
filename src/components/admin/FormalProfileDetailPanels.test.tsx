import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  BackofficeCustomerDetailPayload,
  BackofficeTechnicianDetailPayload
} from "../../api/backofficeRealData";
import {
  FormalCustomerDetailPanel,
  FormalTechnicianDetailPanel
} from "./FormalProfileDetailPanels";
import source from "./FormalProfileDetailPanels.tsx?raw";

const technicianDetail: BackofficeTechnicianDetailPayload = {
  id: 31,
  userId: 1031,
  displayName: "佐藤 美香",
  email: "mika@example.jp",
  shopId: 8,
  shopName: "NeeDo 青山店",
  city: "東京都港区",
  serviceArea: "港区, 渋谷区",
  status: "published",
  verifiedAt: "2026-08-01T02:00:00.000Z",
  createdAt: "2026-07-01T01:00:00.000Z",
  updatedAt: "2026-08-24T08:00:00.000Z",
  bio: "訪問ケアとリラクゼーションを担当します。",
  yearsExperience: 6,
  isRecommended: true,
  account: {
    username: "mika.sato",
    email: "mika@example.jp",
    phone: "+819012345678",
    avatarUrl: "/images/mika.jpg",
    isActive: true,
    lastLoginAt: "2026-08-24T09:30:00.000Z",
    roles: [{ name: "技师", code: "technician", scopeType: "shop", scopeId: 8 }],
    identities: [{ type: "technician", scopeType: "shop", scopeId: 8, displayName: "佐藤 美香" }]
  },
  statistics: {
    bookingCount: 18,
    completedCount: 15,
    cancelledCount: 3,
    completedRevenueJpy: 186000,
    todayScheduleMinutes: 240,
    weekScheduleMinutes: 1320,
    monthScheduleMinutes: 5280
  },
  reviewSummary: {
    ratingAverage: 4.8,
    reviewCount: 12,
    latestReviewAt: "2026-08-23T04:00:00.000Z",
    highlights: ["丁寧", "時間厳守"]
  },
  services: [{
    id: 51,
    source: "technician_service",
    sourceShopServiceId: 151,
    name: "訪問ケア 60分",
    description: "ご自宅でのケア",
    categoryId: 4,
    priceAmount: 12000,
    currency: "JPY",
    durationMinutes: 60,
    isRecommended: true
  }],
  upcomingSchedule: [{
    id: 71,
    serviceId: 51,
    serviceName: "訪問ケア 60分",
    shopId: 8,
    shopName: "NeeDo 青山店",
    technicianProfileId: 31,
    technicianName: "佐藤 美香",
    startsAt: "2026-08-27T01:00:00.000Z",
    endsAt: "2026-08-27T02:00:00.000Z",
    capacity: 1,
    bookedCount: 1,
    status: "booked"
  }],
  compensationProfile: null,
  timeline: [{
    id: "audit-1",
    action: "technician.profile.updated",
    actorName: "运营管理员",
    actorAvatarUrl: null,
    createdAt: "2026-08-24T08:00:00.000Z",
    metadata: { message: "更新了技师档案" }
  }],
  unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
};

const customerDetail: BackofficeCustomerDetailPayload = {
  id: 44,
  userId: 2044,
  displayName: "田中 葵",
  email: "aoi@example.jp",
  city: "東京都新宿区",
  membershipLevel: "premium",
  isPublic: true,
  bookingCount: 6,
  createdAt: "2026-05-01T01:00:00.000Z",
  updatedAt: "2026-08-20T03:00:00.000Z",
  bio: null,
  account: {
    username: "aoi.tanaka",
    email: "aoi@example.jp",
    phone: null,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: "2026-08-24T03:00:00.000Z",
    roles: [{ name: "普通用户", code: "customer", scopeType: "global", scopeId: null }],
    identities: [{ type: "customer", scopeType: "global", scopeId: null, displayName: "田中 葵" }]
  },
  bookingStatusTotals: { completed: 4, confirmed: 1, cancelled: 1 },
  completedSpendJpy: 48000,
  nextBooking: null,
  recentBookings: [],
  reviewSummary: null,
  timeline: []
};

describe("FormalTechnicianDetailPanel", () => {
  it("renders all seven formal technician tabs as an accessible, horizontally scrollable tab list", () => {
    const markup = renderToStaticMarkup(<FormalTechnicianDetailPanel detail={technicianDetail} />);

    for (const label of ["基础资料", "状态与数据", "技能与服务", "排班偏好", "薪酬设置", "权限与账号", "时间线"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup.match(/role="tab"/g)).toHaveLength(7);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("overflow-x-auto");
  });

  it("renders only formal statistics and explicit unavailable metrics", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={technicianDetail} initialTab="状态与数据" />
    );

    expect(markup).toContain("18");
    expect(markup).toContain("15");
    expect(markup).toContain("¥186,000");
    expect(markup).toContain("今日排班");
    expect(markup).toContain("4小时");
    expect(markup).toContain("接单率");
    expect(markup).toContain("迟到情况");
    expect(markup.match(/尚未接入正式数据/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("shows formal services and schedule while keeping null compensation explicit", () => {
    const servicesMarkup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={technicianDetail} initialTab="技能与服务" />
    );
    const scheduleMarkup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={technicianDetail} initialTab="排班偏好" />
    );
    const compensationMarkup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={technicianDetail} initialTab="薪酬设置" />
    );

    expect(servicesMarkup).toContain("訪問ケア 60分");
    expect(servicesMarkup).toContain("¥12,000");
    expect(scheduleMarkup).toContain("近期正式排班");
    expect(scheduleMarkup).toContain("排班偏好");
    expect(scheduleMarkup).toContain("尚未接入正式数据");
    expect(compensationMarkup).toContain("薪酬设置");
    expect(compensationMarkup).toContain("尚未接入正式数据");
  });

  it("renders page-owned edit and action slots without owning writes", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel
        actionContent={<button type="button">停用账号</button>}
        detail={technicianDetail}
        editContent={<form aria-label="正式技师编辑表单" />}
      />
    );

    expect(markup).toContain("停用账号");
    expect(markup).toContain('aria-label="正式技师编辑表单"');
  });

  it("does not depend on legacy profiles, browser storage, or generated values", () => {
    for (const forbidden of ["TechnicianProfilePanel", "CustomerManagementModule", "../../data/mock", "localStorage", "sessionStorage", "Math.random"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("FormalCustomerDetailPanel", () => {
  it("renders all four approved customer tabs", () => {
    const markup = renderToStaticMarkup(<FormalCustomerDetailPanel detail={customerDetail} />);

    for (const label of ["基础资料", "预约与消费", "权限与账号", "时间线"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup.match(/role="tab"/g)).toHaveLength(4);
  });

  it("renders formal spend totals and explicit null booking/review sections", () => {
    const markup = renderToStaticMarkup(
      <FormalCustomerDetailPanel detail={customerDetail} initialTab="预约与消费" />
    );

    expect(markup).toContain("¥48,000");
    expect(markup).toContain("已完成");
    expect(markup).toContain("4");
    expect(markup).toContain("下次预约");
    expect(markup).toContain("近期预约");
    expect(markup.match(/尚未接入正式数据/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
