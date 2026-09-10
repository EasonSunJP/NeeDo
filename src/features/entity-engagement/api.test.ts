import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import {
  createSystemShareAttempt,
  entityEngagementApi,
  toggleFavoriteOptimistically,
  type EntityFavoriteState,
} from "./api";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() },
}));

const target = { targetType: "technician" as const, publicId: "s0000000001" };
const authoritative: EntityFavoriteState = {
  ...target,
  isFavorited: false,
  favoriteCount: 7,
};

describe("entity engagement API", () => {
  beforeEach(() => {
    vi.mocked(httpClient.request).mockReset();
  });

  it("loads favorite status for a whole card page in one bounded batch", async () => {
    const targets = [
      target,
      { targetType: "shop" as const, publicId: "shop0000000002" },
    ];
    vi.mocked(httpClient.request).mockResolvedValue({ list: [] });

    await entityEngagementApi.getFavoriteStatuses(targets);

    expect(httpClient.request).toHaveBeenCalledTimes(1);
    expect(httpClient.request).toHaveBeenCalledWith(
      "/me/entity-favorites/statuses",
      {
        method: "POST",
        body: { targets },
      },
    );
  });

  it("rolls an optimistic favorite failure back to the previous authoritative state", async () => {
    const states: EntityFavoriteState[] = [];
    vi.mocked(httpClient.request).mockRejectedValue(new Error("error.network"));

    await expect(
      toggleFavoriteOptimistically({
        authoritative,
        nextIsFavorited: true,
        onState: (state) => states.push(state),
      }),
    ).rejects.toThrow("error.network");

    expect(states).toEqual([
      { ...authoritative, isFavorited: true, favoriteCount: 8 },
      authoritative,
    ]);
  });

  it("reports system share only after capability success and reuses one retry key", async () => {
    const invokeCapability = vi.fn(async () => true);
    vi.mocked(httpClient.request)
      .mockRejectedValueOnce(new Error("error.network"))
      .mockResolvedValueOnce({
        ...target,
        eventId: 9,
        messageId: null,
        shareCount: 12,
        replayed: false,
      });
    const attempt = createSystemShareAttempt({
      target,
      invokeCapability,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    await expect(attempt.execute()).rejects.toThrow("error.network");
    await expect(attempt.execute()).resolves.toMatchObject({ shareCount: 12 });

    expect(invokeCapability).toHaveBeenCalledTimes(1);
    expect(httpClient.request).toHaveBeenCalledTimes(2);
    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/entities/technician/s0000000001/shares/system",
      {
        method: "POST",
        body: { idempotencyKey: "11111111-1111-4111-8111-111111111111" },
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/entities/technician/s0000000001/shares/system",
      expect.objectContaining({
        body: { idempotencyKey: "11111111-1111-4111-8111-111111111111" },
      }),
    );
  });

  it("does not report a cancelled or failed platform share", async () => {
    const attempt = createSystemShareAttempt({
      target,
      invokeCapability: async () => false,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });

    await expect(attempt.execute()).resolves.toBeNull();
    expect(httpClient.request).not.toHaveBeenCalled();
  });
});
