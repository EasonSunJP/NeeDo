// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import {
  OfficialNoticeComposer,
  OfficialNoticeInbox,
  OfficialNoticeManagement,
  canCancelOfficialNotice,
  canRetryOfficialNotice,
  describeOfficialNoticeError,
  isOfficialNoticeReasonValid
} from "./OfficialNoticeWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  listManaged: vi.fn(),
  createManaged: vi.fn(),
  cancelManaged: vi.fn(),
  archiveManaged: vi.fn(),
  retryManaged: vi.fn(),
  listInbox: vi.fn(),
  markRead: vi.fn(),
  listUsers: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission) })
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "ja", setLanguage: vi.fn() })
}));
vi.mock("../../api/officialNotices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/officialNotices")>()),
  officialNoticesApi: {
    listManaged: state.listManaged,
    createManaged: state.createManaged,
    cancelManaged: state.cancelManaged,
    archiveManaged: state.archiveManaged,
    retryManaged: state.retryManaged,
    listInbox: state.listInbox,
    markRead: state.markRead
  }
}));
vi.mock("../platform-user-management/api", () => ({
  platformUserManagementApi: { listUsers: state.listUsers }
}));

const notice = {
  publicId: "notice-1",
  level: "important" as const,
  status: "scheduled" as const,
  sourceLocale: "ja" as const,
  targetSummary: "本店の従業員",
  scheduledAt: "2026-09-06T03:00:00.000Z",
  sentAt: null,
  cancelledAt: null,
  archivedAt: null,
  lockVersion: 2,
  translations: {
    ja: {
      title: "営業時間変更",
      summary: "営業時間のお知らせ",
      blocks: [
        { id: "heading", type: "heading" as const, content: "重要なお知らせ" },
        { id: "body", type: "paragraph" as const, content: "18時まで営業します" }
      ],
      sourceLocale: "ja" as const,
      isInitialCopy: false
    }
  },
  audienceCount: 3,
  delivery: { pending: 3, delivered: 0, failed: 0, read: 0 },
  createdAt: "2026-09-05T03:00:00.000Z",
  updatedAt: "2026-09-05T03:00:00.000Z"
};

async function waitFor(assertion: () => void) {
  let error: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { assertion(); return; } catch (nextError) { error = nextError; }
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
  }
  throw error;
}

function setField(labelText: string, value: string) {
  const label = [...document.querySelectorAll("label")].find((candidate) => candidate.textContent?.includes(labelText));
  const field = label?.querySelector("input,textarea,select") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!field) throw new Error(`missing field: ${labelText}`);
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(text: string) {
  const element = [...document.querySelectorAll<HTMLElement>("button,a")].find((candidate) => candidate.textContent?.includes(text));
  if (!element) throw new Error(`missing action: ${text}`);
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
}

describe("official notice lifecycle presentation", () => {
  it("matches backend lifecycle and validation rules", () => {
    for (const status of ["draft", "pending_review", "approved", "scheduled"] as const) expect(canCancelOfficialNotice(status)).toBe(true);
    for (const status of ["sending", "sent", "cancelled", "archived"] as const) expect(canCancelOfficialNotice(status)).toBe(false);
    expect(canRetryOfficialNotice("sent", 1)).toBe(true);
    expect(canRetryOfficialNotice("sending", 2)).toBe(true);
    expect(canRetryOfficialNotice("sent", 0)).toBe(false);
    expect(canRetryOfficialNotice("scheduled", 1)).toBe(false);
    expect(isOfficialNoticeReasonValid("a")).toBe(false);
    expect(isOfficialNoticeReasonValid(" 操作 ")).toBe(true);
  });

  it("localizes formal authorization errors instead of exposing API keys", () => {
    expect(describeOfficialNoticeError(new ApiClientError("error.identity.forbidden", 40301, 403), "ja")).toBe("現在のIDにはこの通知操作を実行する権限がありません。");
  });
});

