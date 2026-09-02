// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMembershipTokyoDate, MembershipAnalyticsPage } from "./MembershipAnalyticsPage";
import { translateTextForContext } from "../../i18n/translations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  membershipTrend: vi.fn(),
  membershipMembers: vi.fn()
}));

vi.mock("../../api/backofficeRealData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/backofficeRealData")>()),
  backofficeRealDataApi: apiMocks
}));
vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../../components/merchant-admin/MerchantAdminLayout", () => ({
  MerchantAdminLayout: ({ children }: { children: (resource: unknown) => ReactNode }) => <>{children({})}</>
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../features/dashboard/DashboardCharts", () => ({
  FixedAnalyticsSeriesChart: ({ series }: { series: Array<{ label: string }> }) => (
    <div data-testid="member-series-chart">{series.map((item) => item.label).join(",")}</div>
  ),
  getAnalyticsSeriesColor: (index: number) => `color-${index}`
}));

const filter = {
  period: "last7days" as const,
  from: "2026-08-27",
  to: "2026-09-02",
  previousFrom: "2026-08-20",
  previousTo: "2026-08-26",
  timeZone: "Asia/Tokyo" as const,
  granularity: "day" as const,
  city: "东京",
  evaluatedAt: "2026-09-02T05:00:00.000Z"
};

const trend = {
  dataStatus: "ready" as const,
  filter,
  series: [
    { seriesKey: "added", label: "Added members", unit: "people" as const,
      points: [{ key: "2026-09-01", label: "09-01", value: 2 }] },
    { seriesKey: "removed", label: "Removed members", unit: "people" as const,
      points: [{ key: "2026-09-01", label: "09-01", value: 1 }] },
    { seriesKey: "net", label: "Net members", unit: "people" as const,
      points: [{ key: "2026-09-01", label: "09-01", value: 1 }] }
  ]
};

const members = {
  list: [{
    userNeedoId: "u0000000041",
    nickname: "美咲",
    city: "东京",
    shopPublicId: "shop0000000071",
    shopName: "青山护理店",
    membershipPublicId: "00000000-0000-4000-8000-000000000031",
    planName: "月度会员",
    cardPublicId: "00000000-0000-4000-8000-000000000481",
    cardNoMasked: "•••• •••• •••• AABB",
    acquisitionSource: "offline_paid" as const,
    addedAt: "2026-08-30T03:00:00.000Z",
    firstPaidAt: "2026-05-01T03:00:00.000Z",
    memberStatus: "active" as const,
    cardStatus: "active" as const,
    expiresAt: "2026-09-30T03:00:00.000Z"
  }],
  total: 1,
  page: 1,
  page_size: 20
};

