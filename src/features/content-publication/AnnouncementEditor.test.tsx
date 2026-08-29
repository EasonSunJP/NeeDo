// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type {
  AnnouncementRelease,
  ContentLocaleCode,
} from "../../api/contentPublication";
import { AnnouncementEditor } from "./AnnouncementEditor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  copyAnnouncementLocaleToAll: vi.fn(),
  createAnnouncementDraft: vi.fn(),
  disableAnnouncement: vi.fn(),
  getAnnouncementHistory: vi.fn(),
  listAnnouncements: vi.fn(),
  previewAnnouncement: vi.fn(),
  publishAnnouncement: vi.fn(),
  rollbackAnnouncement: vi.fn(),
  scheduleAnnouncement: vi.fn(),
  searchAnnouncementAffiliateTasks: vi.fn(),
  updateAnnouncementLocale: vi.fn(),
  updateAnnouncementMetadata: vi.fn(),
}));

const allowedPermissions = vi.hoisted(() => new Set<string>());

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<
    typeof import("../../api/contentPublication")
  >("../../api/contentPublication");
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../auth/PermissionGate", () => ({
  PermissionGate: ({
    children,
    fallback = null,
    permission,
  }: {
    children: unknown;
    fallback?: unknown;
    permission?: string;
  }) =>
    !permission || allowedPermissions.has(permission) ? children : fallback,
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" }),
}));

const PUBLIC_ID = "9dc6143f-91d3-412a-9562-7aa1bf824ce8";

function translations(title: string) {
  return Object.fromEntries(
    (["zh-CN", "zh-TW", "en", "ja", "ko"] as ContentLocaleCode[]).map(
      (locale) => [
        locale,
        {
          title: `${title}-${locale}`,
          summary: null,
          body: `${title} body ${locale}`,
          sourceLocale: locale,
          isInitialCopy: false,
        },
      ],
    ),
  ) as AnnouncementRelease["translations"];
}

function release(
  overrides: Partial<AnnouncementRelease> = {},
): AnnouncementRelease {
  return {
    publicId: PUBLIC_ID,
    releaseId: 31,
    version: 3,
    status: "draft",
    lockVersion: 4,
    announcementType: "affiliate_notice",
    visibilityScope: "affiliate",
    affiliateTaskId: null,
    publishAt: null,
    visibleFrom: null,
    visibleUntil: null,
    activatedAt: null,
    disabledAt: null,
    archivedAt: null,
    sourceReleaseId: 30,
    translations: translations("联盟公告"),
    createdAt: "2026-08-29T01:00:00.000Z",
    updatedAt: "2026-08-29T02:00:00.000Z",
    ...overrides,
  };
}

const published = release({
  releaseId: 30,
  version: 2,
  status: "published",
  lockVersion: 5,
  sourceReleaseId: null,
  activatedAt: "2026-08-29T01:30:00.000Z",
});
const historical = release({
  releaseId: 20,
  version: 1,
  status: "archived",
  lockVersion: 3,
  sourceReleaseId: null,
});
const draft = release();

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(
        async () => new Promise((resolve) => window.setTimeout(resolve, 0)),
      );
    }
  }
  throw lastError;
}

async function click(element: Element) {
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

async function setValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function button(label: string) {
  const result = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(label),
  );
  if (!result) throw new Error(`Button not found: ${label}`);
  return result;
}

async function renderEditor() {
  await act(async () => {
    root.render(
      <AnnouncementEditor
        editPermission="announcement:edit"
        publishPermission="announcement:publish"
        readPermission="announcement:read"
      />,
    );
  });
}

