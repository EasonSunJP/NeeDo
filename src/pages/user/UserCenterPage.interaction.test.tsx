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
  updateTechnicianEntity: vi.fn(() => true)
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    session: {
      currentIdentity: { scopeId: 41, type: "customer" },
      linkedCustomerId: "customer-1",
      loginMethod: "password"
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
  useEntityStore: () => ({ customers: [], technicians: [] })
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

async function inputValue(element: HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

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

async function renderFormalUserCenter() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <UserCenterPage />
      </MemoryRouter>
    );
  });

  await waitFor(() => expect(container.textContent).toContain("服务端原名"));
}

describe("UserCenterPage inline profile editing", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
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
    await renderFormalUserCenter();

    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).toContain("对好友以及关联人可见");

    await click(findIconButton("编辑资料"));
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).not.toBeNull();
    expect(container.textContent).toContain("取消编辑");

    await click(findButton("对好友以及关联人可见"));
    await click(findButton("对好友可见"));
    expect(container.textContent).toContain("对好友可见");

    await click(findIconButton("取消编辑"));
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).toBeNull();
    expect(container.textContent).toContain("对好友以及关联人可见");
  });

  it("uses the server-returned profile after one disabled formal save", async () => {
    let resolveUpdate: (value: typeof savedProfile) => void = () => undefined;
    testState.updateMine.mockImplementation(
      () =>
        new Promise<typeof savedProfile>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    await renderFormalUserCenter();

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
    await renderFormalUserCenter();

    await click(findIconButton("编辑资料"));
    const nickname = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]');
    await inputValue(nickname!, "保留的草稿");
    await click(findButton("保存并退出编辑模式"));

    await waitFor(() => expect(container.textContent).toContain("资料保存失败，请保留当前内容后重试"));
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="昵称"]')?.value).toBe("保留的草稿");
    expect(container.querySelector('[data-testid="user-profile-save-action"]')).not.toBeNull();
  });
});
