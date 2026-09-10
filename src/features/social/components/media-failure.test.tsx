/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnifiedMediaBlock } from "./UnifiedSocialUi";
import type { SocialPost } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("Social media failure and retry", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it.each(["image", "video"] as const)("retries a failed %s without opening the lightbox", async (type) => {
    const post = { media: [{ id: "media", type, url: "/media/content/a.jpg", alt: "private-upload.jpeg" }] } as SocialPost;
    await act(async () => root.render(<UnifiedMediaBlock post={post} scope="user" />));
    const media = container.querySelector("img,video")!;
    await act(async () => media.dispatchEvent(new Event("error")));
    expect(container.textContent).toContain(type === "image" ? "图片加载失败，点击重试" : "视频加载失败，点击重试");
    expect(container.textContent).not.toMatch(/已过期|private-upload/);
    expect(container.querySelector("img,video")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector("img,video")).not.toBe(media);
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    const viewer = container.querySelector('[role="dialog"]')!;
    await act(async () => viewer.querySelector("img,video")!.dispatchEvent(new Event("error")));
    expect(viewer.textContent).toContain(type === "image" ? "图片加载失败，点击重试" : "视频加载失败，点击重试");
    expect(viewer.querySelector("img,video")).toBeNull();
  });
});
