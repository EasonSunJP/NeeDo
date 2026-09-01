import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { technicianDataCenterApi } from "./technicianDataCenterApi";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("technicianDataCenterApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("loads the authenticated technician data center for the selected formal period", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await technicianDataCenterApi.getMine("last30days");

    expect(httpClient.request).toHaveBeenCalledWith("/technician/data-center", {
      query: { period: "last30days" }
    });
  });
});
