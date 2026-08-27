// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSelfProfile } from "../../features/core-read/customerProfileApi";
import { UserCenterPage } from "./UserCenterPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  getMine: vi.fn(),
  getMyWallet: vi.fn(),
  listOrders: vi.fn(),
  updateMine: vi.fn(),
  updateCustomerEntity: vi.fn(() => true),
  updateTechnicianEntity: vi.fn(() => true),
  loginMethod: "password",
  currentIdentityScopeId: 41 as number | null,
  currentIdentityType: "customer",
  previewCustomer: null as Record<string, unknown> | null
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
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
  walletApi: { getMyWallet: testState.getMyWallet }
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
  updatedAt: "2026-08-26T00:00:00.000Z",
  userId: 12,
  visibility: "network" as const
};

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

async function renderUserCenter(expectedName = "服务端原名") {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <UserCenterPage />
      </MemoryRouter>
    );
  });

  await waitFor(() => expect(container.textContent).toContain(expectedName));
}

describe("UserCenterPage inline profile editing", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    testState.loginMethod = "password";
    testState.currentIdentityScopeId = 41;
    testState.currentIdentityType = "customer";
    testState.previewCustomer = null;
    testState.getMine.mockResolvedValue(savedProfile);
    testState.getMyWallet.mockResolvedValue({
      availableBalance: 5_000,
      createdAt: "2026-08-26T00:00:00.000Z",
      currency: "NDP",
      frozenBalance: 0,
      id: 7,
      ownerId: 12,
      ownerType: "user",
      updatedAt: "2026-08-26T00:00:00.000Z"
    });
    testState.listOrders.mockResolvedValue({ list: [], page: 1, page_size: 1, total: 0 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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

  it("keeps a single-line nickname editor compact so the privacy control stays on the view-state grid", async () => {
    await renderUserCenter();

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');

    expect(nickname).not.toBeNull();
    expect(nickname?.rows).toBe(1);
    expect(nickname?.className).toContain("[field-sizing:content]");
  });

  it("does not reserve an empty membership badge slot before the level label", async () => {
    await renderUserCenter();

    const levelLabel = Array.from(container.querySelectorAll("span")).find((element) => element.textContent === "Lv.1");

    expect(levelLabel).toBeDefined();
    expect(levelLabel?.parentElement?.children).toHaveLength(1);
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
