import { ERROR_CODES } from "../src/constants/error-codes";
import {
  FieldJobService,
  type FieldJobRepositoryPort,
  type FieldJobSourceRecord
} from "../src/services/field-job.service";

const source: FieldJobSourceRecord = {
  id: 71,
  orderNo: "LDF26-0007100",
  status: "CONFIRMED",
  serviceName: "訪問リラクゼーション 90分",
  shopId: 16,
  shopName: "LifeDance 新宿",
  customerPublicId: "u0000000206",
  technicianProfileId: 22,
  technicianNeedoId: "s0000000022",
  technicianName: "担当技師",
  startsAt: new Date("2026-09-15T07:00:00.000Z"),
  endsAt: new Date("2026-09-15T08:30:00.000Z"),
  createdAt: new Date("2026-09-13T01:00:00.000Z"),
  updatedAt: new Date("2026-09-13T02:00:00.000Z"),
  address: {
    regionLabel: "東京都 新宿区",
    lines: ["西新宿1-2-3", "NeeDoビル 301"]
  },
  serviceSession: {
    startedAt: null,
    expectedEndsAt: new Date("2026-09-15T08:30:00.000Z"),
    endedAt: null
  },
  receiptConfirmedAt: null,
  paymentStatus: "PENDING",
  activeSosCount: 1,
  activeRefundCaseCount: 1,
  openDisputeCount: 0,
  overdueResolution: null,
  hasPerformanceIssue: false,
  timeline: [
    {
      id: 901,
      fromStatus: "PENDING",
      toStatus: "CONFIRMED",
      reason: "店铺确认",
      createdAt: new Date("2026-09-13T02:00:00.000Z")
    }
  ]
};

const actor = (permissions: string[]) =>
  ({
    userId: 7,
    currentIdentityId: 9,
    currentIdentityType: "platform",
    currentIdentityScopeType: "global",
    currentIdentityScopeId: null,
    permissions
  }) as never;

const context = { ipAddress: "127.0.0.1", userAgent: "jest" } as never;

const createHarness = () => {
  const repository: jest.Mocked<FieldJobRepositoryPort> = {
    list: jest.fn(async (input) => ({
      list: [source],
      total: 1,
      page: input.page,
      page_size: input.pageSize
    })),
    findById: jest.fn(async (id: number) => (id > 0 ? source : null))
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { repository, audit, service: new FieldJobService(repository, audit as never) };
};

describe("FieldJobService", () => {
  it("returns only regional address and suppresses SOS facts without optional permissions", async () => {
    const { service } = createHarness();

    const result = await service.get(actor(["backoffice:field-jobs:read"]), context, source.id);

    expect(result.location).toEqual({
      disclosure: "region_only",
      regionLabel: "東京都 新宿区",
      lines: null
    });
    expect(result.exceptions.activeSosCount).toBeNull();
    expect(result.credential).toEqual({ state: "issued", verifiedAt: null });
    expect(JSON.stringify(result)).not.toMatch(
      /西新宿|NeeDoビル|verificationHash|verificationCode/i
    );
  });

  it("reveals exact address and SOS count only when both permissions are present", async () => {
    const { service } = createHarness();

    const result = await service.get(
      actor(["backoffice:field-jobs:read", "backoffice:field-jobs:address:read", "sos:list"]),
      context,
      source.id
    );

    expect(result.location).toEqual({
      disclosure: "full",
      regionLabel: "東京都 新宿区",
      lines: ["西新宿1-2-3", "NeeDoビル 301"]
    });
    expect(result.exceptions.activeSosCount).toBe(1);
  });

  it("keeps list rows region-only even when the actor may read an exact address", async () => {
    const { service } = createHarness();

    const result = await service.list(
      actor(["backoffice:field-jobs:read", "backoffice:field-jobs:address:read"]),
      context,
      { page: 1, pageSize: 20 }
    );

    expect(result.list[0]?.location).toEqual({
      disclosure: "region_only",
      regionLabel: "東京都 新宿区",
      lines: null
    });
  });

  it("audits paginated list and detail reads without address or customer PII", async () => {
    const { service, audit } = createHarness();
    const access = actor(["backoffice:field-jobs:read"]);

    await service.list(access, context, {
      page: 2,
      pageSize: 10,
      keyword: "LDF26",
      status: "confirmed",
      assignment: "assigned"
    });
    await service.get(access, context, source.id);

    expect(audit.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "backoffice.field_jobs.list",
        targetType: "booking_order",
        metadata: {
          page: 2,
          pageSize: 10,
          keyword: "LDF26",
          status: "confirmed",
          assignment: "assigned"
        }
      })
    );
    expect(audit.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "backoffice.field_job.read",
        targetType: "BookingOrder",
        targetId: source.id,
        metadata: {
          bookingOrderId: source.id,
          addressDisclosure: "region_only",
          sosDisclosure: "hidden"
        }
      })
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toMatch(/西新宿|u0000000206/);
  });

  it("returns the formal not-found error for a non-home or missing order", async () => {
    const { service, repository } = createHarness();
    repository.findById.mockResolvedValueOnce(null);

    await expect(
      service.get(actor(["backoffice:field-jobs:read"]), context, 99)
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, message: "error.field_job.not_found" });
  });
});