describe("MembershipAnalyticsPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.membershipTrend.mockResolvedValue(trend);
    apiMocks.membershipMembers.mockResolvedValue(members);
    apiMocks.dashboard.mockResolvedValue({
      filter: { ...filter, availableCities: ["东京", "大阪"] }
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows fixed member trend legends and the formal searchable member list", async () => {
    const router = createMemoryRouter([
      { path: "/admin/analytics/members", element: <MembershipAnalyticsPage scope="backoffice" /> }
    ], { initialEntries: ["/admin/analytics/members?period=last7days&city=%E4%B8%9C%E4%BA%AC"] });
    await act(async () => root.render(<RouterProvider router={router} />));

    expect(apiMocks.membershipTrend).toHaveBeenCalledWith(
      "backoffice",
      { period: "last7days", city: "东京" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(apiMocks.membershipMembers).toHaveBeenCalledWith(
      "backoffice",
      expect.objectContaining({ period: "last7days", city: "东京", page: 1, pageSize: 20 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(container.querySelector('input[aria-label="NeeDo ID"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="昵称"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="重置会员检索"]')).not.toBeNull();
    expect(container.textContent).toContain("u0000000041");
    expect(container.textContent).toContain("美咲");
    expect(container.querySelector('button[aria-label="隐藏减少"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="隐藏减少"]')?.click();
    });
    expect(container.querySelector('button[aria-label="显示减少"]')).not.toBeNull();
  });

  it("formats membership dates against the fixed Tokyo reporting timezone", () => {
    expect(formatMembershipTokyoDate("2026-09-01T14:59:59.000Z")).toBe("2026-09-01");
    expect(formatMembershipTokyoDate("2026-09-01T15:00:00.000Z")).toBe("2026-09-02");
    expect(formatMembershipTokyoDate(null)).toBe("—");
  });

  it("searches by trimmed NeeDo ID and nickname and resets member pagination", async () => {
    const router = createMemoryRouter([
      { path: "/admin/analytics/members", element: <MembershipAnalyticsPage scope="backoffice" /> }
    ], { initialEntries: ["/admin/analytics/members?period=last7days&page=3"] });
    apiMocks.membershipMembers.mockResolvedValue({ ...members, page: 3 });
    await act(async () => root.render(<RouterProvider router={router} />));

    const setInput = (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    await act(async () => {
      setInput("NeeDo ID", " u0000000041 ");
      setInput("昵称", " 美咲 ");
    });
    apiMocks.membershipMembers.mockResolvedValue({ ...members, page: 1 });
    await act(async () => {
      container.querySelector<HTMLFormElement>('form[aria-label="会员列表检索"]')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(router.state.location.search).toBe("?period=last7days&needoId=u0000000041&nickname=%E7%BE%8E%E5%92%B2");
    expect(apiMocks.membershipMembers).toHaveBeenLastCalledWith(
      "backoffice",
      expect.objectContaining({ needoId: "u0000000041", nickname: "美咲", page: 1 }),
      expect.any(Object)
    );
  });

  it("keeps merchant analytics shop-scoped and never forwards a city query", async () => {
    apiMocks.membershipTrend.mockResolvedValue({ ...trend, filter: { ...filter, city: null } });
    apiMocks.dashboard.mockResolvedValue({ filter: { ...filter, city: null, availableCities: [] } });
    const router = createMemoryRouter([
      { path: "/merchant-admin/analytics/members", element: <MembershipAnalyticsPage scope="merchant-admin" /> }
    ], { initialEntries: ["/merchant-admin/analytics/members?period=last7days&city=%E5%A4%A7%E9%98%AA"] });
    await act(async () => root.render(<RouterProvider router={router} />));

    expect(apiMocks.membershipTrend).toHaveBeenCalledWith(
      "merchant-admin",
      { period: "last7days" },
      expect.any(Object)
    );
    expect(apiMocks.membershipMembers).toHaveBeenCalledWith(
      "merchant-admin",
      expect.not.objectContaining({ city: expect.anything() }),
      expect.any(Object)
    );
    expect(container.querySelector('select[aria-label="所属城市"]')).toBeNull();
  });

  it("provides complete five-language membership analytics chrome", () => {
    const sources = [
      "会员数据", "会员详细分析", "查看会员详细分析", "会员列表检索", "检索会员", "重置会员检索",
      "正在加载会员分析", "会员分析加载失败", "重试加载会员分析", "会员增加、减少与净变化",
      "增加", "减少", "净变化", "会员列表", "只显示当前筛选范围内正式会员记录",
      "暂无会员数据", "会员卡/套餐", "加入来源", "首次付费时间", "当前状态", "到期时间",
      "线下付费", "线上付费", "赠送", "试用", "续费", "历史补录", "人工发放"
    ];
    for (const source of sources) {
      for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(translateTextForContext(source, language, { portal: "admin" }).trim()).not.toBe("");
      }
      expect(translateTextForContext(source, "ja", { portal: "admin" })).not.toBe(source);
      expect(translateTextForContext(source, "en", { portal: "admin" })).not.toBe(source);
      expect(translateTextForContext(source, "ko", { portal: "admin" })).not.toBe(source);
    }
  });
});
