// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedUserDetailDrawer } from "./UnifiedUserDetailDrawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ getUser: vi.fn(), listReceivedReviews: vi.fn(), amendReview: vi.fn() }));

vi.mock("./api", () => ({ platformUserManagementApi: state }));
vi.mock("../../components/ui/Drawer", () => ({
  Drawer: ({ children, open, title }: { children: ReactNode; open: boolean; title: string }) => open ? <section><h1>{title}</h1>{children}</section> : null
}));

const detail = {
  id: 41,
  needoId: "u0000000041",
  username: "mia",
  displayName: "Mia",
  email: "mia@example.test",
  phone: null,
  emailBound: true,
  phoneBound: false,
  avatarUrl: "/mia.png",
  city: "Tokyo",
  privacyMode: true,
  privacyScope: "limited",
  isActive: true,
  isTestAccount: false,
  source: ["password"],
  identities: [], roles: [], groups: [], ekycVerified: false,
  membership: { tierCode: "gold", tierVersionPublicId: null, entitlementPublicId: null, expiresAt: null, experienceMultiplier: 2, lockVersion: null },
  experience: { currentLevel: 2, totalExpUnits: "100" },
  ndpBalance: { available: 900, frozen: 0 },
  bookingCount: 3,
  lastLoginAt: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  profile: { displayName: "Mia", bio: null, city: "Tokyo", gender: null, age: null, heightCm: null, languages: [] },
  account: { roles: [] },
  bookingSpend: { totalBookings: 3, completedBookings: 2, completedSpendJpy: 18000 },
  metrics: { ndpAvailable: 900, usageCount: 3, credit: { ratingAverage: 4.8, reviewCount: 12, latestReviewAt: null } },
  capabilities: { membershipWrite: false, reviewAmend: false, refundAmend: false, partnerWrite: false, timelineCommentWrite: false },
  audit: { total: 0, list: [] }
};

async function waitForText(container: HTMLElement, text: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
  }
  throw new Error(`missing text: ${text}`);
}

describe("UnifiedUserDetailDrawer", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    state.getUser.mockReset().mockResolvedValue(detail);
    state.listReceivedReviews.mockReset().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 10 });
    state.amendReview.mockReset();
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

  it.each(["operations", "merchant"] as const)("renders the same canonical detail structure for %s", async (scope) => {
    act(() => root.render(<UnifiedUserDetailDrawer onClose={vi.fn()} scope={scope} userId={41} />));
    await waitForText(container, "Mia");
    expect(state.getUser).toHaveBeenCalledWith(scope, 41);
    for (const tab of ["基础资料", "会员等级", "预约与消费", "评价", "权限与账号", "用户动态"]) {
      expect([...container.querySelectorAll('[role="tab"]')].some((node) => node.textContent === tab)).toBe(true);
    }
    expect(container.textContent).toContain("900");
    expect(container.textContent).toContain("4.8");
    expect(container.textContent).toContain("已开启");
  });

  it("shows both reasoned membership actions only when the operations capability is granted", async () => {
    state.getUser.mockResolvedValue({
      ...detail,
      capabilities: { ...detail.capabilities, membershipWrite: true },
    });
    act(() => root.render(<UnifiedUserDetailDrawer onClose={vi.fn()} scope="operations" userId={41} />));
    await waitForText(container, "修改会员类型");
    expect(container.textContent).toContain("修改会员倍率");
  });
});
