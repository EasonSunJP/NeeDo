import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { loadCoreReadWithTransientRetry } from "./transientRetry";

describe("loadCoreReadWithTransientRetry", () => {
  it("recovers when a single timeout is followed by a successful formal read", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
      .mockResolvedValueOnce({ shops: [1] });

    await expect(loadCoreReadWithTransientRetry(load, { retryDelayMs: 0 })).resolves.toEqual({ shops: [1] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient API rejection", async () => {
    const error = new ApiClientError("error.request.invalid", 40001, 400);
    const load = vi.fn().mockRejectedValue(error);

    await expect(loadCoreReadWithTransientRetry(load, { retryDelayMs: 0 })).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("stops after the bounded retry when the timeout persists", async () => {
    const error = new ApiClientError("error.network.timeout", 408, 408);
    const load = vi.fn().mockRejectedValue(error);

    await expect(loadCoreReadWithTransientRetry(load, { retryDelayMs: 0 })).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
