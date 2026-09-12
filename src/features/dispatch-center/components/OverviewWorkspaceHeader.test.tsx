import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import floatingWindowSource from "./FloatingActionWindow.tsx?raw";
import source from "./OverviewWorkspace.tsx?raw";
import storeSource from "../store.ts?raw";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("OverviewWorkspace mobile schedule detail header", () => {
  it("loads the merchant detail board from formal schedule slots and formal technician avatars", () => {
    expect(source).toContain("loadManagedScheduleWindow");
    expect(source).toContain("buildFormalMerchantScheduleBoard");
    expect(source).toContain("formalTechnicians");
    expect(source).toContain("dataOverride={formalScheduleBoard?.dataOverride}");
    expect(source).toContain("formalScheduleLoading");
    expect(source).toContain("formalScheduleError");
    expect(source).not.toContain('useState("2026-04-20")');
  });

  it("resolves fallback schedule staff links from public NeeDo ids", () => {
    expect(source).toContain("const getTechnicianPublicDetailPath = useCallback((technicianInternalId: string) => getMerchantStaffDetailPath(");
    expect(source).toContain("activeTechnicians.find((technician) => technician.id === technicianInternalId)?.systemId");
    expect(source).toContain("getTechnicianDetailPath={getTechnicianPublicDetailPath}");
    expect(source).not.toContain("getTechnicianDetailPath={getMerchantStaffDetailPath}");
  });

  it("reloads and isolates formal data when switching shops", () => {
    expect(source).toContain("formalScheduleScopeKey");
    expect(source).toContain("formalScheduleResult.scopeKey === formalScheduleScopeKey");
    expect(source).toContain("formalScheduleReloadKey, formalScheduleScopeKey, formalStore?.id, usesFormalMerchantSchedule]");
    expect(source).toContain("readFormalScheduleWindow(cacheInput)");
    expect(source).toContain("refreshFormalScheduleWindow(cacheInput, load)");
    expect(source).toContain("<ScheduleCacheRefreshIndicator");
  });

  it("keeps the formal board override during loading and errors", () => {
    const start = source.indexOf("const formalScheduleBoard = useMemo");
    const guard = source.slice(start, source.indexOf("return buildFormalMerchantScheduleBoard", start));
    expect(guard).not.toContain("formalScheduleLoading");
    expect(guard).not.toContain("formalScheduleError");
    const detail = source.slice(source.indexOf('<MobileFullscreenPage className="z-[90]"'));
    expect(detail).toContain('aria-live="polite"');
    expect(detail).toContain("formalScheduleLoading");
    expect(detail).toContain("formalScheduleError");
  });

  it("uses the shared floating fullscreen header without a page-local wrapper", () => {
    const detailStart = source.indexOf('<MobileFullscreenPage className="z-[90]"');
    const detailEnd = source.indexOf("isMobileSurface && currentSelectedContactStatusItem", detailStart);
    const scheduleDetailSource = source.slice(detailStart, detailEnd);

    expect(scheduleDetailSource).toContain("<MobileFullscreenHeader");
    expect(scheduleDetailSource).toContain('className="client-mobile-schedule-detail__floating-header"');
    expect(source).toContain('const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");');
    expect(scheduleDetailSource).toContain('aria-label={t("搜索排班")}');
    expect(scheduleDetailSource).toContain('placeholder={t("搜索技师、服务、预约")}');
    expect(scheduleDetailSource).toContain('onChange={(event) => setScheduleSearchQuery(event.target.value)}');
    expect(source).toContain("const [scheduleDetailReturnView, setScheduleDetailReturnView] = useState<ScheduleCycleCalendarBoardView | null>(null);");
    expect(source).toContain("const changeScheduleDetailView = (nextView: ScheduleCycleCalendarBoardView) => {");
    expect(source).toContain("const returnToScheduleDetailSourceView = () => {");
    expect(scheduleDetailSource).toContain("onBack={scheduleDetailReturnView ? returnToScheduleDetailSourceView : closeScheduleDetail}");
    expect(scheduleDetailSource).toContain("onClose={closeScheduleDetail}");
    expect(source).toContain("const closeScheduleDetail = () => {");
    expect(source).toContain("setScheduleDetailReturnView(null);");
    expect(source).toContain('setScheduleSearchQuery("");');
    expect(scheduleDetailSource).toContain("showSpacer={false}");
    expect(scheduleDetailSource).toContain("client-mobile-schedule-detail__refractive-scroll");
    expect(scheduleDetailSource).toContain('className="client-mobile-schedule-detail__calendar-board"');
    expect(scheduleDetailSource).toContain('scheduleStickyTop={scheduleDetailStickyTop}');
    expect(scheduleDetailSource).toContain("onViewChange={changeScheduleDetailView}");
    expect(scheduleDetailSource).not.toContain("floating={false}");
    expect(scheduleDetailSource).not.toContain("client-mobile-schedule-detail__solid-header");
    expect(scheduleDetailSource).not.toContain("client-mobile-schedule-detail__header shrink-0");
    expect(scheduleDetailSource).not.toContain("bg-transparent text-ink backdrop-blur-none");
    expect(scheduleDetailSource).not.toContain("subtitle={schedulePeriodLabel}");
  });

  it("moves the mobile detailed schedule action from the summary card to a fixed bottom control", () => {
    const summaryStart = source.indexOf('title={t("当前周期班表")}');
    const summaryEnd = source.indexOf("{isMobileSurface ? (\n        <ContactInfoStatusPanel", summaryStart);
    const summarySource = source.slice(summaryStart, summaryEnd);

    expect(summarySource).not.toContain('t("查看详细排班表")');
    expect(source).toContain('data-testid="merchant-current-schedule-detail-action"');
    expect(source).toContain('className="safe-bottom client-app-frame client-app-gutter fixed inset-x-0 bottom-0 z-[80]');
    expect(source).toContain('onClick={() => setScheduleDetailOpen(true)}');
    expect(source).toContain('{formalScheduleLoading ? t("加载正式排班中") : t("查看详细排班表")}');
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
