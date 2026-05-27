import { describe, expect, it } from "vitest";
import source from "./chat-home.tsx?raw";

describe("UnifiedChatHomePage spacing", () => {
  it("lets chat and contact list content scroll behind the fixed glass header", () => {
    const componentStart = source.indexOf("export function UnifiedChatHomePage");
    const componentEnd = source.indexOf("export function UnifiedChatHeaderAction");
    const componentSource = source.slice(componentStart, componentEnd);

    expect(componentSource).not.toContain("-mt-");
    expect(source).toContain('const unifiedChatHomeContentClassName = "scrollbar-none relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-5 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] pt-[calc(env(safe-area-inset-top)+143px)] [-webkit-overflow-scrolling:touch]";');
    expect(componentSource).toContain("className={unifiedChatHomeContentClassName}");
    expect(componentSource).toContain("showSpacer={false}");
  });

  it("uses an internal scroll container so list dragging does not pull the page shell", () => {
    expect(source).toContain('const unifiedChatHomeShellClassName = "client-glass-page-surface relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-transparent";');
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("overscroll-y-contain");
    expect(source).toContain("useIosScrollContainer(contentRef);");
    expect(source).toContain('data-im-home-scroll="true"');
  });
});
