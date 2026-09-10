/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMessage } from "./model";
import {
  OpenedImMediaViewer,
  type OpenedImMediaViewerCache,
} from "./OpenedImMediaViewer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseMessage: ConversationMessage = {
  id: "9",
  localId: "9",
  conversationId: "2",
  senderId: "7",
  type: "image",
  content: "",
  status: "sent",
  sentAt: "2026-09-05T00:00:00.000Z",
  clientSeq: 9,
  serverState: "active",
  ext: { mediaState: "available", url: "/media/im/original.jpg" },
};

describe("explicitly opened IM media viewer", () => {
  let container: HTMLDivElement;
  let root: Root;
  const cache = () => ({
    cacheOpenedMedia: vi.fn<OpenedImMediaViewerCache["cacheOpenedMedia"]>(async () => ({
      blob: new Blob(["first-open"], { type: "image/jpeg" }),
      cacheState: "stored" as const,
      state: "ready" as const,
    })),
    getCachedMediaObjectUrl: vi.fn<OpenedImMediaViewerCache["getCachedMediaObjectUrl"]>(async () => undefined),
    releaseCachedMediaObjectUrl: vi.fn<OpenedImMediaViewerCache["releaseCachedMediaObjectUrl"]>(),
  } satisfies OpenedImMediaViewerCache);

  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:first-open");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("stores the original bytes only after the full-screen viewer is opened and renders the no-store Blob", async () => {
    const mediaCache = cache();
    const onResolvedSourceChange = vi.fn();
    await act(async () => {
      root.render(<OpenedImMediaViewer
        cache={mediaCache}
        message={baseMessage}
        onResolvedSourceChange={onResolvedSourceChange}
      />);
    });

    expect(mediaCache.getCachedMediaObjectUrl).toHaveBeenCalledWith("2", "9");
    expect(mediaCache.cacheOpenedMedia).toHaveBeenCalledWith(
      baseMessage,
      "/media/im/original.jpg?needo_media_policy=2",
    );
    expect(container.querySelector("img")?.getAttribute("src"))
      .toBe("blob:first-open");
    expect(onResolvedSourceChange).toHaveBeenCalledWith("blob:first-open");
  });

  it("opens an encrypted local copy after server expiry", async () => {
    const mediaCache = cache();
    mediaCache.getCachedMediaObjectUrl.mockResolvedValue("blob:decrypted-copy");
    const expired = {
      ...baseMessage,
      ext: { ...baseMessage.ext, mediaState: "expired" as const },
    };

    await act(async () => {
      root.render(<OpenedImMediaViewer cache={mediaCache} message={expired} />);
    });

    expect(container.querySelector("img")?.getAttribute("src"))
      .toBe("blob:decrypted-copy");
    expect(container.textContent).not.toContain("图片已过期");
    expect(mediaCache.cacheOpenedMedia).not.toHaveBeenCalled();
  });

  it("shows the explicit expired state when no local copy exists", async () => {
    const mediaCache = cache();
    const expired = {
      ...baseMessage,
      ext: { ...baseMessage.ext, mediaState: "expired" as const },
    };

    await act(async () => {
      root.render(<OpenedImMediaViewer cache={mediaCache} message={expired} />);
    });

    expect(container.textContent).toContain("图片已过期");
    expect(container.querySelector("img, video")).toBeNull();
    expect(mediaCache.cacheOpenedMedia).not.toHaveBeenCalled();
  });

  it("releases decrypted object URLs when the viewer closes", async () => {
    const mediaCache = cache();
    mediaCache.getCachedMediaObjectUrl.mockResolvedValue("blob:decrypted-copy");
    await act(async () => {
      root.render(<OpenedImMediaViewer cache={mediaCache} message={baseMessage} />);
    });
    await act(async () => root.unmount());

    expect(mediaCache.releaseCachedMediaObjectUrl).toHaveBeenCalledWith("2", "9");
  });

  it("keeps the fetched image visible while explaining that durable local caching failed", async () => {
    const mediaCache = cache();
    mediaCache.cacheOpenedMedia.mockResolvedValue({
      blob: new Blob(["first-open"], { type: "image/jpeg" }),
      cacheState: "unavailable",
      state: "ready",
    });

    await act(async () => {
      root.render(<OpenedImMediaViewer cache={mediaCache} message={baseMessage} />);
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:first-open");
    expect(container.textContent).toContain("本地缓存不可用");
  });

  it("versions a formal video poster so an old immutable HTTP cache cannot mask replacement", async () => {
    const mediaCache = cache();
    const videoMessage: ConversationMessage = {
      ...baseMessage,
      type: "video",
      ext: { mediaState: "available", url: "/media/im/original.mp4" },
    };
    mediaCache.cacheOpenedMedia.mockResolvedValue({
      blob: new Blob(["video"], { type: "video/mp4" }),
      cacheState: "stored",
      state: "ready",
    });

    await act(async () => {
      root.render(<OpenedImMediaViewer
        cache={mediaCache}
        message={videoMessage}
        poster="http://localhost:3000/media/im/poster.jpg"
      />);
    });

    expect(container.querySelector("video")?.getAttribute("poster"))
      .toBe("http://localhost:3000/media/im/poster.jpg?needo_media_policy=2");
  });
});
