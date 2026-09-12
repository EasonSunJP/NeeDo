import { describe, expect, it, vi } from "vitest";
import {
  classifyImMediaDeliveryFailure,
  resolveImNoStoreMediaSource,
} from "./media-source";

describe("IM media no-store delivery source", () => {
  it("versions formal relative and absolute IM media URLs without touching other media", () => {
    expect(resolveImNoStoreMediaSource("/media/im/a.jpg"))
      .toBe("/media/im/a.jpg?needo_media_policy=2");
    expect(resolveImNoStoreMediaSource("http://localhost:3000/media/im/a.jpg?x=1"))
      .toBe("http://localhost:3000/media/im/a.jpg?x=1&needo_media_policy=2");
    expect(resolveImNoStoreMediaSource("/media/content/a.jpg"))
      .toBe("/media/content/a.jpg");
  });

  it("does not duplicate the policy version", () => {
    expect(resolveImNoStoreMediaSource("/media/im/a.jpg?needo_media_policy=2"))
      .toBe("/media/im/a.jpg?needo_media_policy=2");
  });

  it("classifies an immutable missing IM object as unavailable without retrying forever", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 404 }) as Response);

    await expect(classifyImMediaDeliveryFailure(
      "http://localhost:3000/media/im/a.jpg",
      "http://127.0.0.1:5184",
      fetcher,
    )).resolves.toBe("unavailable");
    expect(fetcher).toHaveBeenCalledWith("/media/im/a.jpg", {
      cache: "no-store",
      credentials: "same-origin",
      method: "HEAD",
    });
  });

  it("keeps transport and server failures retryable", async () => {
    const unavailable = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    await expect(classifyImMediaDeliveryFailure(
      "/media/im/a.webm",
      "http://127.0.0.1:5184",
      unavailable,
    )).resolves.toBe("retryable");

    const reachable = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    await expect(classifyImMediaDeliveryFailure(
      "/media/im/a.webm",
      "http://127.0.0.1:5184",
      reachable,
    )).resolves.toBe("retryable");

    const networkFailure = vi.fn(async () => { throw new TypeError("network"); });
    await expect(classifyImMediaDeliveryFailure(
      "/media/im/a.webm",
      "http://127.0.0.1:5184",
      networkFailure,
    )).resolves.toBe("retryable");
  });
});
