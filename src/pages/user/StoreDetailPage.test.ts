import { describe, expect, it } from "vitest";
import pageSource from "./StoreDetailPage.tsx?raw";

describe("StoreDetailPage routed booking defaults", () => {
  it("keeps technician and schedule query defaults when opening checkout", () => {
    expect(pageSource).toContain("useSearchParams");
    expect(pageSource).toContain('searchParams.get("technician")');
    expect(pageSource).toContain("routedBookingTechnician");
    expect(pageSource).toContain("buildStoreCheckoutRoute");
    expect(pageSource).toContain("指名");
  });

  it("uses collapsible service menu and technician picker without the booking summary strip", () => {
    expect(pageSource).not.toContain("已选预约");
    expect(pageSource).toContain("serviceMenuCollapsed");
    expect(pageSource).toContain("technicianListCollapsed");
    expect(pageSource).toContain("StoreTechnicianSelectableCard");
    expect(pageSource).toContain("grid-cols-2");
    expect(pageSource).toContain('aria-label={unavailable ? "当前时间不可约" : active ? "已选技师" : "待选技师"}');
  });

  it("selects service packages through an icon control instead of a booking CTA", () => {
    expect(pageSource).toContain("selectedMenuCardId");
    expect(pageSource).toContain('const serviceSelectLabel = active ? "已选服务套餐" : "选择服务套餐";');
    expect(pageSource).toContain("setSelectedMenuCardId(item.sourceServiceId);");
    expect(pageSource).toContain("selectLabel={serviceSelectLabel}");
    expect(pageSource).not.toContain('cardUi?.cta ?? "预约"');
  });

  it("uses one consistent edit button size and avoids duplicate menu card edit actions", () => {
    const inlineEditSource = pageSource.slice(pageSource.indexOf("function StoreInlineEditLink"), pageSource.indexOf("const inlineTextEditorClassName"));
    const compactMenuSource = pageSource.slice(pageSource.indexOf("function CompactMenuCard"), pageSource.indexOf("function EnvironmentGalleryCard"));
    const menuPackageSource = pageSource.slice(pageSource.indexOf("const renderServiceMenuPackageSection"), pageSource.indexOf("const renderTechnicianMenuListSection"));

    expect(pageSource).toContain('const storeInlineEditButtonSizeClassName = "h-10 w-10";');
    expect(pageSource).toContain('const storeInlineEditIconSizeClassName = "h-4 w-4";');
    expect(inlineEditSource).toContain("storeInlineEditButtonSizeClassName");
    expect(inlineEditSource).toContain("storeInlineEditIconSizeClassName");
    expect(inlineEditSource).not.toContain('"h-7 w-7"');
    expect(inlineEditSource).not.toContain('"h-3.5 w-3.5"');
    expect(pageSource).toContain("<StoreInlineEditLink");
    expect(pageSource).toContain("to={merchantScheduleEditorHref}");
    expect(compactMenuSource).toContain("showSelectAction = true");
    expect(compactMenuSource).toContain("{showSelectAction ? (");
    expect(menuPackageSource).toContain("showSelectAction={!isMerchantEditable}");
    expect(menuPackageSource).not.toContain("merchantServiceEditLabel");
  });

  it("shows a merchant-only add service action between menu and technicians", () => {
    const menuPackageSource = pageSource.slice(pageSource.indexOf("const renderServiceMenuPackageSection"), pageSource.indexOf("const renderTechnicianMenuListSection"));

    expect(pageSource).toContain("function MerchantAddServiceButton");
    expect(pageSource).toContain("function buildNextStoreMenuCard");
    expect(pageSource).toContain("const addMerchantMenuCard");
    expect(pageSource).toContain("添加服务");
    expect(menuPackageSource).toContain("{isMerchantEditable ? (");
    expect(menuPackageSource).toContain("<MerchantAddServiceButton");
    expect(menuPackageSource).toContain("onAdd={addMerchantMenuCard}");
    expect(pageSource).toContain('`home-menu-${nextMenuCard.id}`');
    expect(pageSource).toContain("target: nextMenuCardEditorTarget");
  });

  it("warns merchants which pricing section is hidden from customers", () => {
    expect(pageSource).toContain("const isTechnicianPricingActive = isMerchantEditable ? pricingMode === \"technician\" : isTechnicianPricingEntry;");
    expect(pageSource).toContain("function PricingModeHiddenWarning");
    expect(pageSource).toContain("技师定价已开启，服务套餐菜单已隐藏，不会被用户看到。");
    expect(pageSource).toContain("商户定价已开启，技师列表已隐藏，不会被用户看到。");
    expect(pageSource).toContain("border-[#ff4d5e]");
    expect(pageSource).toContain("bg-[#ff314f]/12");
    expect(pageSource).toContain("rounded-full border-[3px] border-[#ff4d5e]");
    expect(pageSource).toMatch(/>\s*!\s*<\/span>/);
    expect(pageSource).toContain("isMerchantEditable ? (");
    expect(pageSource).not.toContain("isMerchantServiceHidden && focus === \"menu\"");
    expect(pageSource).not.toContain("店铺服务项目为只读");
    expect(pageSource).not.toContain("isMerchantServiceReadOnly");
  });

  it("keeps service package menu and technician list together with pricing-mode ordering", () => {
    expect(pageSource).toContain("const shouldRenderServiceMenu = menuBlock.visible;");
    expect(pageSource).toContain('const serviceMenuTabLabel = isTechnicianPricingActive ? "技师" : "菜单";');
    expect(pageSource).toContain('{ label: serviceMenuTabLabel, value: "menu" as const }');
    expect(pageSource).toContain("const shouldShowServicePackagesInMenu = isMerchantEditable || !isTechnicianPricingActive;");
    expect(pageSource).toContain("const shouldShowTechniciansInMenu = isMerchantEditable || isTechnicianPricingActive;");
    expect(pageSource).toContain("const serviceMenuHomePackageSection = renderServiceMenuPackageSection({");
    expect(pageSource).toContain("const serviceMenuTabOrderedSections = isTechnicianPricingActive");
    expect(pageSource).toContain("[technicianMenuListSection, serviceMenuPackageSection]");
    expect(pageSource).toContain("[serviceMenuPackageSection, technicianMenuListSection]");
    expect(pageSource).toContain("服务套餐菜单");
    expect(pageSource).toContain("技师列表");
    expect(pageSource).toContain("const shouldRenderTechnicianShowcase = technicianBlock.visible;");
    expect(pageSource).toContain("function StoreTechnicianServiceListRow");
    expect(pageSource).toContain("technicianPricingRatePercent?: number");
    expect(pageSource).toContain("const effectiveTechnicianPricingRatePercent = isTechnicianPricingActive");
    expect(pageSource).toContain("bookingNavigation?.technicianPricingRatePercent");
    expect(pageSource).toContain("quoteRatePercent={effectiveTechnicianPricingRatePercent}");
    expect(pageSource).toContain('<SectionTitle showInfo={false} title="技师列表" />');
    expect(pageSource).toContain("<SectionTitle showInfo={false} title={technicianBlock.name}>");
    expect(pageSource).toContain("{serviceMenuHomePackageSection}");
    expect(pageSource).toContain("{serviceMenuTabOrderedSections}");
    expect(pageSource).toContain("<StoreTechnicianServiceListRow");
    expect(pageSource).toContain('profileTo={getScopedProfileDetailPath(scope, "technician", technician.id)}');
    expect(pageSource).toContain("getScopedTechnicianServiceListPath");
    expect(pageSource).toContain("const getTechnicianServiceListTo = (technicianId: string)");
    expect(pageSource).toContain("serviceListTo={getTechnicianServiceListTo(technician.id)}");
    expect(pageSource).not.toContain("selectStoreServiceFromTechnicianRecommendation");
    expect(pageSource).not.toContain("onServiceSelect={selectStoreServiceFromTechnicianRecommendation}");
    expect(pageSource).toContain("查看技师动态");
    expect(pageSource).toContain("查看技师服务列表");
  });

  it("keeps store-home technician cards linked to dynamics while the plus selects the technician", () => {
    const selectableCardSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianSelectableCard"), pageSource.indexOf("function getStoreTechnicianDisplayName"));
    const homeTechnicianSource = pageSource.slice(pageSource.indexOf("{shouldRenderTechnicianShowcase ? ("), pageSource.indexOf('{activeTab === "seats" ?'));

    expect(selectableCardSource).toContain("onSelect={onSelect}");
    expect(selectableCardSource).toContain("detailTo={profileTo}");
    expect(selectableCardSource).toContain('selectionInactiveIcon={unavailable ? "x" : isMerchantEditable ? "eyeOff" : "plus"}');
    expect(selectableCardSource).not.toContain("onServiceSelect");
    expect(homeTechnicianSource).toContain("isTechnicianPricingActive ? (");
    expect(homeTechnicianSource).toContain("storeHomeTechnicianServiceListRows");
    expect(homeTechnicianSource).toContain(") : storeTechnicians.length > 0 ? (");
    expect(homeTechnicianSource).toContain("<StoreTechnicianSelectableCard");
    expect(homeTechnicianSource).toContain('profileTo={getScopedProfileDetailPath(scope, "technician", technician.id)}');
    expect(homeTechnicianSource).toContain("setSelectedTechnicianId(active ? \"\" : technician.id);");
    expect(homeTechnicianSource).not.toContain("onServiceSelect");
  });

  it("switches the store-home technician list to service rows only in technician-pricing mode", () => {
    const technicianRowsSource = pageSource.slice(pageSource.indexOf("const renderTechnicianServiceListRows"), pageSource.indexOf("const renderServiceMenuPackageSection"));
    const homeTechnicianSource = pageSource.slice(pageSource.indexOf("{shouldRenderTechnicianShowcase ? ("), pageSource.indexOf('{activeTab === "seats" ?'));
    const technicianRowSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianServiceListRow"), pageSource.indexOf("function StoreSelectionIconButton"));

    expect(pageSource).toContain("const storeHomeTechnicianServiceListRows = renderTechnicianServiceListRows({ selectable: true });");
    expect(homeTechnicianSource).toContain("isTechnicianPricingActive ? (");
    expect(homeTechnicianSource).toContain("storeHomeTechnicianServiceListRows");
    expect(homeTechnicianSource).toContain(") : storeTechnicians.length > 0 ? (");
    expect(homeTechnicianSource).toContain("<StoreTechnicianSelectableCard");
    expect(technicianRowsSource).toContain("selectable = false");
    expect(technicianRowsSource).toContain("selected={selectable ? active : undefined}");
    expect(technicianRowsSource).toContain("onSelect={selectable");
    expect(technicianRowsSource).toContain("unavailable={selectable ? unavailable : false}");
    expect(technicianRowsSource).toContain("if (unavailable) {");
    expect(technicianRowSource).toContain("selected?: boolean;");
    expect(technicianRowSource).toContain("onSelect?: () => void;");
    expect(technicianRowSource).toContain("unavailable?: boolean;");
    expect(technicianRowSource).toContain('inactiveIcon={unavailable ? "x" : "plus"}');
    expect(technicianRowSource).toContain('label={unavailable ? "当前时间不可约" : selected ? "已选技师" : "待选技师"}');
  });

  it("disables technicians whose confirmed appointment overlaps the selected store booking time", () => {
    const selectableCardSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianSelectableCard"), pageSource.indexOf("function getStoreTechnicianDisplayName"));
    const homeTechnicianSource = pageSource.slice(pageSource.indexOf("{shouldRenderTechnicianShowcase ? ("), pageSource.indexOf('{activeTab === "seats" ?'));
    const technicianRowsSource = pageSource.slice(pageSource.indexOf("const renderTechnicianServiceListRows"), pageSource.indexOf("const renderServiceMenuPackageSection"));
    const technicianRowSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianServiceListRow"), pageSource.indexOf("function StoreSelectionIconButton"));

    expect(pageSource).toContain("orders");
    expect(pageSource).toContain("confirmedTechnicianBookingStatuses");
    expect(pageSource).toContain("function isTechnicianUnavailableForSelectedTime");
    expect(pageSource).toContain("function doBookingWindowsOverlap");
    expect(pageSource).toContain("const selectedBookingDurationMinutes");
    expect(pageSource).toContain("const unavailableTechnicianIds");
    expect(pageSource).toContain("unavailableTechnicianIds.has(technician.id)");
    expect(pageSource).toContain("setSelectedTechnicianId(\"\");");
    expect(selectableCardSource).toContain("unavailable = false");
    expect(selectableCardSource).toContain("selectionDisabled={unavailable}");
    expect(selectableCardSource).toContain('selectionInactiveIcon={unavailable ? "x" : isMerchantEditable ? "eyeOff" : "plus"}');
    expect(selectableCardSource).toContain('selectionAriaLabel={unavailable ? "当前时间不可约"');
    expect(selectableCardSource).toContain('!isMerchantEditable && unavailable && "opacity-70 saturate-[0.72]"');
    expect(homeTechnicianSource).toContain("const unavailable = !isMerchantEditable && unavailableTechnicianIds.has(technician.id);");
    expect(homeTechnicianSource).toContain("if (unavailable) {");
    expect(homeTechnicianSource).toContain("unavailable={unavailable}");
    expect(technicianRowsSource).toContain("const unavailable = !isMerchantEditable && unavailableTechnicianIds.has(technician.id);");
    expect(technicianRowsSource).toContain("if (unavailable) {");
    expect(technicianRowSource).toContain('!isMerchantEditable && unavailable && "opacity-70 saturate-[0.72]"');
    expect(technicianRowSource).toContain("disabled={unavailable}");
    expect(technicianRowSource).toContain('inactiveIcon={unavailable ? "x" : "plus"}');
  });

  it("keeps technician-tab row right content linked to technician service lists with a service info affordance", () => {
    const technicianRowSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianServiceListRow"), pageSource.indexOf("function StoreSelectionIconButton"));

    expect(technicianRowSource).toContain("absolute left-2 right-[5px] top-2 z-20 flex items-start justify-between gap-1");
    expect(technicianRowSource).toContain('className="flex shrink-0 items-start -space-x-[4px]"');
    expect(technicianRowSource).toContain("<SimpleRatingBadge compact");
    expect(technicianRowSource).toContain('size="cluster"');
    expect(technicianRowSource).toContain("serviceListTo");
    expect(technicianRowSource).toContain("to={serviceListTo}");
    expect(technicianRowSource).toContain("查看技师服务列表");
    expect(technicianRowSource).toContain("quoteRatePercent = 100");
    expect(technicianRowSource).toContain("const displayedPrice = Number.isFinite(price) && price > 0 ? Math.round((price * quoteRatePercent) / 100) : price;");
    expect(technicianRowSource).toContain("yen(displayedPrice)");
    expect(technicianRowSource).toContain('className="flex min-w-0 flex-col justify-between rounded-[14px] py-1 pl-1.5 pr-1.5 text-left active:scale-[0.99]"');
    expect(technicianRowSource).toContain('className={cn("min-w-0", (isMerchantEditable || showSelectionAction) && "pr-12")}');
    expect(technicianRowSource).toContain("py-2 pl-3 pr-11");
    expect(technicianRowSource).toContain('name="info"');
    expect(technicianRowSource).not.toContain("onServiceSelect");
    expect(technicianRowSource).not.toContain("查看店铺服务项目");
  });

  it("keeps merchant technician visibility as an outer top-right eye action", () => {
    const technicianRowSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianServiceListRow"), pageSource.indexOf("function StoreSelectionIconButton"));

    expect(pageSource).toContain('metricLayout="split"');
    expect(technicianRowSource).toContain("isMerchantEditable");
    expect(technicianRowSource).toContain("onToggleVisibility");
    expect(technicianRowSource).toContain('className="absolute right-2 top-2 z-30 h-11 w-11"');
    expect(technicianRowSource).toContain('activeIcon="eye"');
    expect(technicianRowSource).toContain('inactiveIcon="eyeOff"');
    expect(technicianRowSource).toContain('label={technicianVisible ? "隐藏技师" : "显示技师"}');
    expect(pageSource).toContain("onToggleVisibility={() => toggleTechnicianDisplayVisibility(technician)}");
  });

  it("keeps technician age in the profile detail line instead of a name-side badge", () => {
    const technicianRowSource = pageSource.slice(pageSource.indexOf("function StoreTechnicianServiceListRow"), pageSource.indexOf("function StoreSelectionIconButton"));

    expect(technicianRowSource).toContain('technician.age ? `${technician.age}岁` : ""');
    expect(technicianRowSource).toContain("technician.height ?? \"\"");
    expect(technicianRowSource).not.toContain('>{technician.age}</span>');
    expect(technicianRowSource).not.toContain('`${technician.height}cm`');
  });

  it("does not render an outer technician/menu title inside the combined menu tab", () => {
    const tabMenuSource = pageSource.slice(pageSource.indexOf('{activeTab === "menu" && shouldRenderServiceMenu ?'), pageSource.indexOf('{activeTab === "moments" ?'));
    const packageSectionSource = pageSource.slice(pageSource.indexOf("const renderServiceMenuPackageSection"), pageSource.indexOf("const renderTechnicianMenuListSection"));

    expect(tabMenuSource).toContain("{serviceMenuTabOrderedSections}");
    expect(tabMenuSource).not.toContain("{shouldRenderTechnicianShowcase ? (");
    expect(tabMenuSource).not.toContain('style={blockOrderStyle("technicians")}');
    expect(tabMenuSource).not.toContain("title={serviceMenuSectionTitle}");
    expect(tabMenuSource).not.toContain("label={serviceMenuSectionTitle}");
    expect(packageSectionSource).toContain("showSectionHeader");
    expect(packageSectionSource).toContain("servicePackageMenuCollapsed");
    expect(packageSectionSource).toContain('label="服务套餐菜单"');
    expect(packageSectionSource).toContain("setServicePackageMenuCollapsed");
  });

  it("labels the booking calendar as appointment time selection with a merchant schedule edit action", () => {
    const bookingSectionSource = pageSource.slice(pageSource.indexOf("{bookingBlock.visible ?"), pageSource.indexOf("{shouldRenderServiceMenu ?"));

    expect(pageSource).toContain('const merchantScheduleEditorHref = "/merchant/schedule?tab=planning";');
    expect(bookingSectionSource).toContain('title="选择预约时间"');
    expect(bookingSectionSource).toContain('label="编辑排班"');
    expect(bookingSectionSource).toContain("to={merchantScheduleEditorHref}");
    expect(bookingSectionSource).not.toContain("bookingBlock.name");
    expect(bookingSectionSource).not.toContain("最近两周预约模块");
    expect(bookingSectionSource).not.toContain("最近可约");
    expect(bookingSectionSource).not.toContain("随时可约");
    expect(bookingSectionSource).not.toContain("bookingModeCopy(store.openStatus)");
  });

  it("opens merchant-owned service display edits in a fullscreen editor", () => {
    expect(pageSource).toContain("StoreDisplayFullscreenEditor");
    expect(pageSource).toContain("activeEditor ? (");
    expect(pageSource).toContain('mode={activeEditor.mode}');
    expect(pageSource).toContain('target={activeEditor.target}');
    expect(pageSource).toContain('onClose={() => setActiveEditor(null)}');
  });

  it("uses the working basic-card editor in the embedded merchant header without duplicating the info-card edit button", () => {
    const embeddedHeaderSource = pageSource.slice(pageSource.indexOf("if (embedded)"), pageSource.indexOf('<div className="relative z-0">{content}</div>'));
    const basicInfoCardStart = pageSource.indexOf('<FlatCard className="store-basic-info-block');
    const basicInfoCardSource = pageSource.slice(basicInfoCardStart, pageSource.indexOf('<EditableTagChips editing={basicCardEditing}'));

    expect(basicInfoCardStart).toBeGreaterThan(-1);
    expect(embeddedHeaderSource).toContain('renderMerchantEditor("basic", "编辑资料", "absolute right-0 top-0 z-30", "default", "basic-card")');
    expect(embeddedHeaderSource).not.toContain('"header-basic"');
    expect(basicInfoCardSource).not.toContain('editor={renderMerchantEditor("basic", "编辑资料", undefined, "default", "basic-card")}');
    expect(pageSource).not.toContain('renderActiveInlineEditor("header-basic")');
  });

  it("uses edit affordances instead of user selection plus buttons for merchant-owned services and technicians", () => {
    expect(pageSource).toContain('scope === "merchant"');
    expect(pageSource).toContain("showSelectAction={!isMerchantEditable}");
    expect(pageSource).toContain('selectionActiveIcon={isMerchantEditable ? "eye" : "check"}');
    expect(pageSource).toContain('selectionInactiveIcon={unavailable ? "x" : isMerchantEditable ? "eyeOff" : "plus"}');
    expect(pageSource).toContain('selectionAriaLabel={unavailable ? "当前时间不可约" : isMerchantEditable ? (technicianVisible ? "隐藏技师" : "显示技师") : active ? "已选技师" : "待选技师"}');
  });

  it("uses the technician eye action as a merchant display visibility switch", () => {
    expect(pageSource).toContain("isTechnicianDisplayVisible");
    expect(pageSource).toContain("toggleTechnicianDisplayVisibility");
    expect(pageSource).toContain("visible: !isTechnicianDisplayVisible(technician)");
    expect(pageSource).toContain("isMerchantEditable || isTechnicianDisplayVisible(item)");
    expect(pageSource).not.toContain('handleMerchantEditFocus("technician", technicianEditorTarget);');
  });

  it("opens the shared image adjustment editor before merchant image replacements are saved", () => {
    expect(pageSource).toContain("ImageAdjustmentEditor");
    expect(pageSource).toContain("pendingStoreImageEdit");
    expect(pageSource).toContain("openStoreImageEditor");
    expect(pageSource).toContain("setPendingFullscreenImageEdit");
    expect(pageSource).toContain("replaceFullscreenMenuImage");
    expect(pageSource).toContain("const fileInput = event.currentTarget;");
    expect(pageSource).toContain("void replaceFullscreenMenuImage(fileInput.files).finally(() => {");
  });

  it("keeps the fullscreen merchant editor header compact with bottom actions", () => {
    expect(pageSource).toContain('className="client-store-display-editor-glass-header"');
    expect(pageSource).toContain("showSpacer={false}");
    expect(pageSource).toContain('ClientEdgeMask edge="bottom"');
    expect(pageSource).toContain("StickyBottomBar");
    expect(pageSource).toContain("取消");
    expect(pageSource).toContain("删除当前服务");
    expect(pageSource).toContain("保存并关闭");
    expect(pageSource).not.toContain("var(--client-floating-header-height");
  });

  it("keeps fullscreen editor content and bottom actions flat instead of nested framed shells", () => {
    const inlineEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayInlineEditor"), pageSource.indexOf("function StoreDisplayEditorPanel"));
    const editorPanelSource = pageSource.slice(pageSource.indexOf("function StoreDisplayEditorPanel"), pageSource.indexOf("function StoreDisplayEditorInput"));

    expect(pageSource).toContain("const storeDisplayEditorContentClassName");
    expect(inlineEditorSource).toContain("className={storeDisplayEditorContentClassName}");
    expect(inlineEditorSource).not.toContain("shadow-[0_18px_42px");
    expect(inlineEditorSource).not.toContain("backdrop-blur-xl");
    expect(editorPanelSource).toContain("className={storeDisplayEditorContentClassName}");
    expect(editorPanelSource).not.toContain("rounded-[24px] border");
    expect(pageSource).toContain("const storeDisplayEditorBottomPanelClassName");
    expect(pageSource).toContain("panelClassName={storeDisplayEditorBottomPanelClassName}");
    expect(pageSource).not.toContain('panelClassName="p-2.5"');
  });

  it("keeps add service outside the menu fullscreen editor", () => {
    const fullscreenEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayFullscreenEditor"), pageSource.indexOf("function CompactMenuCard"));

    expect(fullscreenEditorSource).toContain("replaceFullscreenMenuImage");
    expect(fullscreenEditorSource).not.toContain("新增服务内容");
    expect(fullscreenEditorSource).not.toContain("onClick={addMenuCard}");
  });

  it("opens newly added services instead of falling back to the first menu card", () => {
    const fullscreenEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayFullscreenEditor"), pageSource.indexOf("function CompactMenuCard"));
    const addServiceSource = pageSource.slice(pageSource.indexOf("const addMerchantMenuCard"), pageSource.indexOf("const handleMerchantEditFocus"));

    expect(fullscreenEditorSource).not.toContain("Math.max(0, menuCards.findIndex");
    expect(fullscreenEditorSource).toContain("fallbackMenuCard");
    expect(fullscreenEditorSource).toContain("menuIndex >= 0");
    expect(addServiceSource).toContain("menuCard: nextMenuCard");
  });

  it("matches menu image editing previews to the displayed menu card crop", () => {
    const compactMenuSource = pageSource.slice(pageSource.indexOf("function CompactMenuCard"), pageSource.indexOf("function EnvironmentGalleryCard"));
    const fullscreenEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayFullscreenEditor"), pageSource.indexOf("function CompactMenuCard"));

    expect(pageSource).toContain("function StoreMenuCoverImage");
    expect(pageSource).toContain('const storeMenuCoverReferenceWidth = 344;');
    expect(pageSource).toContain('const storeMenuCoverRadiusClassName = "rounded-[26px]";');
    expect(pageSource).toContain("getStoreMenuCardCoverHeight(cardUi)");
    expect(pageSource).toContain("getStoreMenuImageEditorAspectRatio(packageCardUi)");
    expect(pageSource).toContain("getStoreMenuCoverFrameStyle(cardUi)");
    expect(compactMenuSource).toContain("<StoreMenuCoverImage");
    expect(fullscreenEditorSource).toContain("<StoreMenuCoverImage");
    expect(fullscreenEditorSource).toContain("frameClassName: storeMenuCoverRadiusClassName");
    expect(pageSource).toContain("frameClassName={pendingFullscreenImageEdit.frameClassName}");
    expect(pageSource).toContain("frameClassName={pendingStoreImageEdit.frameClassName}");
    expect(pageSource).not.toContain('style={{ height: `${menuCoverHeight}px` }}');
    expect(pageSource).not.toContain("aspectRatio: 4 / 3");
  });

  it("keeps fullscreen menu image adjustment above the fullscreen editor portal", () => {
    const fullscreenEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayFullscreenEditor"), pageSource.indexOf("function CompactMenuCard"));
    const editorIndex = fullscreenEditorSource.indexOf("<ImageAdjustmentEditor");
    const fullscreenCloseIndex = fullscreenEditorSource.indexOf("</MobileFullscreenPage>");

    expect(editorIndex).toBeGreaterThan(-1);
    expect(fullscreenCloseIndex).toBeGreaterThan(-1);
    expect(editorIndex).toBeLessThan(fullscreenCloseIndex);
  });

  it("matches hero gallery editing previews to the displayed carousel card", () => {
    const inlineEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayInlineEditor"), pageSource.indexOf("function StoreDisplayEditorPanel"));

    expect(pageSource).toContain("const storeHeroGalleryCardHeight = 204;");
    expect(pageSource).toContain("const storeHeroGalleryFrameWidth = 390;");
    expect(pageSource).toContain("const storeHeroGalleryAspectRatio = storeHeroGalleryFrameWidth / storeHeroGalleryCardHeight;");
    expect(pageSource).toContain("const storeHeroGalleryEditorFrameWidth = 344;");
    expect(pageSource).toContain('const storeHeroGalleryRadiusClassName = "rounded-[28px]";');
    expect(pageSource).toContain('cardHeightClassName="h-[204px]"');
    expect(inlineEditorSource).toContain("editorAspectRatio={storeHeroGalleryAspectRatio}");
    expect(inlineEditorSource).toContain("editorFrameClassName={storeHeroGalleryRadiusClassName}");
    expect(inlineEditorSource).toContain("editorFrameWidth={storeHeroGalleryEditorFrameWidth}");
    expect(inlineEditorSource).toContain("previewAspectRatio={storeHeroGalleryAspectRatio}");
    expect(pageSource).toContain("aspectRatio: storeHeroGalleryAspectRatio");
    expect(pageSource).toContain("frameClassName: storeHeroGalleryRadiusClassName");
    expect(pageSource).toContain("frameWidth: storeHeroGalleryEditorFrameWidth");
    expect(pageSource).not.toContain("aspectRatio: 16 / 10");
    expect(pageSource).not.toContain("editorAspectRatio={16 / 10}");
  });

  it("keeps the store homepage carousel intro-only and moves intro editing to the gallery editor", () => {
    const heroSlidesSource = pageSource.slice(pageSource.indexOf("const heroSlides"), pageSource.indexOf("const environmentGalleryItems"));
    const homeCarouselSource = pageSource.slice(pageSource.indexOf("<FeatureCarousel"), pageSource.indexOf("<div className={cn(featureCarouselFrameClassName"));
    const embeddedHeaderSource = pageSource.slice(pageSource.indexOf("if (embedded)"), pageSource.indexOf("{content}", pageSource.indexOf("if (embedded)")));
    const fixedHeaderSource = pageSource.slice(pageSource.indexOf("<FloatingHomeHeader"), pageSource.indexOf('<div className="mt-2">{tabSwitcher}</div>'));
    const inlineEditorSource = pageSource.slice(pageSource.indexOf("function StoreDisplayInlineEditor"), pageSource.indexOf("function StoreDisplayEditorPanel"));
    const basicEditorSource = inlineEditorSource.slice(inlineEditorSource.indexOf('{mode === "basic" ?'), inlineEditorSource.indexOf('{mode === "presentation" ?'));
    const galleryEditorSource = inlineEditorSource.slice(inlineEditorSource.indexOf('{mode === "gallery" ?'), inlineEditorSource.indexOf('{mode === "basic" ?'));

    expect(heroSlidesSource).toContain("caption: config.subtitle");
    expect(heroSlidesSource).not.toContain("badge: store.rankLabel");
    expect(heroSlidesSource).not.toContain('cta: "查看大图"');
    expect(homeCarouselSource).toContain("renderSlide={({ slide, index }) =>");
    expect(homeCarouselSource).toContain("slide.caption");
    expect(homeCarouselSource).not.toContain("<InlineEditableText");
    expect(homeCarouselSource).not.toContain("slide.badge");
    expect(pageSource).not.toContain("查看大图");
    expect(embeddedHeaderSource).not.toContain(">服务展示<");
    expect(embeddedHeaderSource).toContain("{store.address}</p>");
    expect(embeddedHeaderSource).not.toContain("{config.subtitle}</p>");
    expect(fixedHeaderSource).not.toContain("{config.subtitle}</p>");
    expect(galleryEditorSource).toContain('label="轮播简介"');
    expect(galleryEditorSource).toContain('onChange={(value) => updatePresentationField("subtitle", value)}');
    expect(galleryEditorSource.indexOf('label="轮播简介"')).toBeLessThan(galleryEditorSource.indexOf("<ImageGalleryManager"));
    expect(basicEditorSource).not.toContain("店铺介绍");
    expect(basicEditorSource).not.toContain("{ description: event.target.value }");
  });

  it("keeps the map tab details ordered like the reference restaurant profile", () => {
    const mapSectionSource = pageSource.slice(pageSource.indexOf('{activeTab === "map" ?'), pageSource.indexOf("{renderActiveInlineEditor(\"map-guide\")}", pageSource.indexOf('{activeTab === "map" ?')));
    const expectedOrder = [
      'title="店铺基础信息"',
      'label="店名"',
      'label="地址"',
      'label="交通手段"',
      'label="分类"',
      'title="店铺详细信息"',
      'label="预约・咨询"',
      'label="预约可否"',
      'label="营业时间"',
      'label="预算"',
      'label="支付方式"',
      'label="服务费・其他费用"',
      'title="席・设备"',
      'label="席数"',
      'label="最大预约人数"',
      'label="个室"',
      'label="包场"',
      'label="禁烟・吸烟"',
      'label="停车场"',
      'label="空间・设备"',
      'title="菜单"',
      'label="套餐"',
      'label="饮品"',
      'label="服务内容"',
      'title="特点・相关信息"',
      'label="利用场景"',
      'label="位置氛围"',
      'label="服务"',
      'label="儿童同行"',
      'label="官方账号"',
      'label="电话咨询"'
    ];

    expect(pageSource).toContain("function StoreMapInfoRow");
    expect(pageSource).toContain("function StoreMapTagList");
    expect(mapSectionSource).toContain('title="店铺信息"');
    expect(mapSectionSource).not.toContain('title="到店信息"');
    expect(mapSectionSource).toContain("storeBookingCtaButtonClassName");
    expect(pageSource).toContain("平台聊天咨询优先");
    expect(mapSectionSource.match(/label="地址"/g)).toHaveLength(1);
    expect(mapSectionSource.match(/label="交通手段"/g)).toHaveLength(1);
    expect(mapSectionSource.match(/label="店名"/g)).toHaveLength(1);
    expect(mapSectionSource.match(/label="分类"/g)).toHaveLength(1);
    expectedOrder.reduce((previousIndex, label) => {
      const nextIndex = mapSectionSource.indexOf(label, previousIndex + 1);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      return nextIndex;
    }, -1);
    expect(pageSource).not.toContain("type StoreMapDetailGroup");
    expect(pageSource).not.toContain("buildStoreMapDetailGroups");
    expect(pageSource).not.toContain("mapDetailGroups.map");
    expect(pageSource).not.toContain("预约・营业补充");
    expect(pageSource).not.toContain("席位・服务补充");
    expect(pageSource).toContain("套餐、畅饮和多人席可预约。");
    expect(pageSource).toContain("隐秘感餐厅，适合朋友小聚和商务会食。");
    expect(pageSource).not.toContain("饮み放题");
    expect(pageSource).not.toContain("隐れ家餐厅");
  });

  it("uses the shared icon metric action for favorite and share controls", () => {
    expect(pageSource).toContain("IconMetricAction");
    expect(pageSource).not.toContain("function TopMetricAction");
  });

  it("keeps the fixed store header compact and out of page vertical rhythm spacing", () => {
    expect(pageSource).toContain('contentClassName="pb-40 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]"');
    expect(pageSource).toContain('<div className="mt-2">{tabSwitcher}</div>');
    expect(pageSource).toContain('<div className="space-y-3">{content}</div>');
    expect(pageSource).not.toContain('contentClassName="space-y-3 pb-40');
    expect(pageSource).not.toContain("pointer-events-none fixed inset-x-0 top-0 z-30");
    expect(pageSource).not.toContain("scale-110 object-cover opacity-[0.68] blur-[1px]");
  });

  it("keeps store booking capsule CTAs compact instead of relying on h-14 overrides", () => {
    expect(pageSource).toContain('const storeBookingCtaButtonClassName = "h-[52px] min-w-[176px] justify-center gap-2 px-7 text-center text-sm";');
    expect(pageSource).toContain('const storeBottomActionRowClassName = "mx-auto flex w-full max-w-[888px] items-center gap-3 px-4 pb-2";');
    expect(pageSource).toContain('const storeBottomSecondaryButtonClassName = "h-[52px] shrink-0 gap-2 px-5 shadow-[0_12px_26px_rgba(0,0,0,0.20)] backdrop-blur-xl";');
    expect(pageSource).toContain('const storeBottomPrimaryButtonClassName = "h-[52px] flex-1 gap-2 px-5 text-sm shadow-[0_12px_30px_color-mix(in_srgb,var(--client-primary)_20%,transparent)]";');
    expect(pageSource).not.toContain("min-h-14 min-w-[188px]");
    expect(pageSource).not.toContain('className="h-14 shrink-0');
    expect(pageSource).not.toContain('className="h-14 flex-1');
    expect(pageSource).not.toContain("px-4 pb-3");
  });
});
