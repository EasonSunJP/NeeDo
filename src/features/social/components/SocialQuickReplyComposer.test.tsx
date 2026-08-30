/** @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("uses the shared chat shell with an avatar, emoji control, and unclaimed plus control", async () => {
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
    expect(source).not.toContain(["onOpen", "FullComposer"].join(""));
    expect(source).not.toContain("moreAction=");

    await act(async () => root.unmount());
  });

  it("inserts emoji and submits one materialized trimmed reply", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "reply-1" });
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
      container.querySelector<HTMLButtonElement>('[data-im-reaction-value="Thanks"]')?.click();
    });
    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Thanks");
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
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onSubmit={onSubmit}
          targetIdentity="actor-mia:post-1"
        />
      );
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

    expect(onSubmit).toHaveBeenCalledWith("保留的草稿");
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("保留的草稿");
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
    expect(firstSubmit).toHaveBeenCalledWith("第一条回复");

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
    await act(async () => root.unmount());
  });
});
