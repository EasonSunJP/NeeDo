import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { schedulingApi } from "./api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("schedulingApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses identity-scoped merchant and technician slot paths", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    const from = new Date("2026-08-26T00:00:00.000Z");
    const to = new Date("2026-08-27T00:00:00.000Z");

    await schedulingApi.listSlots("merchant-admin", { from, to, page: 1, pageSize: 20 });
    await schedulingApi.listSlots("technician", { from, to });

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/schedule/slots", { query: expect.objectContaining({ from: from.toISOString(), to: to.toISOString() }) });
    expect(httpClient.request).toHaveBeenCalledWith("/technician/schedule/slots", { query: expect.objectContaining({ from: from.toISOString(), to: to.toISOString() }) });
  });

  it("preloads account-linked schedules without client-supplied identity scopes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const from = new Date("2026-09-13T00:00:00.000Z");
    const to = new Date("2026-09-27T00:00:00.000Z");

    await schedulingApi.preload({ from, to, page: 1, pageSize: 100 });

    expect(httpClient.request).toHaveBeenCalledWith("/schedule/preload", {
      query: { from: from.toISOString(), to: to.toISOString(), page: 1, pageSize: 100 }
    });
  });

  it("writes shop and technician services without accepting a shop scope parameter", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const startsAt = new Date("2026-08-26T01:00:00.000Z");
    const endsAt = new Date("2026-08-26T02:00:00.000Z");

    await schedulingApi.createSlot("merchant-admin", { serviceId: 20, technicianProfileId: 31, startsAt, endsAt, capacity: 1 });
    await schedulingApi.createSlot("technician", { technicianServiceId: 41, startsAt, endsAt, capacity: 1 });
    await schedulingApi.updateSlot("technician", 10, { status: "blocked" });
    await schedulingApi.deleteSlot("merchant-admin", 10);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/schedule/slots", { body: expect.objectContaining({ serviceId: 20, startsAt: startsAt.toISOString() }), method: "POST" });
    expect(httpClient.request).toHaveBeenCalledWith("/technician/schedule/slots", { body: expect.objectContaining({ technicianServiceId: 41, endsAt: endsAt.toISOString() }), method: "POST" });
    expect(httpClient.request).toHaveBeenCalledWith("/technician/schedule/slots/10", { body: { status: "blocked" }, method: "PATCH" });
    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/schedule/slots/10", { method: "DELETE" });
  });

  it("loads one technician-owned schedule slot", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await schedulingApi.getTechnicianSlot(17);

    expect(httpClient.request).toHaveBeenCalledWith("/technician/schedule/slots/17");
  });
});
