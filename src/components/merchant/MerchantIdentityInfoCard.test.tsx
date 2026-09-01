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
  getMine: vi.fn(),
  updateMine: vi.fn()
}));

vi.mock("../../features/core-read/merchantProfileApi", () => ({
  merchantProfileApi: {
    getMine: mocks.getMine,
    updateMine: mocks.updateMine
  }
}));

import { MerchantIdentityInfoCard } from "./MerchantIdentityInfoCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MerchantIdentityInfoCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.getMine.mockReset().mockResolvedValue(profile);
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
});
