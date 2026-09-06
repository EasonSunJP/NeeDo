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
  createDraft: vi.fn(),
  getManaged: vi.fn(),
  updateDraft: vi.fn(),
  planDraft: vi.fn(),
  cancelManaged: vi.fn(),
  archiveManaged: vi.fn(),
  retryManaged: vi.fn(),
  listInbox: vi.fn(),
  markRead: vi.fn(),
  listUsers: vi.fn(),
  uploadContentImage: vi.fn()
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
    createDraft: state.createDraft,
    getManaged: state.getManaged,
    updateDraft: state.updateDraft,
    planDraft: state.planDraft,
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
vi.mock("../../api/contentPublication", () => ({
  contentPublicationApi: { uploadContentImage: state.uploadContentImage }
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
        { id: "body", type: "paragraph" as const, content: "18時まで営業します", fontSize: "xlarge" as const }
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
    state.createDraft.mockResolvedValue({ ...notice, status: "draft", scheduledAt: null });
    state.getManaged.mockResolvedValue({
      ...notice,
      status: "draft",
      scheduledAt: null,
      audience: { type: "shop_employees" }
    });
    state.updateDraft.mockResolvedValue({ ...notice, status: "draft", scheduledAt: null, lockVersion: 3 });
    state.planDraft.mockResolvedValue({ ...notice, status: "sent", lockVersion: 4 });
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
    state.uploadContentImage.mockResolvedValue({
      publicId: "a".repeat(64),
      mediaAssetId: 41,
      url: `/media/content/${"a".repeat(64)}.webp`,
      mimeType: "image/webp",
      width: 800,
      height: 600,
      checksumSha256: "a".repeat(64)
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
    expect([...container.querySelectorAll('[data-notice-font-size="xlarge"]')]
      .some((block) => block.textContent === "18時まで営業します")).toBe(true);
    setField("操作理由", "排期调整");
    await click("取消发送");
    await waitFor(() => expect(state.cancelManaged).toHaveBeenCalledTimes(1));
    expect(state.cancelManaged.mock.calls[0]?.[2]).toMatchObject({ expectedLockVersion: 2, reason: "排期调整", idempotencyKey: "notice-ui:notice-1:cancel:2" });
    expect(state.listManaged).toHaveBeenCalledTimes(2);
  });

  it("opens a persisted draft from the management drawer for continued editing", async () => {
    state.listManaged.mockResolvedValue({
      list: [{ ...notice, status: "draft", scheduledAt: null }],
      total: 1,
      page: 1,
      page_size: 20
    });
    act(() => root.render(
      <MemoryRouter initialEntries={["/notifications"]}>
        <Routes>
          <Route
            path="/notifications"
            element={<OfficialNoticeManagement composePath="/notifications/compose" scope="merchant" />}
          />
          <Route path="/notifications/compose/:publicId" element={<p>continued draft</p>} />
        </Routes>
      </MemoryRouter>
    ));
    await waitFor(() => expect(container.textContent).toContain("営業時間変更"));
    await click("営業時間変更");
    await click("編集を続ける");
    expect(container.textContent).toContain("continued draft");
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

  it("invalidates the shared official-notice badge after marking an inbox item read", async () => {
    const changed = vi.fn();
    window.addEventListener("official-notice:changed", changed);
    act(() => root.render(<MemoryRouter><OfficialNoticeInbox /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("営業時間変更"));
    await click("标记已读");
    await waitFor(() => expect(state.markRead).toHaveBeenCalledWith("notice-1"));
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("official-notice:changed", changed);
  });

  it("hides write controls for a read-only identity and renders an empty page", async () => {
    state.permissions = new Set(["merchant-admin:notice:read"]);
    state.listManaged.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    act(() => root.render(<MemoryRouter><OfficialNoticeManagement composePath="/merchant-admin/notifications/compose" scope="merchant" /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("暂无符合条件的通知"));
    expect(container.textContent).toContain("只读");
    expect(container.textContent).not.toContain("创建通知");
  });

  it("lets a create-only identity enter the composer to save drafts", async () => {
    state.permissions = new Set(["merchant-admin:notice:read", "merchant-admin:notice:create"]);
    state.listManaged.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeManagement composePath="/merchant-admin/notifications/compose" scope="merchant" />
      </MemoryRouter>
    ));
    await waitFor(() => expect(container.textContent).toContain("暂无符合条件的通知"));
    expect(container.textContent).toContain("创建通知");
  });

  it("submits only a server-derived merchant audience and navigates on success", async () => {
    act(() => root.render(<MemoryRouter initialEntries={["/compose"]}><Routes><Route path="/compose" element={<OfficialNoticeComposer returnPath="/done" scope="merchant" />} /><Route path="/done" element={<p>done</p>} /></Routes></MemoryRouter>));
    setField("标题", "営業時間変更");
    setField("摘要", "営業時間のお知らせ");
    setField("正文", "18時まで営業します");
    await click("現在の内容を全言語へコピー");
    await click("确认创建");
    await waitFor(() => expect(state.planDraft).toHaveBeenCalledTimes(1));
    expect(state.createDraft.mock.calls[0]?.[0]).toBe("merchant");
    expect(state.createDraft.mock.calls[0]?.[1]).toMatchObject({ audience: { type: "shop_card_holders" } });
    expect(state.planDraft).toHaveBeenCalledWith("merchant", "notice-1", expect.objectContaining({ sendMode: "now", scheduledAt: null }));
    expect(JSON.stringify(state.createDraft.mock.calls[0]?.[1])).not.toMatch(/userIds|shopId|issuer/);
    expect(container.textContent).not.toMatch(/NeeDoID|指定アカウント/);
    await waitFor(() => expect(container.textContent).toContain("done"));
  });

  it("saves incomplete source content as a formal multilingual draft and keeps editing", async () => {
    state.permissions = new Set(["merchant-admin:notice:create"]);
    act(() => root.render(
      <MemoryRouter initialEntries={["/merchant-admin/notifications/compose"]}>
        <Routes>
          <Route
            path="/merchant-admin/notifications/compose"
            element={<OfficialNoticeComposer returnPath="/merchant-admin/notifications" scope="merchant" />}
          />
          <Route path="/merchant-admin/notifications/compose/:publicId" element={<p>draft editing route</p>} />
        </Routes>
      </MemoryRouter>
    ));
    setField("标题", "編集中の通知");
    await click("下書きを保存");

    await waitFor(() => expect(state.createDraft).toHaveBeenCalledTimes(1));
    const input = state.createDraft.mock.calls[0]?.[1];
    expect(input.translations.ja.title).toBe("編集中の通知");
    expect(input.translations.en.title).toBe("編集中の通知");
    expect(input.translations.ja.isInitialCopy).toBe(false);
    expect(input.translations.en.isInitialCopy).toBe(true);
    expect(state.planDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(container.textContent).toContain("draft editing route"));
  });

  it("reloads and updates a persisted merchant draft with optimistic locking", async () => {
    act(() => root.render(
      <MemoryRouter initialEntries={["/compose/notice-1"]}>
        <Routes>
          <Route
            path="/compose/:publicId"
            element={<OfficialNoticeComposer returnPath="/notifications" scope="merchant" />}
          />
        </Routes>
      </MemoryRouter>
    ));

    await waitFor(() => expect(state.getManaged).toHaveBeenCalledWith("merchant", "notice-1"));
    await waitFor(() => expect((document.querySelector('input[maxlength="160"]') as HTMLInputElement).value).toBe("営業時間変更"));
    await click("下書きを保存");
    await waitFor(() => expect(state.updateDraft).toHaveBeenCalledTimes(1));
    expect(state.updateDraft).toHaveBeenCalledWith(
      "merchant",
      "notice-1",
      expect.objectContaining({ expectedLockVersion: 2, audience: { type: "shop_employees" } })
    );
  });

  it("builds and submits the approved structured notice blocks", async () => {
    act(() => root.render(<MemoryRouter initialEntries={["/compose"]}><Routes><Route path="/compose" element={<OfficialNoticeComposer returnPath="/done" scope="merchant" />} /><Route path="/done" element={<p>done</p>} /></Routes></MemoryRouter>));
    setField("标题", "结构化通知");
    setField("摘要", "检查内容块");
    setField("正文", "第一段正文");
    setField("文字サイズ", "large");
    await click("大段落标题");
    const textareas = document.querySelectorAll<HTMLTextAreaElement>("textarea");
    expect(textareas).toHaveLength(2);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textareas[1], "重要事项");
      textareas[1].dispatchEvent(new Event("input", { bubbles: true }));
      textareas[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("現在の内容を全言語へコピー");
    await click("英語");
    setField("标题", "Structured notice");
    await click("确认创建");
    await waitFor(() => expect(state.planDraft).toHaveBeenCalledTimes(1));
    expect(state.createDraft.mock.calls[0]?.[1].translations.ja.blocks).toEqual([
      expect.objectContaining({ type: "paragraph", content: "第一段正文", fontSize: "large" }),
      expect.objectContaining({ type: "heading", content: "重要事项" })
    ]);
    expect(Object.keys(state.createDraft.mock.calls[0]?.[1].translations).sort()).toEqual([
      "en", "ja", "ko", "zh-CN", "zh-TW"
    ]);
    expect(state.createDraft.mock.calls[0]?.[1].translations.en.title).toBe("Structured notice");
    expect(state.createDraft.mock.calls[0]?.[1].translations.ja.title).toBe("结构化通知");
    expect(state.createDraft.mock.calls[0]?.[1].sourceLocale).toBe("en");
    expect(state.createDraft.mock.calls[0]?.[1]).not.toHaveProperty("title");
    expect(state.createDraft.mock.calls[0]?.[1]).not.toHaveProperty("blocks");
  });

  it("uses localized quick buttons for source language and identity types", async () => {
    state.permissions = new Set([
      "button:backoffice-official-notice-create",
      "button:backoffice-official-notice-send",
      "backoffice:users:read"
    ]);
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeComposer returnPath="/done" scope="platform" />
      </MemoryRouter>
    ));

    expect(container.textContent).toContain("原文言語");
    expect(container.querySelectorAll("[data-source-locale]")).toHaveLength(5);
    expect(container.textContent).toContain("中国語（簡体）");
    expect(container.textContent).toContain("英語");
    expect([...container.querySelectorAll("select")].some((select) => select.parentElement?.textContent?.includes("原文言語"))).toBe(false);

    const identityAudience = [...container.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("アカウント種別"))
      ?.querySelector<HTMLInputElement>('input[name="audience"]') ?? null;
    expect(identityAudience).not.toBeNull();
    await act(async () => {
      identityAudience?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    for (const label of ["顧客", "技師", "店舗オーナー", "店舗スタッフ", "プラットフォーム", "運営管理者", "スカウト"]) {
      expect(container.textContent).toContain(label);
    }
    expect(container.textContent).not.toMatch(/merchant_owner|merchant_staff|platform_admin|customer/);
  });

  it("uploads image blocks through the formal content media API", async () => {
    act(() => root.render(<MemoryRouter><OfficialNoticeComposer returnPath="/done" scope="platform" /></MemoryRouter>));
    await click("图片");
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*="image/jpeg"]');
    expect(input).not.toBeNull();
    const file = new File(["formal-image"], "notice.webp", { type: "image/webp" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await waitFor(() => expect(state.uploadContentImage).toHaveBeenCalledWith(file, "notice.webp"));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(`/media/content/${"a".repeat(64)}.webp`);
    expect(container.innerHTML).not.toMatch(/data:image|blob:/);
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

    await waitFor(() => expect(state.listUsers).toHaveBeenCalledWith(
      "operations",
      {
        keyword: "hanako@example.com",
        state: "active",
        page: 1,
        page_size: 20
      }
    ));
    expect(container.textContent).toContain("u0000000009");
    expect(container.textContent).toContain("+819012345678");
    await click("u0000000009");

    setField("标题", "账号通知");
    setField("摘要", "只发给花子");
    setField("正文", "请确认账号资料");
    await click("現在の内容を全言語へコピー");
    await click("确认创建");
    await waitFor(() => expect(state.planDraft).toHaveBeenCalledTimes(1));
    expect(state.createDraft.mock.calls[0]?.[0]).toBe("platform");
    expect(state.createDraft.mock.calls[0]?.[1]).toMatchObject({
      audience: { type: "exact_users", needoIds: ["u0000000009"] }
    });
    expect(JSON.stringify(state.createDraft.mock.calls[0]?.[1])).not.toMatch(/userIds|friend|好友/);
  });

  it("preserves the approved operations compose workspace around the formal APIs", () => {
    state.permissions = new Set([
      "button:backoffice-official-notice-create",
      "button:backoffice-official-notice-send",
      "backoffice:users:read"
    ]);
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeComposer returnPath="/done" scope="platform" />
      </MemoryRouter>
    ));

    expect(container.textContent).toContain("发送设置");
    expect(container.textContent).toContain("发送对象");
    expect(container.textContent).toContain("发送时间");
    expect(container.textContent).toContain("发送预览");
    expect(container.textContent).toContain("发送检查");
    expect(container.querySelector(".official-notice-editor")).not.toBeNull();
    expect(container.querySelector("[data-official-notice-block-toolbar]")).not.toBeNull();
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
