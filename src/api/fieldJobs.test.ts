import { beforeEach, describe, expect, it, vi } from "vitest";
import { fieldJobApi } from "./fieldJobs";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

const summary = {
  id: 71,
  orderNo: "LDF26-0007100",
  status: "confirmed",
  serviceName: "訪問リラクゼーション 90分",
  shop: { id: 16, name: "LifeDance 新宿" },
  technician: {
    assignment: "assigned",
    profileId: 22,
    needoId: "s0000000022",
    name: "担当技師",
  },
  startsAt: "2026-09-15T07:00:00.000Z",
  endsAt: "2026-09-15T08:30:00.000Z",
  location: {
    disclosure: "region_only",
    regionLabel: "東京都 新宿区",
    lines: null,
  },
  credential: { state: "issued", verifiedAt: null },
  evidence: {
    startedAt: null,
    expectedEndsAt: "2026-09-15T08:30:00.000Z",
    endedAt: null,
    receiptConfirmedAt: null,
    paymentStatus: "pending",
  },
  exceptions: {
    activeSosCount: null,
    activeRefundCaseCount: 0,
    openDisputeCount: 0,
    overdueResolution: null,
    hasPerformanceIssue: false,
  },
  createdAt: "2026-09-13T01:00:00.000Z",
  updatedAt: "2026-09-13T02:00:00.000Z",
};

describe("fieldJobApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("passes server pagination and formal projection filters", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      list: [summary],
      total: 1,
      page: 2,
      page_size: 10,
    } as never);

    await expect(
      fieldJobApi.list({
        page: 2,
        pageSize: 10,
        keyword: "LDF26",
        status: "confirmed",
        assignment: "assigned",
      }),
    ).resolves.toMatchObject({ total: 1, page: 2 });

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/field-jobs", {
      query: {
        page: 2,
        pageSize: 10,
        keyword: "LDF26",
        status: "confirmed",
        assignment: "assigned",
      },
    });
  });

  it("strictly rejects secret or undocumented response fields", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      ...summary,
      customerPublicId: "u0000000206",
      timeline: [],
      verificationHash: "must-not-cross-boundary",
    } as never);

    await expect(fieldJobApi.get(71)).rejects.toThrow();
  });

  it("reads one formal detail from the dedicated endpoint", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      ...summary,
      location: {
        disclosure: "full",
        regionLabel: "東京都 新宿区",
        lines: ["〒160-0022 東京都新宿区西新宿1-2-3"],
      },
      customerPublicId: "u0000000206",
      timeline: [],
    } as never);

    await expect(fieldJobApi.get(71)).resolves.toMatchObject({ id: 71 });
    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/field-jobs/71",
    );
  });
});
