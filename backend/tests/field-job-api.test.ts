import request from "supertest";
import { FIELD_JOB_PERMISSIONS } from "../src/constants/permissions.constants";
import type {
  FieldJobRepositoryPort,
  FieldJobSourceRecord
} from "../src/services/field-job.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const record: FieldJobSourceRecord = {
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
  address: { regionLabel: "東京都 新宿区", lines: ["西新宿1-2-3", "NeeDoビル 301"] },
  serviceSession: { startedAt: null, expectedEndsAt: null, endedAt: null },
  receiptConfirmedAt: null,
  paymentStatus: "PENDING",
  activeSosCount: 1,
  activeRefundCaseCount: 0,
  openDisputeCount: 0,
  overdueResolution: null,
  hasPerformanceIssue: false,
  timeline: []
};

const repository: jest.Mocked<FieldJobRepositoryPort> = {
  list: jest.fn(async (input) => ({
    list: [record],
    total: 1,
    page: input.page,
    page_size: input.pageSize
  })),
  findById: jest.fn(async (id: number) => (id > 0 ? record : null))
};

describe("formal field-job API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires authentication and the dedicated read permission", async () => {
    const fixture = await createStep06Fixture({ fieldJobRepository: repository } as never);
    await request(fixture.app).get("/api/v1/backoffice/field-jobs").expect(401);
    fixture.replaceAdminPermissions(["auth:me"]);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app)
      .get("/api/v1/backoffice/field-jobs")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("validates and forwards the paginated home-job filters", async () => {
    const fixture = await createStep06Fixture({ fieldJobRepository: repository } as never);
    fixture.replaceAdminPermissions(["auth:me", FIELD_JOB_PERMISSIONS.read]);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get(
        "/api/v1/backoffice/field-jobs?page=2&pageSize=10&keyword=LDF26&status=confirmed&assignment=assigned"
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(repository.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      keyword: "LDF26",
      status: "confirmed",
      assignment: "assigned"
    });
    expect(response.body).toMatchObject({
      code: 0,
      message: "success",
      data: { total: 1, page: 2, page_size: 10 }
    });
    expect(response.body.data.list[0].location).toEqual({
      disclosure: "region_only",
      regionLabel: "東京都 新宿区",
      lines: null
    });
    expect(response.body.data.list[0].exceptions.activeSosCount).toBeNull();
    expect(JSON.stringify(response.body)).not.toMatch(/西新宿|verificationHash|verificationCode/i);
  });

  it("returns full detail only with address and SOS permissions", async () => {
    const fixture = await createStep06Fixture({ fieldJobRepository: repository } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      FIELD_JOB_PERMISSIONS.read,
      FIELD_JOB_PERMISSIONS.addressRead,
      "sos:list"
    ]);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/field-jobs/71")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.location).toEqual({
      disclosure: "full",
      regionLabel: "東京都 新宿区",
      lines: ["西新宿1-2-3", "NeeDoビル 301"]
    });
    expect(response.body.data.exceptions.activeSosCount).toBe(1);
    expect(JSON.stringify(response.body)).not.toMatch(/verificationHash|verificationCode/i);
  });

  it("rejects unknown filters and invalid identifiers", async () => {
    const fixture = await createStep06Fixture({ fieldJobRepository: repository } as never);
    fixture.replaceAdminPermissions(["auth:me", FIELD_JOB_PERMISSIONS.read]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/field-jobs?assignment=other")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/field-jobs/0")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});
