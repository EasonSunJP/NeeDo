/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { UnifiedConversationPreviewText } from "./chat-home";
import source from "./chat-home.tsx?raw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("UnifiedChatHomePage spacing", () => {
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

  it("protects only message-derived preview text from runtime i18n", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        preview: { text: "テストテスト", userGenerated: true }
      }));
    });

    expect(container.querySelector("p")?.getAttribute("data-no-i18n")).toBe("true");

    await act(async () => {
      root.render(createElement(UnifiedConversationPreviewText, {
        preview: { text: "私密群消息已隐藏", userGenerated: false }
      }));
    });

    expect(container.querySelector("p")?.hasAttribute("data-no-i18n")).toBe(false);
    await act(async () => root.unmount());
  });
});
