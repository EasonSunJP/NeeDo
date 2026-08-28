// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type { AffiliateProfile } from "../../api/affiliateProfile";
import { AffiliateProfilePage } from "./AffiliateProfilePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const apiMocks = vi.hoisted(() => ({
  createChannel: vi.fn(),
  deleteChannel: vi.fn(),
  getMine: vi.fn(),
  updateChannel: vi.fn(),
  updateMine: vi.fn()
}));

vi.mock("../../api/affiliateProfile", () => ({
  affiliateProfileApi: apiMocks
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

const profile: AffiliateProfile = {
  profileId: 57,
  needoId: "u0000000007",
  displayName: "山田 花",
  avatarUrl: null,
  affiliateStatus: "active",
  cooperationStatus: "available",
  version: 3,
  bio: "东京美容与生活方式",
  strengths: ["美容"],
  serviceAreas: ["東京都"],
  channels: [
    {
      channelId: 71,
      platform: "instagram",
      customLabel: null,
      homepageUrl: "https://instagram.com/needo",
      sortOrder: 0,
      createdAt: "2026-08-28T09:00:00.000Z",
      updatedAt: "2026-08-28T09:00:00.000Z"
    }
  ],
  updatedAt: "2026-08-28T09:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
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
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
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
      <MemoryRouter initialEntries={["/afirieito/me"]}>
        <AffiliateProfilePage />
      </MemoryRouter>
    );
  });
}

describe("AffiliateProfilePage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    apiMocks.getMine.mockResolvedValue(profile);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    storageSetItem = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    storageSetItem.mockRestore();
    vi.unstubAllGlobals();
  });

  it("loads the server profile and persists profile and channel mutations through the API", async () => {
    apiMocks.updateMine.mockResolvedValue({
      ...profile,
      version: 4,
      bio: "东京的美容服务与生活方式",
      strengths: ["美容", "短视频"],
      serviceAreas: ["東京都", "神奈川県"],
      cooperationStatus: "selective"
    });
    apiMocks.createChannel.mockResolvedValue({
      ...profile,
      version: 5,
      channels: [
        ...profile.channels,
        {
          channelId: 72,
          platform: "custom",
          customLabel: "Blog",
          homepageUrl: "https://creator.example/profile",
          sortOrder: 1,
          createdAt: profile.updatedAt,
          updatedAt: profile.updatedAt
        }
      ]
    });
    apiMocks.deleteChannel.mockResolvedValue({ ...profile, version: 6, channels: [] });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("u0000000007"));

    expect(container.querySelector('main[data-no-i18n="true"]')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="查看联盟营销资料说明"]'),
    ).not.toBeNull();

    const needoId = container.querySelector<HTMLInputElement>('input[name="needoId"]');
    expect(needoId?.readOnly).toBe(true);

    await setControlValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="bio"]')!,
      "东京的美容服务与生活方式"
    );
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="strengthInput"]')!,
      "短视频"
    );
    await click(findButton("添加优势"));
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="serviceAreaInput"]')!,
      "神奈川県"
    );
    await click(findButton("添加地区"));
    await setControlValue(
      container.querySelector<HTMLSelectElement>('select[name="cooperationStatus"]')!,
      "selective"
    );
    await click(findButton("保存资料"));

    await waitFor(() =>
      expect(apiMocks.updateMine).toHaveBeenCalledWith({
        expectedVersion: 3,
        bio: "东京的美容服务与生活方式",
        strengths: ["美容", "短视频"],
        serviceAreas: ["東京都", "神奈川県"],
        cooperationStatus: "selective"
      })
    );
    await waitFor(() => expect(container.textContent).toContain("资料已保存"));

    await click(findButton("添加外部主页"));
    await setControlValue(
      container.querySelector<HTMLSelectElement>('select[name="channelPlatform"]')!,
      "custom"
    );
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="channelCustomLabel"]')!,
      "Blog"
    );
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="channelHomepageUrl"]')!,
      "https://creator.example/profile"
    );
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="channelSortOrder"]')!,
      "1"
    );
    await click(findButton("保存主页"));

    await waitFor(() =>
      expect(apiMocks.createChannel).toHaveBeenCalledWith({
        expectedProfileVersion: 4,
        platform: "custom",
        customLabel: "Blog",
        homepageUrl: "https://creator.example/profile",
        sortOrder: 1
      })
    );

    await click(findButton("删除"));
    await waitFor(() => expect(apiMocks.deleteChannel).toHaveBeenCalledWith(71, 5));
    expect(storageSetItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading, empty, permission, and version-conflict recovery states", async () => {
    let resolveInitial!: (value: AffiliateProfile) => void;
    apiMocks.getMine.mockReturnValueOnce(
      new Promise<AffiliateProfile>((resolve) => {
        resolveInitial = resolve;
      })
    );

    await renderPage();
    expect(container.textContent).toContain("正在读取联盟营销资料");

    await act(async () => resolveInitial({ ...profile, channels: [] }));
    await waitFor(() => expect(container.textContent).toContain("还没有添加外部主页"));

    apiMocks.updateMine.mockRejectedValueOnce(
      new ApiClientError("error.affiliate_profile.version_conflict", 40928, 409)
    );
    await click(findButton("保存资料"));
    await waitFor(() => expect(container.textContent).toContain("资料已在其他页面更新"));

    apiMocks.getMine.mockResolvedValueOnce({ ...profile, version: 8, channels: [] });
    await click(findButton("重新加载"));
    await waitFor(() => expect(apiMocks.getMine).toHaveBeenCalledTimes(2));

    await act(async () => root.unmount());
    root = createRoot(container);
    apiMocks.getMine.mockRejectedValueOnce(new ApiClientError("error.forbidden", 403, 403));
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("没有权限查看联盟营销资料"));
  });
});
