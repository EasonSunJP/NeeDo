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
    const input = {
      sourceLocale: "ja" as const,
      level: "important" as const,
      title: "営業時間変更",
      summary: "本日の営業時間を変更します",
      blocks: [{ id: "body", type: "paragraph" as const, content: "18時まで営業します" }],
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