describe("official notice formal API interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetAllMocks();
    state.permissions = new Set([
      "merchant-admin:notice:read", "merchant-admin:notice:create",
      "merchant-admin:notice:review", "merchant-admin:notice:send"
    ]);
    state.listManaged.mockResolvedValue({ list: [notice], total: 1, page: 1, page_size: 20 });
    state.cancelManaged.mockResolvedValue({ ...notice, status: "cancelled", lockVersion: 3 });
    state.createManaged.mockResolvedValue(notice);
    state.listInbox.mockResolvedValue({ list: [{ publicId: "notice-1", level: "important", title: "営業時間変更", summary: "営業時間のお知らせ", blocks: notice.translations.ja.blocks, targetSummary: notice.targetSummary, sentAt: "2026-09-05T03:00:00.000Z", readAt: null }], total: 1, page: 1, page_size: 20 });
    state.markRead.mockResolvedValue({ publicId: "notice-1", readAt: "2026-09-05T04:00:00.000Z" });
    state.listUsers.mockResolvedValue({
      list: [{
        id: 9,
        needoId: "u0000000009",
        username: "hanako",
        email: "hanako@example.com",
        phone: "+819012345678",
        isActive: true,
        identities: [{ type: "customer", displayName: "花子", scopeType: null, scopeId: null }]
      }],
      total: 1,
      page: 1,
      page_size: 20
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("loads a scoped page, opens semantic detail, and refreshes after cancel", async () => {
    act(() => root.render(<MemoryRouter><OfficialNoticeManagement composePath="/merchant-admin/notifications/compose" scope="merchant" /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("営業時間変更"));
    expect(state.listManaged).toHaveBeenCalledWith("merchant", { page: 1, pageSize: 20 });
    await click("営業時間変更");
    expect([...document.querySelectorAll("h2")].some((heading) => heading.textContent === "重要なお知らせ")).toBe(true);
    setField("操作理由", "排期调整");
    await click("取消发送");
    await waitFor(() => expect(state.cancelManaged).toHaveBeenCalledTimes(1));
    expect(state.cancelManaged.mock.calls[0]?.[2]).toMatchObject({ expectedLockVersion: 2, reason: "排期调整", idempotencyKey: "notice-ui:notice-1:cancel:2" });
    expect(state.listManaged).toHaveBeenCalledTimes(2);
  });

  it("submits the management search to server pagination instead of filtering browser rows", async () => {
    act(() => root.render(<MemoryRouter><OfficialNoticeManagement composePath="/merchant-admin/notifications/compose" scope="merchant" /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("営業時間変更"));
    setField("搜索通知", "営業時間");
    await click("搜索");
    await waitFor(() => expect(state.listManaged).toHaveBeenCalledTimes(2));
    expect(state.listManaged).toHaveBeenLastCalledWith("merchant", {
      page: 1,
      pageSize: 20,
      search: "営業時間"
    });
  });

  it("hides write controls for a read-only identity and renders an empty page", async () => {
    state.permissions = new Set(["merchant-admin:notice:read"]);
    state.listManaged.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    act(() => root.render(<MemoryRouter><OfficialNoticeManagement composePath="/merchant-admin/notifications/compose" scope="merchant" /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("暂无符合条件的通知"));
    expect(container.textContent).toContain("只读");
    expect(container.textContent).not.toContain("创建通知");
  });

  it("submits only a server-derived merchant audience and navigates on success", async () => {
    act(() => root.render(<MemoryRouter initialEntries={["/compose"]}><Routes><Route path="/compose" element={<OfficialNoticeComposer returnPath="/done" scope="merchant" />} /><Route path="/done" element={<p>done</p>} /></Routes></MemoryRouter>));
    setField("标题", "営業時間変更");
    setField("摘要", "営業時間のお知らせ");
    setField("正文", "18時まで営業します");
    await click("确认创建");
    await waitFor(() => expect(state.createManaged).toHaveBeenCalledTimes(1));
    expect(state.createManaged.mock.calls[0]?.[0]).toBe("merchant");
    expect(state.createManaged.mock.calls[0]?.[1]).toMatchObject({ audience: { type: "shop_card_holders" }, sendMode: "now", scheduledAt: null });
    expect(JSON.stringify(state.createManaged.mock.calls[0]?.[1])).not.toMatch(/userIds|shopId|issuer/);
    expect(container.textContent).not.toMatch(/NeeDoID|指定アカウント/);
    await waitFor(() => expect(container.textContent).toContain("done"));
  });

  it("searches the formal global account directory and submits selected public NeeDo IDs", async () => {
    state.permissions = new Set([
      "button:backoffice-official-notice-create",
      "button:backoffice-official-notice-send",
      "backoffice:users:read"
    ]);
    act(() => root.render(<MemoryRouter initialEntries={["/compose"]}><Routes><Route path="/compose" element={<OfficialNoticeComposer returnPath="/done" scope="platform" />} /><Route path="/done" element={<p>done</p>} /></Routes></MemoryRouter>));

    const exactRadio = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("指定アカウント"))
      ?.querySelector("input") as HTMLInputElement | undefined;
    expect(exactRadio).toBeDefined();
    act(() => exactRadio?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setField("メール、携帯番号または NeeDoID", "hanako@example.com");
    await click("アカウントを検索");

    await waitFor(() => expect(state.listUsers).toHaveBeenCalledWith({
      keyword: "hanako@example.com",
      state: "active",
      page: 1,
      page_size: 20
    }));
    expect(container.textContent).toContain("u0000000009");
    expect(container.textContent).toContain("+819012345678");
    await click("u0000000009");

    setField("标题", "账号通知");
    setField("摘要", "只发给花子");
    setField("正文", "请确认账号资料");
    await click("确认创建");
    await waitFor(() => expect(state.createManaged).toHaveBeenCalledTimes(1));
    expect(state.createManaged.mock.calls[0]?.[0]).toBe("platform");
    expect(state.createManaged.mock.calls[0]?.[1]).toMatchObject({
      audience: { type: "exact_users", needoIds: ["u0000000009"] }
    });
    expect(JSON.stringify(state.createManaged.mock.calls[0]?.[1])).not.toMatch(/userIds|friend|好友/);
  });

  it("loads the current-identity inbox and writes its read receipt", async () => {
    act(() => root.render(<MemoryRouter><OfficialNoticeInbox /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("営業時間変更"));
    expect(state.listInbox).toHaveBeenCalledWith({ locale: "ja", unreadOnly: false, page: 1, pageSize: 20 });
    await click("标记已读");
    await waitFor(() => expect(state.markRead).toHaveBeenCalledWith("notice-1"));
    expect(container.textContent).toContain("已读");
  });
});
