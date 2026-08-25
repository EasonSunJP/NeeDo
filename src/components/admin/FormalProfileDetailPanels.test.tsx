import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  BackofficeOrderPayload,
  BackofficeCustomerDetailPayload,
  BackofficeScheduleSlotPayload,
  BackofficeTechnicianDetailPayload
} from "../../api/backofficeRealData";
import { translateText, type Language } from "../../i18n/translations";
import {
  FormalCustomerDetailPanel,
  FormalTechnicianDetailPanel,
  formatFormalScheduleMinutes,
  resolveFormalTabKeyboardIndex
} from "./FormalProfileDetailPanels";
import source from "./FormalProfileDetailPanels.tsx?raw";

const baseScheduleSlot: BackofficeScheduleSlotPayload = {
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
};

const baseBooking: BackofficeOrderPayload = {
  id: 501,
  orderNo: "BK-20260827-0501",
  status: "confirmed",
  paymentStatus: "confirmed",
  customerUserId: 2044,
  customerName: "田中 葵",
  serviceId: 51,
  serviceName: "訪問ケア 60分",
  shopId: 8,
  shopName: "NeeDo 青山店",
  technicianProfileId: 31,
  technicianName: "佐藤 美香",
  fulfillmentMode: "home",
  priceAmount: 12000,
  currency: "JPY",
  startsAt: "2026-08-27T01:00:00.000Z",
  endsAt: "2026-08-27T02:00:00.000Z",
  note: null,
  cancelReason: null,
  createdAt: "2026-08-20T01:00:00.000Z",
  updatedAt: "2026-08-20T01:00:00.000Z"
};

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
  upcomingSchedule: [baseScheduleSlot],
  compensationProfile: null,
  timeline: [{
    id: "audit-1",
    action: "technician.profile.updated",
    actorName: "运营管理员",
    actorAvatarUrl: null,
    createdAt: "2026-08-24T08:00:00.000Z",
    metadata: {
      message: "更新了技师档案",
      reason: "资料复核",
      changedFields: ["city", "bio"],
      approved: true,
      source: { system: "formal-backoffice", version: 2 }
    }
  }, {
    id: "audit-unknown",
    action: "custom.audit.action",
    actorName: "审计服务",
    actorAvatarUrl: null,
    createdAt: "2026-08-24T09:00:00.000Z",
    metadata: { message: "保留原始正式动作" }
  }, {
    id: "audit-empty",
    action: "custom.empty.action",
    actorName: "审计服务",
    actorAvatarUrl: null,
    createdAt: "2026-08-24T10:00:00.000Z",
    metadata: null
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
  bookingStatusTotals: { completed: 4, in_service: 1, inService: 1, cancelled: 1 },
  completedSpendJpy: 48000,
  nextBooking: null,
  recentBookings: [],
  reviewSummary: null,
  timeline: []
};

function assertExactTabRelationships(markup: string, expectedCount: number) {
  const controls = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
  const tabIds = [...markup.matchAll(/id="([^"]+-tab-\d+)"/g)].map((match) => match[1]);
  const labelledBy = [...markup.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);

  expect(controls).toHaveLength(expectedCount);
  expect(new Set(controls).size).toBe(expectedCount);
  expect(markup.match(/role="tabpanel"/g)).toHaveLength(expectedCount);
  for (const controlledPanelId of controls) {
    expect(markup).toContain(`id="${controlledPanelId}"`);
  }
  for (const labelledTabId of labelledBy) {
    expect(tabIds).toContain(labelledTabId);
  }
}

describe("formal profile tab accessibility", () => {
  it("renders seven technician tabs and one existing labelled panel for every aria-controls", () => {
    const markup = renderToStaticMarkup(<FormalTechnicianDetailPanel detail={technicianDetail} />);

    for (const label of ["基础资料", "状态与数据", "技能与服务", "排班偏好", "薪酬设置", "权限与账号", "时间线"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup.match(/role="tab"/g)).toHaveLength(7);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain("overflow-x-auto");
    assertExactTabRelationships(markup, 7);
  });

  it("renders four customer tabs and exact tab-to-panel relationships", () => {
    const markup = renderToStaticMarkup(<FormalCustomerDetailPanel detail={customerDetail} />);

    for (const label of ["基础资料", "预约与消费", "权限与账号", "时间线"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
    assertExactTabRelationships(markup, 4);
  });

  it("implements roving Arrow/Home/End navigation including wrapping", () => {
    expect(resolveFormalTabKeyboardIndex("ArrowRight", 0, 7)).toBe(1);
    expect(resolveFormalTabKeyboardIndex("ArrowRight", 6, 7)).toBe(0);
    expect(resolveFormalTabKeyboardIndex("ArrowLeft", 0, 7)).toBe(6);
    expect(resolveFormalTabKeyboardIndex("ArrowLeft", 3, 7)).toBe(2);
    expect(resolveFormalTabKeyboardIndex("Home", 4, 7)).toBe(0);
    expect(resolveFormalTabKeyboardIndex("End", 1, 7)).toBe(6);
    expect(resolveFormalTabKeyboardIndex("Enter", 2, 7)).toBeNull();
  });

  it("changes the selected tab and visible panel from the initial tab contract", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={technicianDetail} initialTab="技能与服务" />
    );
    const selectedTab = markup.match(/<button[^>]*aria-selected="true"[^>]*id="([^"]+)"[^>]*>/)?.[1];

    expect(selectedTab).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${selectedTab}"`);
    expect(markup).toMatch(new RegExp(`aria-labelledby="${selectedTab}"[^>]*role="tabpanel"[^>]*tabindex="0"`));
  });
});

describe("FormalTechnicianDetailPanel formal-data boundaries", () => {
  it("renders profile, account, and scoped identifiers exactly without locale grouping", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{
        ...technicianDetail,
        id: 2031,
        account: {
          ...technicianDetail.account,
          roles: [{ ...technicianDetail.account.roles[0], scopeId: 3008 }],
          identities: [{ ...technicianDetail.account.identities[0], scopeId: 4008 }]
        }
      }} />
    );

    for (const exactId of ["#2031", "#1031", "shop #3008", "shop #4008"]) {
      expect(markup).toContain(exactId);
    }
    for (const groupedId of ["#2,031", "#1,031", "shop #3,008", "shop #4,008"]) {
      expect(markup).not.toContain(groupedId);
    }
  });

  it("renders every formal technician section and page-owned slots", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel
        actionContent={<button type="button">停用账号</button>}
        detail={technicianDetail}
        editContent={<form aria-label="正式技师编辑表单" />}
      />
    );

    for (const content of [
      "身份与基础资料", "业务状态与正式指标", "正式启用服务", "近期正式排班",
      "薪酬设置", "账号状态", "角色", "身份", "正式审计时间线",
      "訪問ケア 60分", "¥186,000", "¥12,000", "停用账号"
    ]) {
      expect(markup).toContain(content);
    }
    expect(markup).toContain('aria-label="正式技师编辑表单"');
  });

  it("always shows all three unavailable metrics even when the API hint array is empty", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{ ...technicianDetail, unavailableMetrics: [] }} />
    );

    for (const label of ["接单率", "迟到情况", "排班偏好"]) {
      expect(markup).toMatch(new RegExp(`${label}[\\s\\S]*?尚未接入正式数据`));
    }
  });

  it("formats exact minute totals without rounding nonzero values", () => {
    expect(formatFormalScheduleMinutes(0, "zh")).toBe("0分钟");
    expect(formatFormalScheduleMinutes(1, "zh")).toBe("1分钟");
    expect(formatFormalScheduleMinutes(59, "zh")).toBe("59分钟");
    expect(formatFormalScheduleMinutes(60, "zh")).toBe("1小时");
    expect(formatFormalScheduleMinutes(61, "zh")).toBe("1小时 1分钟");
  });

  it("uses explicit tones for available, booked, blocked, and unknown schedule states", () => {
    const slots = [
      { ...baseScheduleSlot, id: 1, status: "available" },
      { ...baseScheduleSlot, id: 2, status: "booked" },
      { ...baseScheduleSlot, id: 3, status: "blocked" },
      { ...baseScheduleSlot, id: 4, status: "future_status" }
    ];
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{ ...technicianDetail, upcomingSchedule: slots }} />
    );

    expect(markup).toContain('data-tone="green">可预约');
    expect(markup).toContain('data-tone="blue">已预约');
    expect(markup).toContain('data-tone="red">已阻塞');
    expect(markup).toContain('data-tone="neutral">future_status');
  });

  it("renders structured formal audit metadata and uses unavailable detail without invented prose", () => {
    const markup = renderToStaticMarkup(<FormalTechnicianDetailPanel detail={technicianDetail} />);

    for (const formalValue of ["更新了技师档案", "资料复核", "city", "bio", "formal-backoffice", "2", "保留原始正式动作"]) {
      expect(markup).toContain(formalValue);
    }
    expect(markup).toContain('data-tone="neutral"');
    expect(markup).toMatch(/custom\.empty\.action[\s\S]*?尚未接入正式数据/);
    expect(markup).not.toContain("记录了 custom.empty.action");
  });

  it("normalizes recursively empty structured metadata to the localized unavailable state", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{
        ...technicianDetail,
        timeline: [{
          id: "audit-empty-values",
          action: "custom.empty.values",
          actorName: "审计服务",
          actorAvatarUrl: null,
          createdAt: "2026-08-24T10:00:00.000Z",
          metadata: { reason: "  ", changedFields: [], source: {} }
        }]
      }} />
    );

    for (const label of ["原因", "变更字段", "来源"]) {
      expect(markup).toMatch(new RegExp(`${label}[\\s\\S]*?尚未接入正式数据`));
    }
  });

  it("uses a neutral missing-avatar placeholder instead of deriving a fake identity", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{ ...technicianDetail, account: { ...technicianDetail.account, avatarUrl: null } }} />
    );

    expect(markup).toContain('aria-label="未提供头像"');
    expect(markup).not.toContain("<span>运</span>");
    expect(source).not.toContain("displayName.slice");
    expect(source).not.toContain('|| "N"');
  });

  it("shows explicit null and empty formal sections without generated substitutes", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{
        ...technicianDetail,
        account: { ...technicianDetail.account, roles: [], identities: [] },
        compensationProfile: null,
        reviewSummary: null,
        services: [],
        upcomingSchedule: [],
        timeline: []
      }} />
    );

    for (const emptyLabel of ["尚未接入正式数据", "当前没有近期正式排班", "当前没有正式角色记录", "当前没有正式身份记录", "暂无正式审计记录"]) {
      expect(markup).toContain(emptyLabel);
    }
  });

  it("renders every typed compensation field when the formal contract supplies it", () => {
    const markup = renderToStaticMarkup(
      <FormalTechnicianDetailPanel detail={{
        ...technicianDetail,
        compensationProfile: {
          id: 91,
          shopId: 8,
          technicianProfileId: 31,
          name: "青山正式报酬方案",
          status: "active",
          version: 3,
          wageMode: "hybrid",
          baseSalaryJpy: 180000,
          hourlyRateJpy: 1500,
          dailyRateJpy: 12000,
          fixedOrderPayJpy: 3200,
          commissionRatePercent: 18.5,
          guaranteedMinimumJpy: 220000,
          ndpFeeBearer: "shop",
          technicianNdpSharePercent: 72.5,
          effectiveFrom: "2026-08-01T00:00:00.000Z",
          effectiveTo: null,
          updatedAt: "2026-08-24T00:00:00.000Z"
        }
      }} />
    );

    for (const value of ["青山正式报酬方案", "混合", "¥180,000", "¥1,500", "¥12,000", "¥3,200", "18.5%", "¥220,000", "shop", "72.5%"] ) {
      expect(markup).toContain(value);
    }
  });
});

