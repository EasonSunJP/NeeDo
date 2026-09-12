// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSelfProfile } from "../../features/core-read/customerProfileApi";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { UserCenterPage } from "./UserCenterPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  getMine: vi.fn(),
  getMyWalletSummary: vi.fn(),
  getMyExperience: vi.fn(),
  getPlatformMembership: vi.fn(),
  listShopMemberships: vi.fn(),
  listOrders: vi.fn(),
  updateMine: vi.fn(),
  refreshSession: vi.fn(),
  updateCustomerEntity: vi.fn(() => true),
  updateTechnicianEntity: vi.fn(() => true),
  loginMethod: "password",
  currentIdentityScopeId: 41 as number | null,
  currentIdentityType: "customer",
  previewCustomer: null as Record<string, unknown> | null,
  writeClipboardText: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    refreshSession: testState.refreshSession,
    session: {
      currentIdentity: { scopeId: testState.currentIdentityScopeId, type: testState.currentIdentityType },
      linkedCustomerId: "customer-1",
      loginMethod: testState.loginMethod
    }
  })
}));

vi.mock("../../features/booking/api", () => ({
  bookingApi: { listOrders: testState.listOrders }
}));

vi.mock("../../features/core-read/customerProfileApi", () => ({
  customerProfileApi: {
    getMine: testState.getMine,
    updateMine: testState.updateMine
  }
}));

vi.mock("../../features/wallet/api", () => ({
  walletApi: { getMyWalletSummary: testState.getMyWalletSummary }
}));

vi.mock("../../features/platform-membership/api", () => ({
  platformMembershipSelfApi: {
    getMyExperience: testState.getMyExperience,
    getMine: testState.getPlatformMembership
  }
}));

vi.mock("../../features/shop-member/api", () => ({
  customerShopMembershipApi: {
    list: testState.listShopMemberships
  }
}));

vi.mock("../../lib/persistentCacheScope", () => ({
  getAuthenticatedPersistentCacheScope: () => "account:12"
}));

vi.mock("../../state/entityStore", () => ({
  updateCustomerEntity: testState.updateCustomerEntity,
  updateTechnicianEntity: testState.updateTechnicianEntity,
  useEntityStore: () => ({
    customers: testState.previewCustomer ? [testState.previewCustomer] : [],
    technicians: []
  })
}));

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({ conversations: 0, friendRequests: 0, notifications: 0 })
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "light" })
}));

const savedProfile: CustomerSelfProfile = {
  age: 36,
  avatarUrl: null,
  bio: "来自服务端的资料",
  city: "Tokyo",
  createdAt: "2026-08-26T00:00:00.000Z",
  displayName: "服务端原名",
  gender: "private" as const,
  heightCm: 171,
  id: 41,
  publicId: "u3141592653",
  isPublic: false,
  languages: ["日本語"],
  membershipLevel: "standard",
  level: 1,
  updatedAt: "2026-08-26T00:00:00.000Z",
  userId: 12,
  visibility: "network" as const
};
const formalOrderStatusCount = 5;

let container: HTMLDivElement;
let root: Root;

function findButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label));

  if (!button) {
    throw new Error(`Could not find button: ${label}`);
  }

  return button;
}

function findIconButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label));

  if (!button) {
    throw new Error(`Could not find icon button: ${label}`);
  }

  return button;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function inputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  await act(async () => {
    setValue?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

function LocationProbe() {
  const location = useLocation();

  return <output data-testid="location-probe">{location.pathname}</output>;
}

async function renderUserCenter(expectedName = "服务端原名") {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <UserCenterPage />
        <LocationProbe />
      </MemoryRouter>
    );
  });

  await waitFor(() => expect(container.textContent).toContain(expectedName));
}

