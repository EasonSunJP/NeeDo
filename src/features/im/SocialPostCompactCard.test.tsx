// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialPostCompactCard } from "./SocialPostCompactCard";

describe("SocialPostCompactCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const baseCard = {
    postId: "701",
    authorName: "新宿コンディショニング 灯 公式受付",
    authorAvatar: "/avatar.webp",
    text: "店先の季節の様子を短い動画でお届けします。",
  };

  it("renders image media as an image and opens the original post", async () => {
    const onOpen = vi.fn();
    await act(async () =>
      root.render(
        <MemoryRouter>
          <SocialPostCompactCard
            card={{
              ...baseCard,
              mediaType: "image",
              mediaUrl: "/media/content/cover.webp",
            }}
            language="zh"
            onOpen={onOpen}
          />
        </MemoryRouter>,
      ),
    );

    expect(container.querySelector("img[data-social-post-card-media]"))
      .not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).toContain("打开原动态");
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button")?.click(),
    );
    expect(onOpen).toHaveBeenCalledWith("701");
  });

  it("renders explicit and legacy video media with a video preview instead of a broken image", async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <div>
            <SocialPostCompactCard
              card={{
                ...baseCard,
                mediaThumbnailUrl: "/media/content/video-poster.webp",
                mediaType: "video",
                mediaUrl: "/media/content/clip.mp4",
              }}
              language="ja"
              to="/moments/posts/701"
            />
            <SocialPostCompactCard
              card={{
                ...baseCard,
                postId: "702",
                mediaUrl: "/media/content/legacy-video.webm?token=1",
              }}
              language="zh"
              to="/moments/posts/702"
            />
          </div>
        </MemoryRouter>,
      ),
    );

    const videos = container.querySelectorAll("video[data-social-post-card-media]");
    expect(videos).toHaveLength(2);
    expect(videos[0]?.getAttribute("poster")).toBe(
      "/media/content/video-poster.webp",
    );
    expect(videos[0]?.getAttribute("src")).toBe("/media/content/clip.mp4");
    expect(container.querySelector('img[src="/media/content/clip.mp4"]')).toBeNull();
    expect(container.querySelector('a[href="/moments/posts/701"]')).not.toBeNull();
  });
});
