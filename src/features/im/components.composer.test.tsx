/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImChatComposer } from "./components";
import type { ImChatComposerPanel } from "./components";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(() => {
  window.localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function ComposerHarness({ actionRun }: { actionRun: () => void }) {
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<ImChatComposerPanel>(null);

  return (
    <>
      <ImChatComposer
        actions={[{ icon: "photo", key: "image", label: "相册", run: actionRun }]}
        draft={draft}
        isNight
        onDraftChange={setDraft}
        onPanelChange={setPanel}
        onSend={vi.fn()}
        panel={panel}
      />
      <button aria-label="重置测试草稿" onClick={() => setDraft("")} type="button" />
    </>
  );
}

describe("ImChatComposer", () => {
  it("renders independent glass capsules and switches panels without breaking their actions", async () => {
    const actionRun = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ComposerHarness actionRun={actionRun} />);
    });

    const stack = container.querySelector<HTMLElement>("[data-im-composer-stack='true']");
    const inputShell = container.querySelector<HTMLElement>("[data-im-composer-input-shell='true']");
    expect(stack).not.toBeNull();
    expect(inputShell).not.toBeNull();
    expect(inputShell?.classList.contains("im-composer-glass")).toBe(true);
    expect(container.querySelector("[data-im-composer-panel]")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开表情面板']")?.click();
    });

    const emojiPanel = container.querySelector<HTMLElement>("[data-im-composer-panel='emoji']");
    expect(emojiPanel).not.toBeNull();
    expect(emojiPanel?.classList.contains("im-composer-glass")).toBe(true);
    expect(inputShell!.compareDocumentPosition(emojiPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      emojiPanel?.querySelector<HTMLButtonElement>("[aria-label^='输入表情 ']")?.click();
    });
    expect(container.querySelector("textarea")?.value).not.toBe("");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='重置测试草稿']")?.click();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")?.click();
    });
    expect(container.querySelector("[data-im-composer-panel='emoji']")).toBeNull();
    const morePanel = container.querySelector<HTMLElement>("[data-im-composer-panel='more']");
    expect(morePanel).not.toBeNull();

    await act(async () => {
      morePanel?.querySelector<HTMLButtonElement>("button")?.click();
    });
    expect(actionRun).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("keeps a selected image in the composer, allows text entry, and removes it explicitly", async () => {
    const onRemovePendingImage = vi.fn();
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImChatComposer
          actions={[]}
          draft="说明文字"
          isNight
          onDraftChange={vi.fn()}
          onPanelChange={vi.fn()}
          onRemovePendingImage={onRemovePendingImage}
          onSend={onSend}
          panel={null}
          pendingImage={{ fileName: "poster.png", previewUrl: "blob:poster-preview" }}
        />
      );
    });

    expect(container.querySelector('[data-im-composer-pending-image="true"] img')?.getAttribute("src")).toBe("blob:poster-preview");
    expect(container.querySelector("textarea")?.value).toBe("说明文字");
    expect(container.querySelector('[data-im-composer-control="voice-input"]')).not.toBeNull();
    expect(container.querySelector('[data-im-composer-control="emoji-chat"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='移除待发送图片 poster.png']")?.click();
    });
    expect(onRemovePendingImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "发送")?.click();
    });
    expect(onSend).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("defines bottom-navigation glass, upward panel growth, touch targets, and reduced motion", () => {
    expect(stylesSource).toContain(".client-shell .im-composer-glass");
    expect(stylesSource).toContain(".im-chat-composer-stack");
    expect(stylesSource).toContain("gap: 8px");
    expect(stylesSource).toContain(".im-composer-panel");
    expect(stylesSource).toContain("max-height: 42dvh");
    expect(stylesSource).toContain("overflow-y: auto");
    expect(stylesSource).toContain("@media (pointer: coarse)");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain("var(--client-elevated)");
    expect(stylesSource).toContain("var(--client-line)");
    expect(stylesSource).toContain(".im-conversation-scroll--glass-underlay");
    expect(stylesSource).toContain("margin-top: calc(-1 * (env(safe-area-inset-top) + 70px))");
    expect(stylesSource).toContain("margin-bottom: calc(-1 * var(--im-composer-overlay-height, 85px))");
    expect(stylesSource).toContain("padding-bottom: calc(var(--im-composer-overlay-height, 85px) + 12px)");
    expect(stylesSource).toContain("min-width: 36px");
  });
});
