/** @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { realtimeApi } from "../../realtime/api";
import type { SocialPost } from "../types";
import source from "./SocialQuickReplyComposer.tsx?raw";
import { SocialQuickReplyComposer } from "./SocialQuickReplyComposer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("SocialQuickReplyComposer", () => {
  it("exposes a focus handle that places the caret at the end of the rich reply draft", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const ref = createRef<{ focus: () => void }>();

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onSubmit={vi.fn()}
          ref={ref}
          targetIdentity="actor-mia:post-1"
        />
      );
    });

    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    await act(async () => {
      editor.textContent = "继续回复";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => ref.current?.focus());

    expect(ref.current).not.toBeNull();
    expect(document.activeElement).toBe(editor);
    expect(window.getSelection()?.anchorOffset).toBe(editor.childNodes.length);
    await act(async () => root.unmount());
  });

  it("uses the shared chat shell with an avatar, emoji control, and exactly three Social actions", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onSubmit={vi.fn()}
          targetIdentity="actor-mia:post-1"
        />
      );
    });

    expect(container.querySelector("[data-im-composer-root='true']")).not.toBeNull();
    expect(container.querySelector("[data-im-composer-input-shell='true']")?.classList.contains("im-composer-glass")).toBe(true);
    expect(container.querySelector("[data-social-quick-reply-avatar='true'] img")?.getAttribute("alt")).toBe("Mia");
    expect(container.querySelector("[data-im-composer-control='voice-input']")).toBeNull();
    expect(container.querySelector("[data-im-composer-control='emoji-chat']")).not.toBeNull();

    expect(container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")).not.toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")?.click();
    });
    expect(
      [...container.querySelectorAll('[data-im-composer-panel="more"] button')].map((button) => button.textContent)
    ).toEqual(["相册", "拍照", "位置"]);
    expect(source).not.toContain(["onOpen", "FullComposer"].join(""));
    expect(source).not.toContain("moreAction=");

    await act(async () => root.unmount());
  });

  it("submits a judgement sticker with one formally uploaded image", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "reply-1" });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(realtimeApi, "uploadSocialMedia").mockResolvedValue({
      publicId: "a".repeat(64),
      fileSize: 3,
      mimeType: "image/png",
      url: "/media/content/a"
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onSubmit={onSubmit}
          targetIdentity="actor-mia:post-1"
        />
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开表情面板']")?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-im-reaction-value="Pending"]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开表情面板']")?.click();
      container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")?.click();
    });
    const albumInput = container.querySelector<HTMLInputElement>('input[aria-label="相册"]')!;
    const file = new File(["png"], "reply.png", { type: "image/png" });
    Object.defineProperty(albumInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      albumInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "回复")?.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      text: "Pending",
      richText: { version: 1, parts: [{ type: "judgement", value: "Pending" }] },
      media: [expect.objectContaining({ mediaAssetPublicId: "a".repeat(64) })],
      locationLabel: undefined
    });
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("");
    await act(async () => root.unmount());
  });

  it("keeps the typed draft and announces a failure when reply submission is rejected", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("unexpected"));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia", location: "东京 / 新宿区 / 新宿" }}
          canComment
          onSubmit={onSubmit}
          targetIdentity="actor-mia:post-1"
        />
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="打开更多功能"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "位置")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "东京 / 新宿区 / 新宿")?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "确定并返回")?.click();
    });
    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]');
    await act(async () => {
      editor!.textContent = "保留的草稿";
      editor!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "回复")?.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      text: "保留的草稿",
      richText: undefined,
      media: [],
      locationLabel: "东京 / 新宿区 / 新宿"
    });
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("保留的草稿");
    expect(container.textContent).toContain("东京 / 新宿区 / 新宿");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("发布失败，请重试。");
    await act(async () => root.unmount());
  });

  it("isolates draft and sending state when the actor-post target changes during a delayed reply", async () => {
    let resolveFirstReply!: (value: SocialPost) => void;
    const firstReply = new Promise<SocialPost>((resolve) => {
      resolveFirstReply = resolve;
    });
    const firstSubmit = vi.fn(() => firstReply);
    const secondSubmit = vi.fn().mockResolvedValue({ id: "reply-2" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onSubmit={firstSubmit}
          targetIdentity="actor-mia:post-1"
        />
      );
    });

    let editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    await act(async () => {
      editor.textContent = "第一条回复";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "回复")?.click();
    });
    expect(firstSubmit).toHaveBeenCalledWith({
      text: "第一条回复",
      richText: undefined,
      media: [],
      locationLabel: undefined
    });

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/ren.jpg", displayName: "Ren" }}
          canComment
          onSubmit={secondSubmit}
          targetIdentity="actor-ren:post-2"
        />
      );
    });

    editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    expect(editor.textContent).toBe("");
    expect(container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")?.disabled).toBe(false);

    await act(async () => {
      editor.textContent = "第二条草稿";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(editor.textContent).toBe("第二条草稿");

    await act(async () => {
      resolveFirstReply({ id: "reply-1" } as SocialPost);
      await firstReply;
    });

    expect(container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')?.textContent).toBe("第二条草稿");
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "回复")?.disabled).toBe(false);
    await act(async () => root.unmount());
  });

  it("keeps restricted comments visible and natively disabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment={false}
          onSubmit={vi.fn()}
          targetIdentity="actor-mia:post-1"
        />
      );
    });

    expect(container.querySelector("[data-im-composer-disabled='true']")).not.toBeNull();
    expect(container.querySelector("[aria-placeholder='仅好友可以评论']")).not.toBeNull();
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
    expect(container.querySelector<HTMLElement>('[role="textbox"]')?.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="打开表情面板"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="打开更多功能"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="拍照"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="拍照"]')?.getAttribute("capture")).toBe("environment");
    await act(async () => root.unmount());
  });

  it("retains a failed image for retry and allows removing it", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload = vi.spyOn(realtimeApi, "uploadSocialMedia")
      .mockRejectedValueOnce(new Error("error.social.media_upload_unavailable"))
      .mockResolvedValueOnce({
        publicId: "b".repeat(64),
        fileSize: 3,
        mimeType: "image/jpeg",
        url: "/media/content/b"
      });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SocialQuickReplyComposer canComment onSubmit={vi.fn()} targetIdentity="actor-mia:post-1" />);
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="相册"]')!;
    const file = new File(["jpg"], "retry.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("上传失败");
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "重试图片")!;
    expect(retry.disabled).toBe(false);
    await act(async () => {
      retry.click();
      await Promise.resolve();
    });
    expect(upload).toHaveBeenCalledTimes(2);

    const remove = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "移除图片")!;
    await act(async () => remove.click());
    expect(container.querySelector('[data-im-composer-pending-image="true"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-preview");
    await act(async () => root.unmount());
  });

  it("disables send while an image upload is pending and allows an image-only reply after upload", async () => {
    let resolveUpload!: (value: Awaited<ReturnType<typeof realtimeApi.uploadSocialMedia>>) => void;
    const upload = new Promise<Awaited<ReturnType<typeof realtimeApi.uploadSocialMedia>>>((resolve) => {
      resolveUpload = resolve;
    });
    vi.spyOn(realtimeApi, "uploadSocialMedia").mockReturnValue(upload);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-only");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onSubmit = vi.fn().mockResolvedValue({ id: "reply-image" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SocialQuickReplyComposer canComment onSubmit={onSubmit} targetIdentity="actor-mia:post-1" />);
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="相册"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "image-only.png", { type: "image/png" })]
    });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));

    const pendingSend = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "图片上传中"
    )!;
    expect(pendingSend.disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpload({
        publicId: "d".repeat(64),
        fileSize: 3,
        mimeType: "image/png",
        url: "/media/content/d"
      });
      await upload;
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:image-only");
    const send = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "回复")!;
    expect(send.disabled).toBe(false);
    await act(async () => {
      send.click();
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledWith({
      text: "",
      richText: undefined,
      media: [expect.objectContaining({ mediaAssetPublicId: "d".repeat(64) })],
      locationLabel: undefined
    });
    await act(async () => root.unmount());
  });

  it("selects and removes a location without losing the reply draft", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia", location: "东京 / 新宿区 / 新宿" }}
          canComment
          onSubmit={vi.fn()}
          targetIdentity="actor-mia:post-1"
        />
      );
    });
    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    await act(async () => {
      editor.textContent = "保留正文";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLButtonElement>('[aria-label="打开更多功能"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "位置")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "东京 / 新宿区 / 新宿")?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "确定并返回")?.click();
    });
    expect(container.textContent).toContain("东京 / 新宿区 / 新宿");
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("保留正文");
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "移除位置")?.click();
    });
    expect(container.textContent).not.toContain("东京 / 新宿区 / 新宿");
    await act(async () => root.unmount());
  });

  it("clears text, failed preview, and location on actor and post changes and ignores a stale upload", async () => {
    let resolveUpload!: (value: Awaited<ReturnType<typeof realtimeApi.uploadSocialMedia>>) => void;
    const upload = new Promise<Awaited<ReturnType<typeof realtimeApi.uploadSocialMedia>>>((resolve) => {
      resolveUpload = resolve;
    });
    vi.spyOn(realtimeApi, "uploadSocialMedia")
      .mockRejectedValueOnce(new Error("error.social.media_upload_unavailable"))
      .mockReturnValueOnce(upload);
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:failed-preview")
      .mockReturnValueOnce("blob:stale-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const renderTarget = async (targetIdentity: string, displayName: string) => {
      await act(async () => {
        root.render(
          <SocialQuickReplyComposer
            actor={{ avatar: `/${displayName}.jpg`, displayName, location: "东京 / 新宿区 / 新宿" }}
            canComment
            onSubmit={vi.fn()}
            targetIdentity={targetIdentity}
          />
        );
      });
    };

    await renderTarget("actor-mia:post-1", "Mia");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="打开更多功能"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "位置")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "东京 / 新宿区 / 新宿")?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "确定并返回")?.click();
    });
    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    await act(async () => {
      editor.textContent = "旧草稿";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let input = container.querySelector<HTMLInputElement>('input[aria-label="相册"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["png"], "failed.png", { type: "image/png" })] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("旧草稿");
    expect(container.querySelector('img[src="blob:failed-preview"]')).not.toBeNull();
    expect(container.textContent).toContain("上传失败");
    expect(container.textContent).toContain("东京 / 新宿区 / 新宿");

    await renderTarget("actor-ren:post-1", "Ren");
    expect(container.textContent).not.toContain("旧草稿");
    expect(container.querySelector('img[src="blob:failed-preview"]')).toBeNull();
    expect(container.textContent).not.toContain("上传失败");
    expect(container.textContent).not.toContain("东京 / 新宿区 / 新宿");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="打开更多功能"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "位置")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "东京 / 新宿区 / 新宿")?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "确定并返回")?.click();
    });
    const nextEditor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    await act(async () => {
      nextEditor.textContent = "第二条旧草稿";
      nextEditor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input = container.querySelector<HTMLInputElement>('input[aria-label="相册"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["png"], "stale.png", { type: "image/png" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await renderTarget("actor-ren:post-2", "Ren");
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("");
    expect(container.querySelector('img[src="blob:stale-preview"]')).toBeNull();
    expect(container.textContent).not.toContain("东京 / 新宿区 / 新宿");
    await act(async () => {
      resolveUpload({ publicId: "c".repeat(64), fileSize: 3, mimeType: "image/png", url: "/media/content/c" });
      await upload;
    });
    expect(container.querySelector('img[src="/media/content/c"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-preview");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:stale-preview");
    await act(async () => root.unmount());
  });
});
