import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { merchantEmployeeApi } from "./employeeApi";

vi.mock("../../api/httpClient", () => ({
  httpClient: {
    request: vi.fn(),
  },
}));

describe("merchant employee API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the shop-scoped formal employee list and detail routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantEmployeeApi.list({
      keyword: "NEEDO-S-47",
      page: 2,
      pageSize: 10,
      relationshipType: "partner",
      workStatus: "active",
    });
    await merchantEmployeeApi.detail(" NEEDO-S-47 ");

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/merchant-admin/employees",
      {
        query: {
          keyword: "NEEDO-S-47",
          page: 2,
          pageSize: 10,
          relationshipType: "partner",
          workStatus: "active",
        },
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/merchant-admin/employees/NEEDO-S-47",
    );
  });

  it("uses the dedicated profile and affiliation mutation routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantEmployeeApi.updateProfile("NEEDO-S-47/东京", {
      city: "東京都",
      displayName: "斉藤 健太",
    });
    await merchantEmployeeApi.updateAffiliation("NEEDO-S-47/东京", {
      endsAt: null,
      relationshipType: "exclusive",
      startsAt: "2026-08-28T00:00:00.000Z",
      workStatus: "on_leave",
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/merchant-admin/employees/NEEDO-S-47%2F%E4%B8%9C%E4%BA%AC/profile",
      {
        body: { city: "東京都", displayName: "斉藤 健太" },
        method: "PATCH",
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/merchant-admin/employees/NEEDO-S-47%2F%E4%B8%9C%E4%BA%AC/affiliation",
      {
        body: {
          endsAt: null,
          relationshipType: "exclusive",
          startsAt: "2026-08-28T00:00:00.000Z",
          workStatus: "on_leave",
        },
        method: "PUT",
      },
    );
  });

  it("loads a bounded employee schedule by canonical NeeDoID", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantEmployeeApi.schedule(" NEEDO-S-47/东京 ", {
      from: "2026-08-24T15:00:00.000Z",
      to: "2026-08-31T15:00:00.000Z",
      view: "week",
    });

    expect(httpClient.request).toHaveBeenCalledWith(
      "/merchant-admin/employees/NEEDO-S-47%2F%E4%B8%9C%E4%BA%AC/schedule",
      {
        query: {
          from: "2026-08-24T15:00:00.000Z",
          to: "2026-08-31T15:00:00.000Z",
          view: "week",
        },
      },
    );
  });

  it("loads semantic employee events and persists comments through scoped routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantEmployeeApi.timeline(" NEEDO-S-47/东京 ", 2, 10);
    await merchantEmployeeApi.addTimelineComment(
      " NEEDO-S-47/东京 ",
      "  已确认本月结算。  ",
    );

    const path =
      "/merchant-admin/employees/NEEDO-S-47%2F%E4%B8%9C%E4%BA%AC";
    expect(httpClient.request).toHaveBeenNthCalledWith(1, `${path}/timeline`, {
      query: { page: 2, pageSize: 10 },
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      `${path}/timeline/comments`,
      {
        body: { message: "已确认本月结算。" },
        method: "POST",
      },
    );
  });
});
