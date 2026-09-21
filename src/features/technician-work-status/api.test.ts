import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { workStatusApi } from "./api";
vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));
describe("formal work status API", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());
  it("uses authenticated technician scope and sends version/idempotency", async () => {
    const input = {
      status: "on_duty" as const,
      expectedVersion: 2,
      idempotencyKey: "request-1",
    };
    await workStatusApi.snapshot({ scope: "technician" });
    await workStatusApi.update(input);
    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/technician-work-status/me",
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/technician-work-status/me",
      { method: "PATCH", body: input },
    );
  });
  it("switches the server-authoritative operating shop with idempotency", async () => {
    const input = {
      shopId: 72,
      idempotencyKey: "switch-shop-72",
    };
    await workStatusApi.switchCurrentShop(input);
    expect(httpClient.request).toHaveBeenCalledWith(
      "/technician-work-status/me/current-shop",
      { method: "PATCH", body: input },
    );
  });
  it("passes date/type/pagination to server and uses merchant scope", async () => {
    const query = {
      page: 2,
      page_size: 10,
      kind: "late" as const,
      from: "2026-08-31T15:00:00.000Z",
      to: "2026-09-30T15:00:00.000Z",
    };
    await workStatusApi.events(
      { scope: "merchant-admin", technicianProfileId: 31 },
      query,
    );
    expect(httpClient.request).toHaveBeenCalledWith(
      "/merchant-admin/technicians/31/work-status/events",
      { query },
    );
  });
  it("persists comments using a server request", async () => {
    await workStatusApi.comment(
      { scope: "backoffice", technicianProfileId: 31 },
      { message: "traffic delay", idempotencyKey: "comment-1" },
    );
    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/technicians/31/work-status/comments",
      {
        method: "POST",
        body: { message: "traffic delay", idempotencyKey: "comment-1" },
      },
    );
  });
});
