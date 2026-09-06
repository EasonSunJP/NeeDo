import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../api/httpClient", () => ({ httpClient: { request } }));
import { sosApi } from "./api";

describe("SOS formal API", () => {
  beforeEach(() => { request.mockReset(); });
  it("uses the authenticated booking endpoint and retains the retry key", async () => {
    request.mockResolvedValue({ alert: { id: 1 }, replayed: true });
    await sosApi.send(12, "retry-key");
    expect(request).toHaveBeenCalledWith("/bookings/12/sos", { method: "POST", body: { idempotencyKey: "retry-key" } });
  });
  it("sends bounded pagination and never a client supplied merchant scope", async () => {
    await sosApi.list("pending", 2);
    expect(request).toHaveBeenCalledWith("/sos-alerts", { query: { status: "pending", page: 2, page_size: 20 }, signal: undefined });
  });
  it("propagates transport errors instead of manufacturing an empty count", async () => {
    request.mockRejectedValue(new Error("offline"));
    await expect(sosApi.count()).rejects.toThrow("offline");
  });
});