describe("AnnouncementEditor", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.resetAllMocks();
    allowedPermissions.clear();
    allowedPermissions.add("announcement:read");
    allowedPermissions.add("announcement:edit");
    allowedPermissions.add("announcement:publish");
    apiMocks.listAnnouncements.mockResolvedValue({
      list: [draft],
      total: 1,
      page: 1,
      page_size: 20,
    });
    apiMocks.getAnnouncementHistory.mockResolvedValue({
      list: [draft, published, historical],
      total: 3,
      page: 1,
      page_size: 20,
    });
    apiMocks.updateAnnouncementLocale.mockResolvedValue({
      ...draft,
      lockVersion: 5,
    });
    apiMocks.previewAnnouncement.mockResolvedValue({
      ...draft,
      taskAction: null,
    });
    apiMocks.copyAnnouncementLocaleToAll.mockResolvedValue({
      ...draft,
      lockVersion: 6,
    });
    apiMocks.publishAnnouncement.mockResolvedValue({
      ...draft,
      status: "published",
      lockVersion: 5,
    });
    apiMocks.rollbackAnnouncement.mockResolvedValue({
      ...draft,
      lockVersion: 1,
    });
    apiMocks.scheduleAnnouncement.mockResolvedValue({
      ...draft,
      status: "scheduled",
      lockVersion: 5,
    });
    apiMocks.searchAnnouncementAffiliateTasks.mockResolvedValue({
      list: [
        {
          id: 29,
          taskCode: "AFF-PUBLIC-29",
          label: "东京新客任务",
          status: "active",
        },
      ],
      total: 11,
      page: 1,
      page_size: 10,
    });
    apiMocks.updateAnnouncementMetadata.mockResolvedValue({
      ...draft,
      affiliateTaskId: 29,
      visibleFrom: "2026-09-01T01:00:00.000Z",
      visibleUntil: "2026-09-30T01:00:00.000Z",
      lockVersion: 5,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("edits only a draft and saves dirty locale input before preview and publish", async () => {
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("联盟公告-zh-CN"),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )!,
      "保存后的公告",
    );
    await click(button("预览"));
    await waitFor(() =>
      expect(apiMocks.previewAnnouncement).toHaveBeenCalled(),
    );
    expect(
      apiMocks.updateAnnouncementLocale.mock.invocationCallOrder[0],
    ).toBeLessThan(apiMocks.previewAnnouncement.mock.invocationCallOrder[0]);
    expect(apiMocks.previewAnnouncement).toHaveBeenCalledWith(PUBLIC_ID, 31);

    const publishedV3 = {
      ...draft,
      status: "published" as const,
      lockVersion: 6,
      activatedAt: "2026-08-29T03:00:00.000Z",
    };
    apiMocks.publishAnnouncement.mockResolvedValue(publishedV3);
    apiMocks.listAnnouncements.mockResolvedValueOnce({
      list: [publishedV3],
      total: 1,
      page: 1,
      page_size: 20,
    });
    apiMocks.getAnnouncementHistory.mockResolvedValueOnce({
      list: [publishedV3, published, historical],
      total: 3,
      page: 1,
      page_size: 20,
    });
    await click(button("立即发布"));
    await waitFor(() =>
      expect(apiMocks.publishAnnouncement).toHaveBeenCalled(),
    );
    expect(apiMocks.publishAnnouncement).toHaveBeenCalledWith(
      PUBLIC_ID,
      31,
      expect.objectContaining({ expectedLockVersion: 5 }),
    );
    expect(apiMocks.listAnnouncements).toHaveBeenCalledTimes(2);
  });

  it("persists independent edits from multiple locale tabs with sequential locks", async () => {
    apiMocks.updateAnnouncementLocale
      .mockResolvedValueOnce({ ...draft, lockVersion: 5 })
      .mockResolvedValueOnce({ ...draft, lockVersion: 6 });
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("联盟公告-zh-CN"),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )!,
      "简体编辑",
    );
    await click(Array.from(container.querySelectorAll('[role="tab"]'))[2]);
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )!,
      "English edit",
    );
    await click(button("保存草稿"));

    await waitFor(() =>
      expect(apiMocks.updateAnnouncementLocale).toHaveBeenCalledTimes(2),
    );
    expect(apiMocks.updateAnnouncementLocale).toHaveBeenNthCalledWith(
      1,
      PUBLIC_ID,
      31,
      expect.objectContaining({
        expectedLockVersion: 4,
        locale: "zh-CN",
        title: "简体编辑",
      }),
    );
    expect(apiMocks.updateAnnouncementLocale).toHaveBeenNthCalledWith(
      2,
      PUBLIC_ID,
      31,
      expect.objectContaining({
        expectedLockVersion: 5,
        locale: "en",
        title: "English edit",
      }),
    );
  });

  it("renders a published-only announcement as immutable and clones the selected historical source into a new draft", async () => {
    const clonedDraft = { ...draft, lockVersion: 1 };
    apiMocks.listAnnouncements
      .mockResolvedValueOnce({
        list: [published],
        total: 1,
        page: 1,
        page_size: 20,
      })
      .mockResolvedValueOnce({
        list: [clonedDraft],
        total: 1,
        page: 1,
        page_size: 20,
      });
    apiMocks.getAnnouncementHistory.mockResolvedValue({
      list: [published, historical],
      total: 2,
      page: 1,
      page_size: 20,
    });
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("从历史版本创建草稿"),
    );
    expect(
      container.querySelector('input[name="announcementTitle"]'),
    ).toBeNull();
    await setValue(
      container.querySelector<HTMLSelectElement>(
        'select[name="announcementRollbackReleaseId"]',
      )!,
      "20",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementRollbackReason"]',
      )!,
      "恢复历史公告",
    );
    await click(button("创建新草稿"));

    await waitFor(() =>
      expect(apiMocks.rollbackAnnouncement).toHaveBeenCalledWith(
        PUBLIC_ID,
        20,
        expect.objectContaining({
          expectedCurrentVersion: 2,
          reason: "恢复历史公告",
        }),
      ),
    );
    expect(apiMocks.listAnnouncements).toHaveBeenCalledTimes(2);
  });

  it("saves dirty announcement copy before copy-to-all and scheduling", async () => {
    apiMocks.updateAnnouncementLocale
      .mockResolvedValueOnce({ ...draft, lockVersion: 5 })
      .mockResolvedValueOnce({ ...draft, lockVersion: 7 });
    apiMocks.scheduleAnnouncement.mockResolvedValue({
      ...draft,
      status: "scheduled",
      lockVersion: 8,
    });
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("联盟公告-zh-CN"),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )!,
      "复制前保存",
    );
    await click(button("复制当前语言到其他语言"));
    await waitFor(() =>
      expect(apiMocks.copyAnnouncementLocaleToAll).toHaveBeenCalled(),
    );
    expect(
      apiMocks.updateAnnouncementLocale.mock.invocationCallOrder[0],
    ).toBeLessThan(
      apiMocks.copyAnnouncementLocaleToAll.mock.invocationCallOrder[0],
    );
    expect(apiMocks.copyAnnouncementLocaleToAll).toHaveBeenCalledWith(
      PUBLIC_ID,
      31,
      expect.objectContaining({ expectedLockVersion: 5 }),
    );

    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )!,
      "定时前保存",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="定时发布时间"]',
      )!,
      "2026-09-02T10:00",
    );
    const scheduledV3 = {
      ...draft,
      status: "scheduled" as const,
      lockVersion: 8,
      publishAt: "2026-09-02T01:00:00.000Z",
    };
    apiMocks.listAnnouncements.mockResolvedValueOnce({
      list: [scheduledV3],
      total: 1,
      page: 1,
      page_size: 20,
    });
    apiMocks.getAnnouncementHistory.mockResolvedValueOnce({
      list: [scheduledV3, published, historical],
      total: 3,
      page: 1,
      page_size: 20,
    });
    await click(button("定时发布"));
    await waitFor(() =>
      expect(apiMocks.scheduleAnnouncement).toHaveBeenCalled(),
    );
    expect(
      apiMocks.updateAnnouncementLocale.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(apiMocks.scheduleAnnouncement.mock.invocationCallOrder[0]);
    expect(apiMocks.scheduleAnnouncement).toHaveBeenCalledWith(
      PUBLIC_ID,
      31,
      expect.objectContaining({ expectedLockVersion: 7 }),
    );
    await waitFor(() =>
      expect(container.textContent).toContain("scheduled · v3"),
    );
  });

  it("stops preview on failed dirty save and provides an explicit 409 reload", async () => {
    apiMocks.updateAnnouncementLocale
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(
        new ApiClientError("error.content.lock_conflict", 40901, 409),
      );
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("联盟公告-zh-CN"),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )!,
      "未保存的公告",
    );
    await click(button("预览"));
    await waitFor(() =>
      expect(container.textContent).toContain("保存失败，页面内输入已保留"),
    );
    expect(apiMocks.previewAnnouncement).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTitle"]',
      )?.value,
    ).toBe("未保存的公告");

    await click(button("保存草稿"));
    await waitFor(() =>
      expect(container.textContent).toContain("服务器版本已更新"),
    );
    await click(button("重新读取服务器草稿"));
    expect(apiMocks.listAnnouncements).toHaveBeenCalledTimes(2);
  });

  it("disables a valid active release rather than the editable draft", async () => {
    apiMocks.listAnnouncements.mockResolvedValue({
      list: [published],
      total: 1,
      page: 1,
      page_size: 20,
    });
    apiMocks.getAnnouncementHistory.mockResolvedValue({
      list: [published, historical],
      total: 2,
      page: 1,
      page_size: 20,
    });
    apiMocks.disableAnnouncement.mockResolvedValue({
      ...published,
      status: "disabled",
      lockVersion: 6,
    });
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("联盟公告-zh-CN"),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementDisableReason"]',
      )!,
      "公告结束",
    );
    await click(button("停用当前版本"));
    expect(apiMocks.disableAnnouncement).toHaveBeenCalledWith(
      PUBLIC_ID,
      30,
      expect.objectContaining({ expectedLockVersion: 5, reason: "公告结束" }),
    );
  });

  it("searches paginated AffiliateTasks and persists task and visibility metadata for create and edit", async () => {
    apiMocks.createAnnouncementDraft.mockResolvedValue(draft);
    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("联盟公告-zh-CN"),
    );

    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementTaskQuery"]',
      )!,
      "东京",
    );
    await click(button("搜索联盟任务"));
    await waitFor(() =>
      expect(apiMocks.searchAnnouncementAffiliateTasks).toHaveBeenCalledWith({
        page: 1,
        pageSize: 10,
        q: "东京",
      }),
    );
    await click(button("下一页"));
    expect(apiMocks.searchAnnouncementAffiliateTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10, q: "东京" }),
    );

    await setValue(
      container.querySelector<HTMLSelectElement>(
        'select[name="newAnnouncementAffiliateTaskId"]',
      )!,
      "29",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="newAnnouncementVisibleFrom"]',
      )!,
      "2026-09-01T10:00",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="newAnnouncementVisibleUntil"]',
      )!,
      "2026-09-30T10:00",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="newAnnouncementTitle"]',
      )!,
      "任务公告",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="newAnnouncementBody"]',
      )!,
      "任务公告正文",
    );
    await click(button("创建公告草稿"));
    await waitFor(() =>
      expect(apiMocks.createAnnouncementDraft).toHaveBeenCalled(),
    );
    expect(apiMocks.createAnnouncementDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliateTaskId: 29,
        visibleFrom: "2026-09-01T01:00:00.000Z",
        visibleUntil: "2026-09-30T01:00:00.000Z",
      }),
    );

    await setValue(
      container.querySelector<HTMLSelectElement>(
        'select[name="announcementAffiliateTaskId"]',
      )!,
      "29",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementVisibleFrom"]',
      )!,
      "2026-09-01T10:00",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="announcementVisibleUntil"]',
      )!,
      "2026-09-30T10:00",
    );
    await click(button("保存草稿"));
    await waitFor(() =>
      expect(apiMocks.updateAnnouncementMetadata).toHaveBeenCalled(),
    );
    expect(apiMocks.updateAnnouncementMetadata).toHaveBeenCalledWith(
      PUBLIC_ID,
      31,
      {
        expectedLockVersion: 4,
        affiliateTaskId: 29,
        visibleFrom: "2026-09-01T01:00:00.000Z",
        visibleUntil: "2026-09-30T01:00:00.000Z",
      },
    );
  });
});
