import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { customerAddressApi } from "./api";

vi.mock("../../api/httpClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/httpClient")>("../../api/httpClient");
  return { ...actual, httpClient: { request: vi.fn() } };
});

describe("customerAddressApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("uses strict authenticated customer-profile CRUD routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const input = {
      label: "自宅", countryCode: "JP" as const, postalCode: "1600022",
      admin1Code: "13", prefecture: "東京都", admin2Code: "13104",
      city: "新宿区", addressLine1: "新宿1-1-1", isDefault: true
    };

    await customerAddressApi.list({ page: 2, pageSize: 20 });
    await customerAddressApi.create(input);
    await customerAddressApi.update("00000000-0000-4000-8000-000000000001", { label: "会社" });
    await customerAddressApi.remove("00000000-0000-4000-8000-000000000001");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/customer-profile/me/addresses", { query: { page: 2, pageSize: 20 } });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/customer-profile/me/addresses", { method: "POST", body: input });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/customer-profile/me/addresses/00000000-0000-4000-8000-000000000001", { method: "PATCH", body: { label: "会社" } });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/customer-profile/me/addresses/00000000-0000-4000-8000-000000000001", { method: "DELETE" });
  });
});