describe("FormalCustomerDetailPanel formal-data boundaries", () => {
  it("renders every customer section plus both page-owned slots", () => {
    const markup = renderToStaticMarkup(
      <FormalCustomerDetailPanel
        actionContent={<button type="button">管理账号</button>}
        detail={customerDetail}
        editContent={<form aria-label="正式客户编辑表单" />}
      />
    );

    for (const content of ["身份与基础资料", "预约与消费汇总", "下次预约", "近期预约", "账号状态", "正式审计时间线", "¥48,000", "管理账号"]) {
      expect(markup).toContain(content);
    }
    expect(markup).toContain('aria-label="正式客户编辑表单"');
    expect(markup.match(/尚未接入正式数据/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("does not emit duplicate React keys for repeated highlights or status aliases", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderToStaticMarkup(<FormalTechnicianDetailPanel detail={{
      ...technicianDetail,
      reviewSummary: { ...technicianDetail.reviewSummary!, highlights: ["丁寧", "丁寧"] }
    }} />);
    renderToStaticMarkup(<FormalCustomerDetailPanel detail={customerDetail} />);

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    consoleError.mockRestore();
  });

  it("renders formal next and recent booking rows including status and payment fields", () => {
    const markup = renderToStaticMarkup(
      <FormalCustomerDetailPanel detail={{
        ...customerDetail,
        nextBooking: baseBooking,
        recentBookings: [{ ...baseBooking, id: 502, orderNo: "BK-20260820-0502", status: "completed" }]
      }} />
    );

    for (const value of ["BK-20260827-0501", "BK-20260820-0502", "已确认", "已完成", "已确认收款", "¥12,000"]) {
      expect(markup).toContain(value);
    }
  });

  it("uses exact account, visibility, missing-bio, avatar-alt, and approval translation keys", () => {
    const activePublicMarkup = renderToStaticMarkup(
      <FormalCustomerDetailPanel detail={{ ...customerDetail, bio: null, isPublic: true }} />
    );
    const inactivePrivateMarkup = renderToStaticMarkup(
      <FormalCustomerDetailPanel detail={{
        ...customerDetail,
        account: { ...customerDetail.account, isActive: false },
        isPublic: false
      }} />
    );
    const technicianMarkup = renderToStaticMarkup(<FormalTechnicianDetailPanel detail={technicianDetail} />);

    for (const value of ["账号启用", "资料公开", "未填写"]) {
      expect(activePublicMarkup).toContain(value);
    }
    for (const value of ["账号停用", "资料非公开"]) {
      expect(inactivePrivateMarkup).toContain(value);
    }
    expect(technicianMarkup).toContain('alt="佐藤 美香 头像"');
    expect(technicianMarkup).toContain("已批准");
  });
});

describe("formal profile localization and dependency boundary", () => {
  it("supplies supported translations and locale-aware duration formatting", () => {
    expect(translateText("尚未接入正式数据", "ja")).toBe("正式データ未連携");
    expect(translateText("预约与消费", "en")).toBe("Bookings & Spend");
    expect(translateText("权限与账号", "ko")).toBe("권한 및 계정");
    expect(translateText("迟到情况", "zh-Hant")).toBe("遲到情況");
    expect(formatFormalScheduleMinutes(60, "ja")).toBe("1時間");
    expect(formatFormalScheduleMinutes(59, "en")).toBe("59 min");
  });

  it("provides semantically exact Task 4 state and fallback copy in every supported language", () => {
    const expected: Record<Language, Record<string, string>> = {
      zh: {
        账号启用: "账号启用", 账号停用: "账号停用", 资料公开: "资料公开", 资料非公开: "资料非公开",
        未填写: "未填写", 头像: "头像", 已批准: "已批准"
      },
      "zh-Hant": {
        账号启用: "帳號啟用", 账号停用: "帳號停用", 资料公开: "資料公開", 资料非公开: "資料非公開",
        未填写: "未填寫", 头像: "頭像", 已批准: "已批准"
      },
      ja: {
        账号启用: "アカウント有効", 账号停用: "アカウント停止", 资料公开: "プロフィール公開", 资料非公开: "プロフィール非公開",
        未填写: "未入力", 头像: "プロフィール画像", 已批准: "承認済み"
      },
      en: {
        账号启用: "Account active", 账号停用: "Account inactive", 资料公开: "Profile public", 资料非公开: "Profile private",
        未填写: "Not provided", 头像: "Profile image", 已批准: "Approved"
      },
      ko: {
        账号启用: "계정 활성", 账号停用: "계정 비활성", 资料公开: "프로필 공개", 资料非公开: "프로필 비공개",
        未填写: "미입력", 头像: "프로필 이미지", 已批准: "승인됨"
      }
    };

    for (const [language, entries] of Object.entries(expected) as Array<[Language, Record<string, string>]>) {
      for (const [sourceText, translatedText] of Object.entries(entries)) {
        expect(translateText(sourceText, language)).toBe(translatedText);
      }
    }
  });

  it("does not hard-code locales or depend on legacy/generated/write-capable sources", () => {
    const prohibited = [
      "TechnicianProfilePanel", "CustomerManagementModule", "/data/mock", "backofficeRealDataApi",
      "httpClient", "useEntityStore", "useScheduleStore", "localStorage", "sessionStorage",
      "parseBrowserStorage", "writeBrowserStorage", "Math.random", "fetch(", "axios", "记录了 ${",
      "displayName.slice", '|| "N"', 'DateTimeFormat("zh-CN"', 'NumberFormat("ja-JP"'
    ];

    for (const forbidden of prohibited) {
      expect(source).not.toContain(forbidden);
    }
  });
});
