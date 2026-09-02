import { ERROR_CODES } from "../src/constants/error-codes";
import { AnalyticsRankingIncompleteEvidenceError } from "../src/domain/analytics-ranking";
import type { AnalyticsRankingRepositoryPort } from "../src/repositories/analytics-ranking.repository";
import { AnalyticsRankingService } from "../src/services/analytics-ranking.service";
import {
  analyticsRankingParamsSchema,
  analyticsRankingQuerySchema
} from "../src/validators/analytics-ranking.validator";

const now = new Date("2026-09-01T05:30:00.000Z");
const actor = {
  userId: 9, roles: ["operator"], permissions: ["backoffice:analytics-ranking:read"],
  currentIdentityType: "platform", currentIdentityScopeType: "global", currentIdentityScopeId: null
} as never;
const context = { ip: "127.0.0.1", userAgent: "jest" };
const page = { list: [], total: 0, page: 1, page_size: 10 };
const repository = (): jest.Mocked<AnalyticsRankingRepositoryPort> => ({
  findActiveCategoryById: jest.fn(async (categoryId: number) => ({ id: categoryId })),
  listRankings: jest.fn(async (input) => ({ ...page, page: input.page, page_size: input.pageSize }))
});
const audit = () => ({ record: jest.fn(async () => undefined) });

describe("analytics ranking validation", () => {
  it("normalizes strict defaults and bounded filters", () => {
    expect(analyticsRankingParamsSchema.parse({ kind: "service" })).toEqual({ kind: "service" });
    expect(analyticsRankingQuerySchema.parse({ city: " 东京 ", categoryId: "8" })).toEqual({
      period: "last7days", metric: "gmv", city: "东京", categoryId: 8, page: 1, pageSize: 10
    });
  });

  it.each([
    [{ kind: "merchant" }, {}],
    [{ kind: "service" }, { unknown: "x" }],
    [{ kind: "service" }, { metric: "revenue" }],
    [{ kind: "service" }, { city: " " }],
    [{ kind: "service" }, { period: "last7days", from: "2026-08-01" }],
    [{ kind: "service" }, { period: "custom", from: "2026-08-01" }],
    [{ kind: "service" }, { categoryId: 0 }],
    [{ kind: "service" }, { page: "900719925474100" }],
    [{ kind: "service" }, { pageSize: 11 }],
    [{ kind: "service" }, { page: "1e2" }]
  ])("rejects malformed request %#", (params, query) => {
    expect(analyticsRankingParamsSchema.safeParse(params).success
      && analyticsRankingQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("AnalyticsRankingService", () => {
  it("captures one clock, resolves category once, returns the exact filter and audits allowlisted data", async () => {
    const repo = repository();
    const auditLog = audit();
    const clock = jest.fn(() => now);
    const service = new AnalyticsRankingService(repo, auditLog as never, clock);
    const result = await service.list(actor, context, { kind: "technician" }, {
      period: "last7days", metric: "completedCount", city: "东京", categoryId: 8,
      page: 1, pageSize: 10
    });
    expect(clock).toHaveBeenCalledTimes(1);
    expect(repo.findActiveCategoryById).toHaveBeenCalledTimes(1);
    expect(repo.findActiveCategoryById).toHaveBeenCalledWith(8);
    expect(repo.listRankings).toHaveBeenCalledWith(expect.objectContaining({
      kind: "technician", metric: "completedCount", city: "东京", categoryId: 8,
      evaluatedAt: now, window: expect.objectContaining({ fromDate: "2026-08-26", toDate: "2026-09-01" })
    }));
    expect(result).toEqual(expect.objectContaining({
      ...page, dataStatus: "ready",
      filter: { kind: "technician", metric: "completedCount", period: "last7days",
        from: "2026-08-26", to: "2026-09-01", timeZone: "Asia/Tokyo",
        city: "东京", categoryId: 8, evaluatedAt: now.toISOString() }
    }));
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "backoffice.analytics_ranking.read", targetType: "analytics_ranking", targetId: null,
      metadata: { kind: "technician", metric: "completedCount", period: "last7days",
        from: "2026-08-26", to: "2026-09-01", city: "东京", categoryId: 8,
        page: 1, pageSize: 10, resultCount: 0 }
    }));
  });

  it("does not query category unfiltered and maps missing category before ranking", async () => {
    const repo = repository();
    const service = new AnalyticsRankingService(repo, audit() as never, () => now);
    await service.list(actor, context, { kind: "customer" }, {
      period: "last7days", metric: "gmv", page: 1, pageSize: 10
    });
    expect(repo.findActiveCategoryById).not.toHaveBeenCalled();

    repo.findActiveCategoryById.mockResolvedValueOnce(null);
    await expect(service.list(actor, context, { kind: "service" }, {
      period: "last7days", metric: "gmv", categoryId: 99, page: 1, pageSize: 10
    })).rejects.toMatchObject({ code: ERROR_CODES.ANALYTICS_RANKING_CATEGORY_NOT_FOUND,
      message: "error.analytics_ranking.category_not_found", statusCode: 404 });
    expect(repo.listRankings).toHaveBeenCalledTimes(1);
  });

  it("maps only typed repository evidence errors and propagates audit failure", async () => {
    const repo = repository();
    repo.listRankings.mockRejectedValueOnce(new AnalyticsRankingIncompleteEvidenceError());
    const service = new AnalyticsRankingService(repo, audit() as never, () => now);
    await expect(service.list(actor, context, { kind: "service" }, {
      period: "last7days", metric: "gmv", page: 1, pageSize: 10
    })).rejects.toMatchObject({ code: ERROR_CODES.ANALYTICS_RANKING_INCOMPLETE_EVIDENCE,
      message: "error.analytics_ranking.incomplete_evidence", statusCode: 409 });

    const failingAudit = { record: jest.fn(async () => { throw new Error("audit unavailable"); }) };
    const another = new AnalyticsRankingService(repository(), failingAudit as never, () => now);
    await expect(another.list(actor, context, { kind: "service" }, {
      period: "last7days", metric: "gmv", page: 1, pageSize: 10
    })).rejects.toThrow("audit unavailable");
  });
});