describe("UserCenterPage inline profile editing", () => {
  beforeEach(async () => {
    await persistentResourceCache.clearScope("account:12");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    testState.writeClipboardText.mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: testState.writeClipboardText }
    });
    testState.loginMethod = "password";
    testState.currentIdentityScopeId = 41;
    testState.currentIdentityType = "customer";
    testState.previewCustomer = null;
    testState.getMine.mockResolvedValue(savedProfile);
    testState.refreshSession.mockResolvedValue({ ok: true });
    testState.getMyWalletSummary.mockResolvedValue({
      activeCurrency: "NDP",
      hasTestNdpWallet: false,
      ndp: { available: 5_000, frozen: 0 },
      testNdp: { available: 0, frozen: 0 }
    });
    testState.listOrders.mockResolvedValue({ list: [], page: 1, page_size: 1, total: 0 });
    testState.listShopMemberships.mockResolvedValue({ list: [], page: 1, page_size: 1, total: 0 });
    testState.getMyExperience.mockResolvedValue({
      level: 1,
      totalExp: "0",
      currentLevelExp: "0",
      nextLevelExp: "100",
      progressBps: 0
    });
    testState.getPlatformMembership.mockResolvedValue({
      tierCode: "free",
      tierVersionPublicId: "tier-free-v1",
      multiplier: 1,
      expiresAt: null,
      ekycVerified: false,
      benefits: [],
      theme: {
        detailAccentColor: "#A8FF2F",
        detailSurfaceColor: "#10212A",
        detailSurfaceMiddleColor: "#183A32",
        detailSurfaceBottomColor: "#24314B",
        detailItemSurfaceColor: "#0A151C",
        detailOuterBorderColor: "#5B7D3A",
        detailItemBorderColor: "#263E48",
        detailAvatarBorderColor: "#6C9048",
        simpleTopColor: "#0B2418",
        simpleBottomColor: "#102631"
      }
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("restores the cached personal center immediately on route remount without repeating reads", async () => {
    await renderUserCenter();

    expect(testState.getMine).toHaveBeenCalledTimes(1);
    expect(testState.getMyWalletSummary).toHaveBeenCalledTimes(1);
    expect(testState.listOrders).toHaveBeenCalledTimes(formalOrderStatusCount);
    expect(testState.listShopMemberships).toHaveBeenCalledTimes(1);
    expect(testState.getMyExperience).toHaveBeenCalledTimes(1);
    expect(testState.getPlatformMembership).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <UserCenterPage />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("服务端原名");
    expect(container.textContent).not.toContain("正在加载我的正式数据");
    expect(testState.getMine).toHaveBeenCalledTimes(1);
    expect(testState.getMyWalletSummary).toHaveBeenCalledTimes(1);
    expect(testState.listOrders).toHaveBeenCalledTimes(formalOrderStatusCount);
    expect(testState.listShopMemberships).toHaveBeenCalledTimes(1);
    expect(testState.getMyExperience).toHaveBeenCalledTimes(1);
    expect(testState.getPlatformMembership).toHaveBeenCalledTimes(1);
  });

  it("keeps formal NDP primary and shows Test NDP as secondary wallet data", async () => {
    testState.getMyWalletSummary.mockResolvedValue({
      activeCurrency: "TEST_NDP",
      hasTestNdpWallet: true,
      ndp: { available: 5_000, frozen: 0 },
      testNdp: { available: 100_000, frozen: 0 }
    });

    await renderUserCenter();

    expect(container.textContent).toContain("NDP5,000Test NDP 100,000");
  });

  it("keeps every account-and-service row on the same left-aligned text column", async () => {
    await renderUserCenter();

    const section = container.querySelector('[data-testid="user-center-account-settings"]');
    const rows = Array.from(section?.querySelector(".mt-3.grid.gap-2")?.children ?? []);

    expect(section).not.toBeNull();
    expect(rows).toHaveLength(6);
    rows.forEach((row) => {
      const textColumn = row.querySelector<HTMLElement>(":scope > .col-start-1");
      const accessory = row.querySelector<HTMLElement>(":scope > .col-start-2");

      expect(row.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
      expect(textColumn?.className).toContain("min-w-0");
      expect(textColumn?.className).toContain("text-left");
      expect(accessory).not.toBeNull();
    });
  });

  it("keeps invoice records visible but disabled while other account links remain active", async () => {
    await renderUserCenter();

    const section = container.querySelector('[data-testid="user-center-account-settings"]');
    const invoiceEntry = section?.querySelector<HTMLElement>('[data-testid="user-center-invoice-entry"]');
    const activeLinks = Array.from(section?.querySelectorAll<HTMLAnchorElement>("a") ?? []);

    expect(invoiceEntry?.tagName).toBe("DIV");
    expect(invoiceEntry?.getAttribute("aria-disabled")).toBe("true");
    expect(invoiceEntry?.querySelector("a")).toBeNull();
    expect(invoiceEntry?.getAttribute("href")).toBeNull();
    expect(invoiceEntry?.tabIndex).toBe(-1);
    expect(invoiceEntry?.textContent).toContain("发票记录");
    expect(invoiceEntry?.textContent).toContain("发票功能暂未开放");
    expect(invoiceEntry?.querySelector('[aria-label="Test 功能"]')).not.toBeNull();
    expect(activeLinks.map((link) => [link.querySelector("strong")?.textContent, link.getAttribute("href")])).toEqual([
      ["账号设置", "/me/settings/account"],
      ["支付方式", "/me/settings/payment-methods"],
      ["通知设置", "/me/settings/notifications"],
      ["隐私与安全", "/me/settings/account"],
      ["联系客服", "/support"]
    ]);

    await click(invoiceEntry!);
    await act(async () => {
      invoiceEntry?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      invoiceEntry?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
    });
    expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/");
  });

  it("keeps the saved privacy value in view and restores it after cancelling an edited draft", async () => {
    await renderUserCenter();

    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).toContain("对好友以及关联人可见");

    const editButton = findIconButton("编辑资料");
    expect(editButton.className).toContain("text-ink");
    await click(editButton);
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).not.toBeNull();
    expect(container.textContent).toContain("取消编辑");
    expect(findIconButton("取消编辑").className).toContain("bg-red-500");
    expect(findIconButton("取消编辑").className).toContain("text-white");

    await click(findButton("对好友以及关联人可见"));
    await click(findButton("对好友可见"));
    expect(container.textContent).toContain("对好友可见");

    await click(findIconButton("取消编辑"));
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).toBeNull();
    expect(container.textContent).toContain("对好友以及关联人可见");
  });

  it("enables and persists privacy directly from the view-state switch", async () => {
    testState.getMine.mockResolvedValue({ ...savedProfile, isPublic: true, visibility: "public" });
    testState.updateMine.mockResolvedValue({ ...savedProfile, isPublic: false, visibility: "privateAll" });
    await renderUserCenter();

    const privacySwitch = container.querySelector<HTMLButtonElement>('button[aria-label="开启隐私模式"][role="switch"]');

    expect(privacySwitch).not.toBeNull();
    expect(privacySwitch?.disabled).toBe(false);
    await click(privacySwitch!);
    expect(container.querySelector('[data-testid="privacy-mode-confirm-dialog"]')).not.toBeNull();

    await click(findButton("确定"));

    await waitFor(() => expect(testState.updateMine).toHaveBeenCalledWith({ visibility: "privateAll" }));
    await waitFor(() => expect(container.textContent).toContain("对所有人不可见"));
    expect(container.querySelector('[data-testid="user-profile-privacy-options"]')).not.toBeNull();
  });

  it("disables and persists privacy directly from the view-state switch", async () => {
    testState.updateMine.mockResolvedValue({ ...savedProfile, isPublic: true, visibility: "public" });
    await renderUserCenter();

    const privacySwitch = container.querySelector<HTMLButtonElement>('button[aria-label="开启隐私模式"][role="switch"]');

    expect(privacySwitch?.disabled).toBe(false);
    await click(privacySwitch!);

    await waitFor(() => expect(testState.updateMine).toHaveBeenCalledWith({ visibility: "public" }));
    await waitFor(() => expect(container.textContent).toContain("公开可见"));
  });

  it("persists a visibility choice from the view-state privacy menu", async () => {
    testState.updateMine.mockResolvedValue({ ...savedProfile, isPublic: false, visibility: "limited" });
    await renderUserCenter();

    await click(findButton("对好友以及关联人可见"));
    await click(findButton("对好友可见"));

    await waitFor(() => expect(testState.updateMine).toHaveBeenCalledWith({ visibility: "limited" }));
    await waitFor(() => expect(container.textContent).toContain("对好友可见"));
  });

  it("keeps the saved privacy state when a direct privacy update fails", async () => {
    testState.getMine.mockResolvedValue({ ...savedProfile, isPublic: true, visibility: "public" });
    testState.updateMine.mockRejectedValue(new Error("network"));
    await renderUserCenter();

    const privacySwitch = container.querySelector<HTMLButtonElement>('button[aria-label="开启隐私模式"][role="switch"]');
    await click(privacySwitch!);
    await click(findButton("确定"));

    await waitFor(() => expect(container.textContent).toContain("隐私模式保存失败，请重试"));
    expect(container.textContent).toContain("公开可见");
    expect(container.querySelector('[data-testid="user-profile-privacy-options"]')).toBeNull();
  });

  it("keeps a single-line nickname editor compact so the privacy control stays on the view-state grid", async () => {
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');

    expect(nickname).not.toBeNull();
    expect(nickname?.rows).toBe(1);
    expect(nickname?.className).toContain("[field-sizing:content]");
  });

  it("renders empty formal languages and biography honestly without inventing profile data", async () => {
    testState.getMine.mockResolvedValueOnce({
      ...savedProfile,
      bio: null,
      languages: []
    });

    await renderUserCenter();

    expect(container.textContent).not.toContain("可在这里补充你的语言偏好");
    expect(container.textContent).not.toContain("日本語");
    expect(container.textContent?.match(/未设置/g)?.length).toBeGreaterThanOrEqual(2);

    await click(findIconButton("编辑资料"));
    expect(container.querySelector<HTMLTextAreaElement>('textarea[data-profile-field="bio"]')?.value).toBe("");
    expect(findButton("日本語").className).not.toContain("client-primary-soft");
  });

  it("renders locale codes and localized language names as one canonical selection", async () => {
    testState.getMine.mockResolvedValueOnce({
      ...savedProfile,
      languages: ["ja", "zh", "en", "日本語", "中文", "English"]
    });

    await renderUserCenter();

    const languageSection = Array.from(container.querySelectorAll("section")).find((section) =>
      section.textContent?.startsWith("语言能力")
    );
    const labels = Array.from(languageSection?.querySelectorAll("span") ?? []).map((element) => element.textContent);

    expect(labels).toEqual(["日本語", "中文", "English"]);

    await click(findIconButton("编辑资料"));

    expect(findButton("日本語").className).toContain("client-primary-soft");
    expect(findButton("中文").className).toContain("client-primary-soft");
    expect(findButton("English").className).toContain("client-primary-soft");
  });

  it("places the edit-state privacy control after the basic-information labels", async () => {
    await renderUserCenter();
    await click(findIconButton("编辑资料"));

    const languageLabel = Array.from(container.querySelectorAll("p")).find((element) => element.textContent === "语言能力");
    const privacyControl = container.querySelector('[data-testid="user-profile-privacy-control"]');

    expect(languageLabel).toBeDefined();
    expect(privacyControl).not.toBeNull();
    expect(languageLabel?.compareDocumentPosition(privacyControl!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("uses the same compact name font in view and edit modes so the ID remains visible", async () => {
    await renderUserCenter();

    const displayName = Array.from(container.querySelectorAll("h1")).find((element) => element.textContent?.includes("服务端原名"));
    expect(displayName).toBeDefined();
    expect(displayName?.className).toContain("text-lg");

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');

    expect(nickname).not.toBeNull();
    expect(nickname?.className).toContain("text-lg");
    expect(container.textContent).toContain("ID u3141592653");
  });

  it("copies only the formal NeeDo ID when the complete ID row is clicked", async () => {
    await renderUserCenter();

    const idRow = container.querySelector<HTMLButtonElement>('button[aria-label="复制 NeeDo ID"]');

    expect(idRow).not.toBeNull();
    expect(idRow?.textContent).toContain("ID u3141592653");
    await click(idRow!);

    await waitFor(() => expect(testState.writeClipboardText).toHaveBeenCalledWith("u3141592653"));
    expect(testState.writeClipboardText).not.toHaveBeenCalledWith("ID u3141592653");
    await waitFor(() => expect(container.textContent).toContain("已复制"));
  });

  it("shows an explicit failure when the NeeDo ID cannot be copied", async () => {
    testState.writeClipboardText.mockRejectedValueOnce(new Error("clipboard denied"));
    await renderUserCenter();

    const idRow = container.querySelector<HTMLButtonElement>('button[aria-label="复制 NeeDo ID"]');

    expect(idRow).not.toBeNull();
    await click(idRow!);

    await waitFor(() => expect(container.textContent).toContain("复制失败，请手动复制"));
  });

  it("does not reserve an empty membership badge slot before the level label", async () => {
    await renderUserCenter();

    const levelLabel = Array.from(container.querySelectorAll("span")).find((element) => element.textContent === "Lv.1");

    expect(levelLabel).toBeDefined();
    expect(levelLabel?.parentElement?.children).toHaveLength(1);
  });

  it("shows the formal experience-account level instead of deriving Lv from the credit score", async () => {
    testState.getMyExperience.mockResolvedValueOnce({
      level: 72,
      totalExp: "15000",
      currentLevelExp: "500",
      nextLevelExp: "750",
      progressBps: 6667
    });

    await renderUserCenter();

    expect(Array.from(container.querySelectorAll("span")).some((element) => element.textContent === "Lv.72")).toBe(true);
    expect(Array.from(container.querySelectorAll("span")).some((element) => element.textContent === "Lv.1")).toBe(false);
  });

  it("uses the server-returned profile after one disabled formal save", async () => {
    let resolveUpdate: (value: typeof savedProfile) => void = () => undefined;
    testState.updateMine.mockImplementation(
      () =>
        new Promise<typeof savedProfile>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');
    expect(nickname).not.toBeNull();
    await inputValue(nickname!, "客户端草稿");

    const saveAction = findButton("保存并退出编辑模式") as HTMLButtonElement;
    await click(saveAction);
    await click(saveAction);
    expect(saveAction.disabled).toBe(true);
    expect(testState.updateMine).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate({ ...savedProfile, displayName: "服务端最终名", visibility: "limited" });
    });

    await waitFor(() => expect(container.textContent).toContain("服务端最终名"));
    expect(container.textContent).not.toContain("客户端草稿");
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).toBeNull();
  });

  it("refreshes the authoritative account session when the saved avatar URL changes", async () => {
    testState.updateMine.mockResolvedValue({
      ...savedProfile,
      avatarUrl: "https://cdn.needo.test/customer-41/avatar-v2.webp"
    });
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    await click(findButton("保存并退出编辑模式"));

    await waitFor(() => expect(testState.refreshSession).toHaveBeenCalledTimes(1));
  });

  it("refreshes the authoritative account session when only the display name changes", async () => {
    testState.updateMine.mockResolvedValue({
      ...savedProfile,
      displayName: "服务端新姓名"
    });
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');
    expect(nickname).not.toBeNull();
    await inputValue(nickname!, "服务端新姓名");
    await click(findButton("保存并退出编辑模式"));

    await waitFor(() => expect(testState.refreshSession).toHaveBeenCalledTimes(1));
  });

  it("handles cancellation from optional cache persistence after a successful profile save", async () => {
    const handleCacheCancellation = vi.fn(() => Promise.resolve());
    const writeSpy = vi.spyOn(persistentResourceCache, "write").mockReturnValueOnce({
      catch: handleCacheCancellation,
    } as unknown as ReturnType<typeof persistentResourceCache.write>);
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    await click(findButton("保存并退出编辑模式"));

    await waitFor(() => expect(container.textContent).toContain("资料已保存，已退出编辑模式"));
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(handleCacheCancellation).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
  });

  it("keeps the formal draft and fixed save action when the API rejects", async () => {
    testState.updateMine.mockRejectedValue(new Error("network"));
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');
    await inputValue(nickname!, "保留的草稿");
    await click(findButton("保存并退出编辑模式"));

    await waitFor(() => expect(container.textContent).toContain("资料保存失败，请保留当前内容后重试"));
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]')?.value).toBe("保留的草稿");
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).not.toBeNull();
  });

  it("rejects non-finite demographic input before a formal PATCH and keeps the draft", async () => {
    await renderUserCenter();
    await click(findIconButton("编辑资料"));

    const age = container.querySelector<HTMLInputElement>('input[data-profile-field="age"]');
    await inputValue(age!, "not-a-number");
    await click(findButton("保存并退出编辑模式"));

    expect(container.textContent).toContain("年龄必须是 0 到 150 之间的整数");
    expect(age?.value).toBe("not-a-number");
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).not.toBeNull();
    expect(testState.updateMine).not.toHaveBeenCalled();
  });

  it("locks every mounted edit control while a formal save is pending", async () => {
    let resolveUpdate: (value: typeof savedProfile) => void = () => undefined;
    testState.updateMine.mockImplementation(
      () =>
        new Promise<typeof savedProfile>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    await renderUserCenter();
    await click(findIconButton("编辑资料"));
    await click(findButton("保存并退出编辑模式"));

    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]')?.readOnly).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[data-profile-field="age"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[data-profile-field="height"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[data-profile-field="bio"]')?.readOnly).toBe(true);
    expect((findButton("女") as HTMLButtonElement).disabled).toBe(true);
    expect((findButton("日本語") as HTMLButtonElement).disabled).toBe(true);
    expect((findButton("对好友以及关联人可见") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveUpdate(savedProfile);
    });
  });

  it("offers and persists the private gender option", async () => {
    await renderUserCenter();
    await click(findIconButton("编辑资料"));
    expect(findButton("不公开")).not.toBeNull();
    await click(findButton("女"));
    await click(findButton("不公开"));
    await click(findButton("保存并退出编辑模式"));

    await waitFor(() => expect(testState.updateMine).toHaveBeenCalled());
    expect(testState.updateMine).toHaveBeenCalledWith(expect.objectContaining({ gender: "private" }));
  });

  it("fails closed instead of rendering a legacy customer for a formal non-customer identity", async () => {
    testState.currentIdentityScopeId = null;
    testState.currentIdentityType = "platform";
    testState.previewCustomer = {
      activeScore: 0,
      age: "36",
      avatar: "/images/avatar-fallback.jpg",
      bio: "预览资料",
      churnRisk: "low",
      gender: "private",
      height: "171cm",
      id: "customer-1",
      languages: ["日本語"],
      lastOrderAt: "2026-08-26",
      ltv: 0,
      memberLevel: "standard",
      name: "Mia",
      orderCount: 0,
      phone: "",
      points: 0,
      systemId: "U0000000111",
      tags: []
    };

    await act(async () => {
      root.render(
        <MemoryRouter>
          <UserCenterPage />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(container.textContent).toContain("当前身份没有读取个人数据的权限"));
    expect(testState.getMine).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Mia");
    expect(container.textContent).not.toContain("18,420");
    expect(testState.updateMine).not.toHaveBeenCalled();
  });

});
