/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { UnifiedConversationItem, UnifiedConversationPreviewText } from "./chat-home";
import source from "./chat-home.tsx?raw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("UnifiedChatHomePage spacing", () => {
  it("reveals and runs the delete action after a left swipe", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onDelete = vi.fn();

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            ClientThemeProvider,
            null,
            createElement(UnifiedConversationItem, {
              actions: [{ key: "delete", label: "删除", onClick: onDelete, tone: "danger", width: 64 }],
              avatar: "",
              group: true,
              preview: { text: "旧消息" },
              time: "今天",
              title: "测试群聊",
              unreadCount: 0,
            })
          )
        )
      );
    });

    const row = container.querySelector<HTMLElement>("div[style*='touch-action']");
    const dispatchPointer = async (type: string, clientX: number) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 20 });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: "touch" },
      });
      await act(async () => row?.dispatchEvent(event));
    };
    await dispatchPointer("pointerdown", 120);
    await dispatchPointer("pointermove", 20);
    await dispatchPointer("pointerup", 20);

    const deleteButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "删除");
    expect(deleteButton?.style.opacity).toBe("1");
    await act(async () => deleteButton?.click());
    expect(onDelete).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("lets chat and contact list content scroll behind the fixed glass header", () => {
    const componentStart = source.indexOf("export function UnifiedChatHomePage");
    const componentEnd = source.indexOf("export function UnifiedChatHeaderAction");
    const componentSource = source.slice(componentStart, componentEnd);

    expect(componentSource).not.toContain("-mt-");
    expect(source).toContain('const unifiedChatHomeContentClassName = "scrollbar-none relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-5 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] pt-[calc(env(safe-area-inset-top)+143px)] [-webkit-overflow-scrolling:touch]";');
    expect(componentSource).toContain("className={contentClassName}");
    expect(componentSource).toContain("showSpacer={false}");
  });

  it("uses an internal scroll container so list dragging does not pull the page shell", () => {
    expect(source).toContain('const unifiedChatHomeShellClassName = "client-glass-page-surface relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-transparent";');
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("overscroll-y-contain");
    expect(source).toContain("useIosScrollContainer(contentRef);");
    expect(source).toContain('data-im-home-scroll="true"');
  });

  it("supports a compact search header that keeps actions beside the search field", () => {
    const componentStart = source.indexOf("export function UnifiedChatHomePage");
    const componentEnd = source.indexOf("export function UnifiedChatHeaderAction");
    const componentSource = source.slice(componentStart, componentEnd);

    expect(source).toContain('const unifiedChatHomeCompactContentClassName = "scrollbar-none relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-5 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] pt-[calc(env(safe-area-inset-top)+92px)] [-webkit-overflow-scrolling:touch]";');
    expect(componentSource).toContain("compactHeader");
    expect(componentSource).toContain('compactHeader ? "flex items-center gap-3" : "space-y-3"');
    expect(componentSource).toContain('className="min-w-0 flex-1"');
    expect(componentSource).toContain("compactHeader ? unifiedChatHomeCompactContentClassName : unifiedChatHomeContentClassName");
  });

  it("protects user and dynamic values while leaving UI labels on runtime i18n", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        preview: {
          text: "系统消息 语音通话 changed left",
          runtimeI18nProtected: true,
        }
      }));
    });

    expect(container.querySelector("p [data-no-i18n]")?.textContent).toBe("系统消息 语音通话 changed left");

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        preview: {
          text: "报价单.pdf",
          runtimeI18nProtected: true,
          dynamicValue: "报价单.pdf",
        }
      }));
    });

    expect(container.querySelector("p [data-no-i18n]")?.textContent).toBe("报价单.pdf");

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        preview: {
          text: "[名片] 系统消息",
          runtimeI18nProtected: true,
          uiLabel: "[名片]",
          dynamicValue: "系统消息",
        }
      }));
    });

    expect(container.querySelector("p")?.childNodes[0]?.textContent).toBe("[名片]");
    expect(container.querySelector("p [data-no-i18n]")?.textContent).toBe("系统消息");
    expect(container.querySelector("p")?.getAttribute("data-no-i18n")).toBeNull();

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        preview: {
          text: "图片",
          runtimeI18nProtected: false,
        }
      }));
    });

    expect(container.querySelector("p [data-no-i18n]")).toBeNull();

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        conversationType: "system",
        preview: {
          text: "[名片] 系统联系人",
          runtimeI18nProtected: false,
          uiLabel: "[名片]",
          dynamicValue: "系统联系人",
        }
      }));
    });

    expect(container.querySelector("p [data-no-i18n]")).toBeNull();
    await act(async () => root.unmount());
  });
});
