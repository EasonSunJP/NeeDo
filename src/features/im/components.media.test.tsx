/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./components";
import type { ConversationMessage } from "./model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("IM media delivery failures", () => {
  let container: HTMLDivElement;
  let root: Root;
  const message = (type: ConversationMessage["type"]): ConversationMessage => ({
    id: "media-1", localId: "media-1", conversationId: "conversation-1", senderId: "sender-1",
    type, content: "/media/im/a.jpg", status: "sent", sentAt: "2020-01-01T00:00:00Z", clientSeq: 1,
    ext: { fileName: "private-name.jpeg", duration: 15 }
  });
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it.each(["image", "video"] as const)("shows retry rather than expiry or a filename for failed %s", async (type) => {
    const open = vi.fn();
    await act(async () => root.render(<MessageBubble isMine={false} message={message(type)} onPreviewMedia={open} />));
    const image = container.querySelector('[data-im-message-bubble] img')!;
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(container.textContent).toContain(type === "image" ? "图片加载失败，点击重试" : "视频加载失败，点击重试");
    expect(container.textContent).not.toMatch(/已过期|private-name/);
    expect(container.querySelector('[data-im-message-bubble] img')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="查看本地副本"]')!.click());
    expect(open).toHaveBeenCalledOnce();
    const retry = [...container.querySelectorAll("button")].find((node) => node.textContent?.includes("重试"))!;
    await act(async () => retry.click());
    const reloaded = container.querySelector('[data-im-message-bubble] img')!;
    expect(reloaded).not.toBe(image);
    expect(reloaded.getAttribute("src")).toBe("/media/im/a.jpg?needo_media_policy=2");
    expect(open).toHaveBeenCalledOnce();
    await act(async () => reloaded.dispatchEvent(new Event("load")));
    await act(async () => reloaded.closest("button")!.click());
    expect(open).toHaveBeenCalledTimes(2);
  });

  it.each(["image", "video"] as const)("does not request an explicitly expired %s", async (type) => {
    const expired = message(type);
    const open = vi.fn();
    expired.ext = { ...expired.ext, mediaState: "expired" };
    await act(async () => root.render(<MessageBubble isMine={false} message={expired} onPreviewMedia={open} />));
    expect(container.textContent).toContain(type === "image" ? "图片已过期" : "视频已过期");
    expect(container.querySelector('[data-im-message-bubble] img, [data-im-message-bubble] video')).toBeNull();
    expect(container.textContent).not.toContain("重试");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="查看本地副本"]')!.click());
    expect(open).toHaveBeenCalledWith(expired);
  });

  it("keeps the server voice duration and removes the failed audio player", async () => {
    await act(async () => root.render(<MessageBubble isMine={false} message={message("voice")} />));
    const audio = container.querySelector("audio")!;
    expect(audio.preload).toBe("metadata");
    await act(async () => audio.dispatchEvent(new Event("error")));
    expect(container.textContent).toContain('15"');
    expect(container.textContent).toContain("语音加载失败，点击重试");
    expect(container.querySelector("audio")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(container.querySelector("audio")).not.toBeNull();
  });

  it("gives only voice messages the wider responsive player layout", async () => {
    await act(async () => root.render(<MessageBubble isMine={false} message={message("voice")} />));

    const voiceBubble = container.querySelector<HTMLElement>("[data-im-message-bubble='true']")!;
    const voiceColumn = voiceBubble.parentElement!;
    const audio = voiceBubble.querySelector<HTMLAudioElement>("audio")!;

    expect(voiceColumn.className).toContain("w-[calc(100%-3.25rem)]");
    expect(voiceColumn.className).toContain("max-w-[320px]");
    expect(voiceBubble.className.split(/\s+/)).toContain("w-full");
    expect(audio.className.split(/\s+/)).toContain("w-full");
    expect(audio.className.split(/\s+/)).not.toContain("max-w-[220px]");

    await act(async () => root.render(
      <MessageBubble
        isMine={false}
        message={{ ...message("voice"), type: "text", content: "ordinary" }}
      />,
    ));

    const textBubble = container.querySelector<HTMLElement>("[data-im-message-bubble='true']")!;
    expect(textBubble.parentElement?.className).toContain("max-w-[78%]");
    expect(textBubble.parentElement?.className).not.toContain("max-w-[320px]");
    expect(textBubble.className.split(/\s+/)).not.toContain("w-full");
  });

  it("keeps a reacted voice player's content wrapper at the full bubble width", async () => {
    await act(async () => root.render(
      <MessageBubble
        isMine={false}
        message={message("voice")}
        reactions={[{
          emoji: "Good",
          people: [{ id: "admin-1", name: "LifeDance 管理员" }],
        }]}
      />,
    ));

    const voiceBubble = container.querySelector<HTMLElement>("[data-im-message-bubble='true']")!;
    const contentWrapper = voiceBubble.firstElementChild as HTMLElement;

    expect(contentWrapper.className.split(/\s+/)).toContain("w-full");
    expect(contentWrapper.querySelector("audio")).not.toBeNull();
    expect(contentWrapper.textContent).toContain("LifeDance 管理员");
  });

  it("clears a previous failure when the message source changes", async () => {
    await act(async () => root.render(<MessageBubble isMine={false} message={message("image")} />));
    await act(async () => container.querySelector('[data-im-message-bubble] img')!.dispatchEvent(new Event("error")));
    await act(async () => root.render(<MessageBubble isMine={false} message={{ ...message("image"), content: "/media/im/b.jpg" }} />));
    expect(container.querySelector('[data-im-message-bubble] img')?.getAttribute("src")).toBe("/media/im/b.jpg?needo_media_policy=2");
    expect(container.textContent).not.toContain("重试");
  });
});
