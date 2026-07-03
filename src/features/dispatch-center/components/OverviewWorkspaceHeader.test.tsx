import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import floatingWindowSource from "./FloatingActionWindow.tsx?raw";
import source from "./OverviewWorkspace.tsx?raw";
import storeSource from "../store.ts?raw";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("OverviewWorkspace mobile schedule detail header", () => {
  it("uses the shared floating fullscreen header without a page-local wrapper", () => {
    const detailStart = source.indexOf('<MobileFullscreenPage className="z-[90]"');
    const detailEnd = source.indexOf("isMobileSurface && currentSelectedContactStatusItem", detailStart);
    const scheduleDetailSource = source.slice(detailStart, detailEnd);

    expect(scheduleDetailSource).toContain("<MobileFullscreenHeader");
    expect(scheduleDetailSource).toContain('className="client-mobile-schedule-detail__floating-header"');
    expect(source).toContain("const [scheduleDetailReturnView, setScheduleDetailReturnView] = useState<ScheduleCycleCalendarBoardView | null>(null);");
    expect(source).toContain("const changeScheduleDetailView = (nextView: ScheduleCycleCalendarBoardView) => {");
    expect(source).toContain("const returnToScheduleDetailSourceView = () => {");
    expect(scheduleDetailSource).toContain("onBack={scheduleDetailReturnView ? returnToScheduleDetailSourceView : undefined}");
    expect(scheduleDetailSource).toContain("setScheduleDetailReturnView(null);");
    expect(scheduleDetailSource).toContain("showSpacer={false}");
    expect(scheduleDetailSource).toContain("client-mobile-schedule-detail__refractive-scroll");
    expect(scheduleDetailSource).toContain('className="client-mobile-schedule-detail__calendar-board"');
    expect(scheduleDetailSource).toContain('scheduleStickyTop={scheduleDetailStickyTop}');
    expect(scheduleDetailSource).toContain("onViewChange={changeScheduleDetailView}");
    expect(scheduleDetailSource).not.toContain("floating={false}");
    expect(scheduleDetailSource).not.toContain("client-mobile-schedule-detail__solid-header");
    expect(scheduleDetailSource).not.toContain("client-mobile-schedule-detail__header shrink-0");
    expect(scheduleDetailSource).not.toContain("bg-transparent text-ink backdrop-blur-none");
  });

  it("keeps schedule content aligned under the shared glass header without a local solid wrapper", () => {
    expect(styles).toContain(".client-mobile-schedule-detail__refractive-scroll");
    expect(styles).toContain("--client-mobile-schedule-detail-grid-header-top: calc(env(safe-area-inset-top, 0px) + 58px);");
    expect(styles).toContain(".client-mobile-schedule-detail__calendar-board");
    expect(styles).toContain("padding-top: calc(env(safe-area-inset-top, 0px) + 86px) !important;");
    expect(styles).toContain("color-mix(in srgb, var(--client-top-chrome-bg) 7%, transparent) 0%");
    expect(styles).toContain("0 14px 34px color-mix(in srgb, var(--client-bg) 16%, rgba(0, 0, 0, 0.16))");
    expect(styles).toContain(".client-mobile-schedule-detail__floating-header");
    expect(styles).toContain(".client-store-display-editor-glass-header");
    expect(styles).toContain(").client-floating-header-glass-frame");
    expect(styles).not.toContain(".client-shell .client-floating-header-frameless");
  });

  it("keeps the desktop floating todo list aligned to merchant admin theme controls", () => {
    expect(floatingWindowSource).toContain("const handleMinimizeWindow = () => {");
    expect(floatingWindowSource).toContain("onMinimizeAll(visibleTasks.map((task) => task.id), true)");
    expect(floatingWindowSource).toContain('aria-label="最小化待办列表"');
    expect(floatingWindowSource).toContain('title="最小化待办列表"');
    expect(floatingWindowSource).toContain('aria-label="展开待办列表"');
    expect(floatingWindowSource).toContain("merchant-dispatch-floating-panel-minimize");
    expect(source).toContain("onMinimizeAll={minimizeFloatingTasks}");
    expect(source).toContain("onRestoreAll={() => minimizeFloatingTasks(floatingTasks.map((task) => task.id), false)}");
    expect(storeSource).toContain("export function minimizeFloatingTasks(taskIds: string[], minimized: boolean)");

    expect(styles).toContain("--merchant-dispatch-float-header: color-mix(in srgb, var(--admin-accent)");
    expect(styles).not.toContain("--merchant-dispatch-float-header: color-mix(in srgb, var(--admin-danger)");

    const fabStart = styles.indexOf(".merchant-admin-shell .merchant-dispatch-fab");
    const shellStart = styles.indexOf(".merchant-admin-shell .merchant-dispatch-floating-shell", fabStart);
    const fabBlock = styles.slice(fabStart, shellStart);

    expect(fabBlock).toContain("var(--admin-accent)");
    expect(fabBlock).not.toContain("var(--admin-danger)");
    expect(styles).toContain(".merchant-admin-shell .merchant-dispatch-floating-panel-minimize");
  });
});
