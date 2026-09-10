import { beforeEach, describe, expect, it, vi } from "vitest";
import { ndpExchangeRateApi } from "./ndpExchangeRate";
import { ApiClientError, httpClient } from "./httpClient";

vi.mock("./httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./httpClient")>()),
  httpClient: { request: vi.fn() }
}));

const rawRate = {
  ruleId: 7,
  publicId: "rate-7",
  version: 7,
  ndpUnits: 3,
  jpyUnits: 5,
  status: "active",
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  effectiveTo: null,
  reason: "运营调整",
  createdById: 91,
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
  activeKey: "must-not-leak",
  idempotencyKey: "must-not-leak"
};

describe("ndpExchangeRateApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the formal overview endpoint and strips persistence-only keys", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      current: rawRate,
      nextScheduled: null,
      latestVersion: 7,
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      history: { list: [rawRate], total: 1, page: 2, page_size: 20 }
    });

    const result = await ndpExchangeRateApi.getOverview({
      page: 2,
      pageSize: 20,
      at: "2026-09-01T00:00:00.000Z"
    });

    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/ndp-exchange-rates",
      { query: { page: 2, pageSize: 20, at: "2026-09-01T00:00:00.000Z" } }
    );
    expect(result.current).toEqual({
      ruleId: 7,
      publicId: "rate-7",
      version: 7,
      ndpUnits: 3,
      jpyUnits: 5,
      status: "active",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveTo: null,
      reason: "运营调整",
      createdById: 91,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z"
    });
    expect(JSON.stringify(result)).not.toContain("activeKey");
    expect(JSON.stringify(result)).not.toContain("idempotencyKey");
  });

  it("omits at for fresh reads and publishes an exact integer command", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({
        current: null,
        nextScheduled: null,
        latestVersion: 0,
        evaluatedAt: "2026-09-01T00:00:00.000Z",
        history: { list: [], total: 0, page: 1, page_size: 20 }
      })
      .mockResolvedValueOnce(rawRate);

    await ndpExchangeRateApi.getOverview({ page: 1, pageSize: 20 });
    const published = await ndpExchangeRateApi.publish({
      ndpUnits: 3,
      jpyUnits: 5,
      expectedVersion: 6,
      effectiveFrom: "2026-09-02T00:00:00.000Z",
      reason: "运营调整",
      idempotencyKey: "1234567890abcdef"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/ndp-exchange-rates",
      { query: { page: 1, pageSize: 20 } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/ndp-exchange-rates",
      {
        method: "POST",
        body: {
          ndpUnits: 3,
          jpyUnits: 5,
          expectedVersion: 6,
          effectiveFrom: "2026-09-02T00:00:00.000Z",
          reason: "运营调整",
          idempotencyKey: "1234567890abcdef"
        }
      }
    );
    expect(JSON.stringify(published)).not.toContain("activeKey");
    expect(JSON.stringify(published)).not.toContain("idempotencyKey");
  });

  it("propagates formal API failures without fallback data", async () => {
    const failure = new ApiClientError("error.ndp_exchange_rate.conflict", 40963, 409);
    vi.mocked(httpClient.request).mockRejectedValue(failure);

    await expect(ndpExchangeRateApi.getOverview()).rejects.toBe(failure);
    await expect(ndpExchangeRateApi.publish({
      ndpUnits: 1,
      jpyUnits: 1,
      expectedVersion: 0,
      effectiveFrom: "2026-09-02T00:00:00.000Z",
      reason: "initial",
      idempotencyKey: "1234567890abcdef"
    })).rejects.toBe(failure);
    await expect(ndpExchangeRateApi.getOverview()).rejects.toMatchObject({
      code: 40963,
      status: 409
    });
  });
});
