// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AffiliateAlliance } from "../../api/affiliateAlliance";
import { ApiClientError } from "../../api/httpClient";
import { AffiliateAlliancePage } from "./AffiliateAlliancePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const apiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  getMine: vi.fn()
}));

vi.mock("../../api/affiliateAlliance", () => ({
  affiliateAllianceApi: apiMocks
}));

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({ conversations: 0, friendRequests: 0, notifications: 0 })
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "light-green" })
}));

const alliance: AffiliateAlliance = {
  allianceId: 42,
  name: "东京美容联盟",
  description: "面向东京地区",
  status: "active",
  version: 1,
  defaultPromoterShareBps: 7550,
  owner: {
    needoId: "u0000000007",
    displayName: "山田 花",
    avatarUrl: null
  },
  membership: {
    memberId: 91,
    role: "owner",
    managerNeedoId: null,
    promoterShareBpsOverride: null,
    permissions: {
      canClaimTasks: true,
      canViewAllianceOverview: true,
      canViewMemberDetails: true,
      canManageOwnSubordinates: true,
      canViewAllianceWallet: true
    }
  },
  wallet: { currency: "NDP", availableBalance: 0, frozenBalance: 0 },
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;
let storageSetItem: ReturnType<typeof vi.spyOn>;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

function findButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(label)
  );
  if (!button) throw new Error(`Could not find button: ${label}`);
  return button;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function setControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function renderPage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/afirieito/organization"]}>
        <AffiliateAlliancePage />
      </MemoryRouter>
    );
  });
}

describe("AffiliateAlliancePage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    apiMocks.getMine.mockResolvedValue({ alliance: null });
    storageSetItem = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    storageSetItem.mockRestore();
  });

  it("loads the empty state and creates only through the API with percent-to-BPS conversion", async () => {
    let resolveInitial!: (value: { alliance: null }) => void;
    apiMocks.getMine.mockReturnValueOnce(
      new Promise<{ alliance: null }>((resolve) => {
        resolveInitial = resolve;
      })
    );
    apiMocks.create.mockResolvedValue({ alliance });

    await renderPage();
    expect(container.textContent).toContain("正在读取联盟");
    await act(async () => resolveInitial({ alliance: null }));
    await waitFor(() => expect(container.textContent).toContain("建立你的第一个联盟"));

    expect(container.querySelector('button[aria-label="查看联盟说明"]')).not.toBeNull();
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="allianceName"]')!,
      "东京美容联盟"
    );
    await setControlValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="allianceDescription"]')!,
      "面向东京地区"
    );
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="promoterSharePercent"]')!,
      "75.5"
    );
    expect(container.textContent).toContain("联盟 24.5%");
    await click(findButton("创建联盟"));

    await waitFor(() =>
      expect(apiMocks.create).toHaveBeenCalledWith({
        name: "东京美容联盟",
        description: "面向东京地区",
        defaultPromoterShareBps: 7550
      })
    );
    await waitFor(() => expect(container.textContent).toContain("u0000000007"));
    expect(storageSetItem).not.toHaveBeenCalled();
  });

  it("shows the server owner, all five permissions, ratio, and separate zero wallet", async () => {
    apiMocks.getMine.mockResolvedValue({ alliance });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("东京美容联盟"));

    expect(container.textContent).toContain("推广者 75.5%");
    expect(container.textContent).toContain("联盟 24.5%");
    expect(container.textContent).toContain("u0000000007");
    expect(container.textContent).toContain("领取任务");
    expect(container.textContent).toContain("查看联盟概览");
    expect(container.textContent).toContain("查看成员详情");
    expect(container.textContent).toContain("管理自己的下级");
    expect(container.textContent).toContain("查看联盟钱包");
    expect(container.textContent).toContain("可用余额");
    expect(container.textContent).toContain("冻结余额");
    expect(container.textContent).toContain("0 NDP");
    expect(container.textContent).not.toContain("邀请成员");
    expect(container.textContent).not.toContain("转账");
    expect(container.textContent).not.toContain("GMV");
  });

  it("recovers a 409 by reloading and shows permission failures without local fallback", async () => {
    apiMocks.create.mockRejectedValueOnce(
      new ApiClientError("error.affiliate_alliance.already_joined", 40932, 409)
    );
    apiMocks.getMine
      .mockResolvedValueOnce({ alliance: null })
      .mockResolvedValueOnce({ alliance });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("建立你的第一个联盟"));
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="allianceName"]')!,
      "东京美容联盟"
    );
    await click(findButton("创建联盟"));
    await waitFor(() => expect(apiMocks.getMine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toContain("u0000000007"));

    await act(async () => root.unmount());
    root = createRoot(container);
    apiMocks.getMine.mockRejectedValueOnce(new ApiClientError("error.forbidden", 40301, 403));
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("没有权限查看联盟"));
    expect(storageSetItem).not.toHaveBeenCalled();
  });
});
