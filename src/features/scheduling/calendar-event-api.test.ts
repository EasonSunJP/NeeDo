import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { calendarEventApi } from "./calendar-event-api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("calendarEventApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses formal CRUD endpoints with idempotency and optimistic versioning", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    await calendarEventApi.list({ from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") });
    await calendarEventApi.create({ title: "日程" } as never, "key-1");
    await calendarEventApi.update(7, { expectedVersion: 2, title: "更新" });
    await calendarEventApi.remove(7, 3);
    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/calendar-events", expect.objectContaining({ query: expect.objectContaining({ page: 1, page_size: 100 }) }));
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/calendar-events", expect.objectContaining({ method: "POST", headers: { "Idempotency-Key": "key-1" } }));
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/calendar-events/7", expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ expectedVersion: 2 }) }));
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/calendar-events/7", expect.objectContaining({ method: "DELETE", query: { expected_version: 3 } }));
  });
});
