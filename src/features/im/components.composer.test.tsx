/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, I18nRuntime } from "../../i18n/I18nProvider";
import { ImChatComposer, ImReturnToLatestButton } from "./components";
import type { ImChatComposerPanel } from "./components";
import { getRecentImReactionSnapshot } from "./reaction-catalog";
import { encodeImComposerJudgement } from "./reaction-policy";

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

function RuntimeComposerHarness({ onSend }: { onSend: (draft: string) => void }) {
  const [draft, setDraft] = useState("");

  return (
    <ImChatComposer
      draft={draft}
      isNight
      onDraftChange={setDraft}
      onPanelChange={vi.fn()}
      onSend={() => onSend(draft)}
      panel={null}
      submitOnEnter
    />
  );
}

async function waitForRuntimeTranslation() {
  await new Promise<void>((resolveFrame) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolveFrame()));
  });
}

describe("ImChatComposer", () => {
  it("keeps the authoritative composer draft raw while localizing its placeholder", async () => {
    window.localStorage.setItem("needo.language", "ja");
    window.localStorage.setItem("needo.language.mode", "manual");
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let actualVisualPlaceholder: string | null | undefined;
    let actualAriaPlaceholder: string | null | undefined;
    let actualDraftAfterRuntime: string | null | undefined;

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <I18nProvider>
              <I18nRuntime>
                <RuntimeComposerHarness onSend={onSend} />
              </I18nRuntime>
            </I18nProvider>
          </MemoryRouter>
        );
      });
      await act(waitForRuntimeTranslation);

      const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
      actualVisualPlaceholder = editor.parentElement?.querySelector("span")?.textContent;
      actualAriaPlaceholder = editor.getAttribute("aria-placeholder");

      await act(async () => {
        editor.textContent = "测试测试";
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      });
      await act(waitForRuntimeTranslation);
      actualDraftAfterRuntime = editor.textContent;

      await act(async () => {
        editor.append(document.createTextNode("!"));
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      });
      await act(async () => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      });
    } finally {
      await act(async () => root.unmount());
    }

    expect.soft(actualDraftAfterRuntime).toBe("测试测试");
    expect.soft(onSend).toHaveBeenCalledWith("测试测试!");
    expect.soft(actualVisualPlaceholder).toBe("メッセージを送信");
    expect.soft(actualAriaPlaceholder).toBe("メッセージを送信");
  });

  it("keeps selected judgement replies as SVG inside the composer while ordinary emoji stay Unicode", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ComposerHarness actionRun={vi.fn()} />);
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开表情面板']")?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-im-reaction-value="Thanks"]')?.click();
    });

    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]');
    expect(editor).not.toBeNull();
    expect(editor!.querySelector('img[alt="Thanks"]')).not.toBeNull();
    expect(editor!.textContent).not.toContain("Thanks");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("[data-im-reaction-value]")]
        .find((button) => button.dataset.imReactionValue === "😂")
        ?.click();
    });
    expect(editor!.querySelector('img[alt="Thanks"]')).not.toBeNull();
    expect(editor!.textContent).toContain("😂");

    await act(async () => root.unmount());
  });

  it("uses the shared three-section catalog and inserts judgement tokens or Unicode", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onDraftChange = vi.fn();

    await act(async () => {
      root.render(
        <ImChatComposer
          draft="existing"
          isNight
          onDraftChange={onDraftChange}
          onPanelChange={vi.fn()}
          onSend={vi.fn()}
          panel="emoji"
        />
      );
    });

    expect(
      [...container.querySelectorAll("[data-im-reaction-heading]")].map((heading) => heading.textContent?.trim())
    ).toEqual(["常用表情", "判断表情", "一般表情"]);
    expect(container.querySelectorAll('[data-im-reaction-section="judgement"] img')).toHaveLength(8);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-im-reaction-value="Thanks"]')?.click();
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(`existing${encodeImComposerJudgement("Thanks")}`);
    expect(getRecentImReactionSnapshot()[0]).toBe("Thanks");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("[data-im-reaction-value]")]
        .find((button) => button.dataset.imReactionValue === "😂")
        ?.click();
    });
    expect(onDraftChange).toHaveBeenLastCalledWith("existing😂");
    expect(getRecentImReactionSnapshot()[0]).toBe("😂");

    await act(async () => root.unmount());
  });

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
      emojiPanel?.querySelector<HTMLButtonElement>("[data-im-reaction-value]")?.click();
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

  it("centers single-line composer controls while keeping bottom alignment for expanding drafts", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ComposerHarness actionRun={vi.fn()} />);
    });

    const inputShell = container.querySelector<HTMLElement>("[data-im-composer-input-shell='true']");
    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]');
    const controls = [
      container.querySelector<HTMLButtonElement>("[data-im-composer-control='voice-input']"),
      container.querySelector<HTMLButtonElement>("[data-im-composer-control='emoji-chat']"),
      container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")
    ];

    expect(inputShell?.classList.contains("items-end")).toBe(true);
    expect(editor?.parentElement?.parentElement?.classList.contains("min-h-[40px]")).toBe(true);
    expect(editor?.classList.contains("block")).toBe(true);
    for (const control of controls) {
      expect(control).not.toBeNull();
      expect(control?.classList.contains("h-10")).toBe(true);
      expect(control?.classList.contains("w-10")).toBe(true);
    }

    await act(async () => root.unmount());
  });

  it("renders the fixed Social-FAB-style down arrow only when requested", async () => {
    const onActivate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ImReturnToLatestButton onActivate={onActivate} visible />);
    });

    const button = container.querySelector<HTMLButtonElement>("[aria-label='回到最新消息']");
    expect(button).not.toBeNull();
    expect(button?.className).toContain("client-floating-action-button");
    expect(button?.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+104px)]");
    expect(button?.querySelector("[data-im-return-arrow='true']")).not.toBeNull();

    await act(async () => {
      button?.click();
    });
    expect(onActivate).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(<ImReturnToLatestButton onActivate={onActivate} visible={false} />);
    });
    expect(container.querySelector("[aria-label='回到最新消息']")).toBeNull();

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
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("说明文字");
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

  it("replaces the voice control with a custom leading accessory and runs a direct plus action", async () => {
    const onOpenMore = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImChatComposer
          draft=""
          isNight
          leadingAccessory={<img alt="当前账号" src="/avatar.jpg" />}
          moreAction={{ ariaLabel: "打开完整回复", run: onOpenMore }}
          onDraftChange={vi.fn()}
          onPanelChange={vi.fn()}
          onSend={vi.fn()}
          panel={null}
          sendLabel="回复"
          sendingLabel="回复中"
        />
      );
    });

    expect(container.querySelector("[data-im-composer-leading-accessory='true'] img")?.getAttribute("alt")).toBe("当前账号");
    expect(container.querySelector("[data-im-composer-control='voice-input']")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开完整回复']")?.click();
    });

    expect(onOpenMore).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("uses custom send copy without changing the default chat copy", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImChatComposer
          draft="回复内容"
          isNight
          onDraftChange={vi.fn()}
          onPanelChange={vi.fn()}
          onSend={vi.fn()}
          panel={null}
          sendLabel="回复"
        />
      );
    });

    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "回复")).toBe(true);
    await act(async () => root.unmount());
  });

  it("submits on plain Enter only when the optional keyboard-submit seam is enabled", async () => {
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImChatComposer
          draft="回复内容"
          isNight
          onDraftChange={vi.fn()}
          onPanelChange={vi.fn()}
          onSend={onSend}
          panel={null}
          submitOnEnter
        />
      );
    });

    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    const enter = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
    await act(async () => {
      editor.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(onSend).toHaveBeenCalledTimes(1);

    const shiftEnter = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", shiftKey: true });
    await act(async () => {
      editor.dispatchEvent(shiftEnter);
    });
    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(onSend).toHaveBeenCalledTimes(1);

    const composingEnter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter"
    });
    await act(async () => {
      editor.dispatchEvent(composingEnter);
    });
    expect(composingEnter.defaultPrevented).toBe(false);
    expect(onSend).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("preserves the default chat Enter behavior when keyboard submission is omitted", async () => {
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImChatComposer
          draft="聊天内容"
          isNight
          onDraftChange={vi.fn()}
          onPanelChange={vi.fn()}
          onSend={onSend}
          panel={null}
        />
      );
    });

    const editor = container.querySelector<HTMLElement>('[data-im-composer-rich-input="true"]')!;
    const enter = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
    await act(async () => {
      editor.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
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
