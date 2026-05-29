import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import source from "./OverviewWorkspace.tsx?raw";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("OverviewWorkspace mobile schedule detail header", () => {
  it("uses the shared floating fullscreen header without a page-local wrapper", () => {
    const detailStart = source.indexOf('<MobileFullscreenPage className="z-[90]"');
    const detailEnd = source.indexOf("isMobileSurface && currentSelectedContactStatusItem", detailStart);
    const scheduleDetailSource = source.slice(detailStart, detailEnd);

    expect(scheduleDetailSource).toContain("<MobileFullscreenHeader");
    expect(scheduleDetailSource).toContain('className="client-mobile-schedule-detail__floating-header"');
    expect(scheduleDetailSource).toContain("showSpacer={false}");
    expect(scheduleDetailSource).toContain("client-mobile-schedule-detail__refractive-scroll");
    expect(scheduleDetailSource).toContain('className="client-mobile-schedule-detail__calendar-board"');
    expect(scheduleDetailSource).not.toContain("floating={false}");
    expect(scheduleDetailSource).not.toContain("client-mobile-schedule-detail__solid-header");
    expect(scheduleDetailSource).not.toContain("client-mobile-schedule-detail__header shrink-0");
    expect(scheduleDetailSource).not.toContain("bg-transparent text-ink backdrop-blur-none");
  });

  it("lets schedule content sit under the header so the glass has backing content to refract", () => {
    expect(styles).toContain(".client-mobile-schedule-detail__refractive-scroll");
    expect(styles).toContain(".client-mobile-schedule-detail__calendar-board");
    expect(styles).toContain("padding-top: calc(env(safe-area-inset-top, 0px) + 86px) !important;");
    expect(styles).toContain("border-color: transparent !important;");
    expect(styles).toContain("border-radius: 0 !important;");
    expect(styles).toContain("box-shadow: none !important;");
    expect(styles).toContain(".client-mobile-schedule-detail__floating-header");
    expect(styles).toContain(".client-store-display-editor-glass-header");
    expect(styles).toContain(").client-floating-header-glass-frame");
    expect(styles).toContain("color-mix(in srgb, var(--client-top-chrome-bg) 7%, transparent) 0%");
  });
});
