import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { officialNoticesApi } from "./officialNotices";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("officialNoticesApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset().mockResolvedValue({}));

  it("keeps platform and merchant management namespaces separate", async () => {
    await officialNoticesApi.listManaged("platform", { page: 2, pageSize: 20, status: "sent", search: "maintenance" });
    await officialNoticesApi.listManaged("merchant", { page: 1, pageSize: 10, level: "urgent", search: "営業時間" });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/official-notices?page=2&pageSize=20&status=sent&search=maintenance"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/merchant-admin/official-notices?page=1&pageSize=10&level=urgent&search=%E5%96%B6%E6%A5%AD%E6%99%82%E9%96%93"
    );
  });

  it("sends only server-derived merchant audience input", async () => {
    const translation = {
      title: "営業時間変更",
      summary: "本日の営業時間を変更します",
      blocks: [{ id: "body", type: "paragraph" as const, content: "18時まで営業します" }]
    };
    const input = {
      sourceLocale: "ja" as const,
      level: "important" as const,
      translations: {
        "zh-CN": translation,
        "zh-TW": translation,
        en: translation,
        ja: translation,
        ko: translation
      },
      audience: { type: "shop_employees" as const },
      sendMode: "now" as const,
      scheduledAt: null,
      idempotencyKey: "notice-ui-create"
    };
    await officialNoticesApi.createManaged("merchant", input);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/official-notices", {
      method: "POST",
      body: input
    });
    expect(JSON.stringify(input)).not.toMatch(/shopId|userIds|issuer/);
  });

  it("uses scoped formal endpoints for draft save, reload, update, and plan", async () => {
    const draft = {
      sourceLocale: "ja" as const,
      level: "general" as const,
      translations: {
        "zh-CN": { title: "", summary: "", blocks: [], isInitialCopy: true },
        "zh-TW": { title: "", summary: "", blocks: [], isInitialCopy: true },
        en: { title: "", summary: "", blocks: [], isInitialCopy: true },
        ja: { title: "編集中", summary: "", blocks: [], isInitialCopy: false },
        ko: { title: "", summary: "", blocks: [], isInitialCopy: true }
      },
      audience: { type: "shop_card_holders" as const },
      idempotencyKey: "draft-ui-create"
    };
    const plan = {
      expectedLockVersion: 2,
      sendMode: "now" as const,
      scheduledAt: null,
      idempotencyKey: "draft-ui-plan"
    };

    await officialNoticesApi.createDraft("merchant", draft);
    await officialNoticesApi.getManaged("merchant", "notice-draft");
    await officialNoticesApi.updateDraft("merchant", "notice-draft", {
      ...draft,
      expectedLockVersion: 1,
      idempotencyKey: "draft-ui-update"
    });
    await officialNoticesApi.planDraft("merchant", "notice-draft", plan);

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/merchant-admin/official-notices/drafts",
      { method: "POST", body: draft }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/merchant-admin/official-notices/notice-draft"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/merchant-admin/official-notices/notice-draft/draft",
      { method: "PUT", body: expect.objectContaining({ expectedLockVersion: 1 }) }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/merchant-admin/official-notices/notice-draft/plan",
      { method: "POST", body: plan }
    );
  });

  it("uploads raw notice media through the selected portal namespace", async () => {
    const file = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" });
    await officialNoticesApi.uploadMedia("platform", file, "Guide");
    await officialNoticesApi.uploadMedia("merchant", file);

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/official-notices/media",
      {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/pdf" },
        query: { file_name: "guide.pdf", caption: "Guide" }
      }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/merchant-admin/official-notices/media",
      {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/pdf" },
        query: { file_name: "guide.pdf", caption: undefined }
      }
    );
  });

  it("uses scoped lifecycle and current-identity inbox endpoints", async () => {
    const command = {
      expectedLockVersion: 3,
      reason: "operator request",
      idempotencyKey: "notice-ui-cancel"
    };
    await officialNoticesApi.cancelManaged("merchant", "notice-1", command);
    await officialNoticesApi.archiveManaged("platform", "notice-2", command);
    await officialNoticesApi.retryManaged("merchant", "notice-3", command);
    await officialNoticesApi.listInbox({ locale: "ja", unreadOnly: true, page: 1, pageSize: 20 });
    await officialNoticesApi.markRead("notice-4");

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/merchant-admin/official-notices/notice-1/cancel",
      { method: "POST", body: command }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/official-notices/notice-2/archive",
      { method: "POST", body: command }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/merchant-admin/official-notices/notice-3/retry-failures",
      { method: "POST", body: command }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/official-notices?locale=ja&unreadOnly=true&page=1&pageSize=20"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/official-notices/notice-4/read",
      { method: "POST" }
    );
  });
});
