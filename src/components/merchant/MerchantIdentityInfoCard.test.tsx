// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profile = {
  id: 61,
  publicId: "b0000000109",
  userId: 9,
  identityId: 109,
  displayName: "佐藤 美咲",
  avatarUrl: null,
  gender: "private" as const,
  age: 29,
  heightCm: 163,
  languages: ["日本語"],
  bio: "商户负责人",
  visibility: "public" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const mocks = vi.hoisted(() => ({
  createCroppedAvatarDataUrl: vi.fn(),
  copyTextToClipboard: vi.fn(),
  getMine: vi.fn(),
  getMyWalletSummary: vi.fn(),
  readImageFileAsDataUrl: vi.fn(),
  updateMine: vi.fn()
}));

vi.mock("../../lib/share", () => ({ copyTextToClipboard: mocks.copyTextToClipboard }));
vi.mock("../../lib/imageUpload", () => ({ readImageFileAsDataUrl: mocks.readImageFileAsDataUrl }));
vi.mock("../ui/AvatarCropEditor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui/AvatarCropEditor")>()),
  createCroppedAvatarDataUrl: mocks.createCroppedAvatarDataUrl
}));

vi.mock("../../features/core-read/merchantProfileApi", () => ({
  merchantProfileApi: {
    getMine: mocks.getMine,
    updateMine: mocks.updateMine
  }
}));

vi.mock("../../features/wallet/api", () => ({
  walletApi: { getMyWalletSummary: mocks.getMyWalletSummary }
}));

import { MerchantIdentityInfoCard } from "./MerchantIdentityInfoCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MerchantIdentityInfoCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.copyTextToClipboard.mockReset().mockResolvedValue(true);
    mocks.readImageFileAsDataUrl.mockReset().mockResolvedValue("data:image/png;base64," + "A".repeat(900_000));
    mocks.createCroppedAvatarDataUrl.mockReset().mockResolvedValue("data:image/jpeg;base64,AAAA");
    mocks.getMine.mockReset().mockResolvedValue(profile);
    mocks.getMyWalletSummary.mockReset().mockResolvedValue({
      activeCurrency: "TEST_NDP",
      hasTestNdpWallet: true,
      ndp: { available: 12_500, frozen: 0 },
      testNdp: { available: 800, frozen: 0 }
    });
    mocks.updateMine.mockReset().mockResolvedValue(profile);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function waitFor(assertion: () => void) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { assertion(); return; } catch (error) { lastError = error; await act(async () => Promise.resolve()); }
    }
    throw lastError;
  }

  it("loads the independent merchant identity card and persists cleared languages", async () => {
    await act(async () => root.render(<MerchantIdentityInfoCard />));
    await waitFor(() => expect(container.textContent).toContain("佐藤 美咲"));
    expect(container.textContent).toContain("ID b0000000109");
    expect(container.textContent).toContain("商户负责人");

    const edit = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("编辑资料"));
    expect(edit).not.toBeNull();
    await act(async () => edit?.click());
    const language = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "日本語");
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("保存并退出编辑模式"));
    expect(language).not.toBeUndefined();
    expect(save).not.toBeUndefined();
    await act(async () => language?.click());
    await act(async () => save?.click());

    await waitFor(() => expect(mocks.updateMine).toHaveBeenCalledWith(expect.objectContaining({ languages: [] })));
  });

  it("crops a selected avatar before saving the merchant profile", async () => {
    await act(async () => root.render(<MerchantIdentityInfoCard />));
    await waitFor(() => expect(container.textContent).toContain("佐藤 美咲"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="编辑资料"]')?.click());

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["camera image"], "avatar.png", { type: "image/png" });
    expect(input).not.toBeNull();
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));

    expect(mocks.readImageFileAsDataUrl).toHaveBeenCalledWith(file, expect.any(Object));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("头像裁剪");
    expect(mocks.updateMine).not.toHaveBeenCalled();

    const apply = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "套用头像");
    await act(async () => apply?.click());
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("保存并退出编辑模式"));
    await act(async () => save?.click());

    expect(mocks.createCroppedAvatarDataUrl).toHaveBeenCalledTimes(1);
    expect(mocks.updateMine).toHaveBeenCalledWith(expect.objectContaining({ avatarDataUrl: "data:image/jpeg;base64,AAAA" }));
  });

  it("copies the formal merchant ID through the PWA-safe clipboard helper", async () => {
    await act(async () => root.render(<MerchantIdentityInfoCard />));
    await waitFor(() => expect(container.textContent).toContain("ID b0000000109"));

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="复制 NeeDo ID"]')?.click());

    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith("b0000000109");
    await waitFor(() => expect(container.textContent).toContain("已复制"));
  });

  it("uses the shared metric rhythm with formal NDP and inapplicable manager statistics", async () => {
    await act(async () => root.render(<MerchantIdentityInfoCard />));
    await waitFor(() => expect(container.textContent).toContain("12,500"));

    const card = container.querySelector('[data-testid="merchant-identity-info-card"]');
    const metrics = card?.querySelector('[data-testid="merchant-profile-metrics"]');
    expect(mocks.getMyWalletSummary).toHaveBeenCalledTimes(1);
    expect(metrics?.textContent).toContain("NDP12,500Test NDP 800");
    expect(metrics?.textContent).toContain("利用回数-");
    expect(metrics?.textContent).toContain("评价-");
    expect(metrics?.className).toContain("grid-cols-3");
    expect(card?.textContent?.indexOf("评价-")).toBeLessThan(card?.textContent?.indexOf("基础信息") ?? -1);
  });
});
