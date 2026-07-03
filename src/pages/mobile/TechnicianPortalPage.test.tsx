import { describe, expect, it } from "vitest";
import source from "./TechnicianPortalPage.tsx?raw";

function expectInOrder(text: string, labels: string[]) {
  let previousIndex = -1;

  labels.forEach((label) => {
    const nextIndex = text.indexOf(label);

    expect(nextIndex).toBeGreaterThan(previousIndex);
    previousIndex = nextIndex;
  });
}

describe("TechnicianPortalPage profile card", () => {
  it("keeps the info/data tabs and places privacy plus tags in the info card", () => {
    const cardStart = source.indexOf('data-testid="technician-info-card"');
    const cardEnd = source.indexOf('{activeMeTab === "data"', cardStart);
    const cardSource = source.slice(cardStart, cardEnd);

    expect(source).toContain('{ label: "信息卡", value: "info" }');
    expect(source).toContain('{ label: "数据中心", value: "data" }');
    expect(cardSource).toContain('ariaLabel="开启隐私模式"');
    expect(cardSource).toContain('data-testid="technician-profile-privacy-control"');
    expect(cardSource).toContain('data-testid="technician-privacy-options"');
    expect(cardSource).toContain("PrivacyModeConfirmDialog");
    expect(cardSource).toContain("profilePrivacyConfirmOpen");
    expect(cardSource).toContain("confirmProfilePrivacyEnabled");
    expect(source).toContain("profileDraftPrivacyConfirmOpen");
    expect(cardSource).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(cardSource).toContain('profileEditorOpen ? "min-h-36" : "h-36"');
    expect(cardSource).toContain("mt-auto rounded-[18px]");
    expect(cardSource).toContain("z-[90]");
    expect(cardSource).toContain("profilePrivacyMenuOpen");
    expect(cardSource).toContain("profilePrivacyOptions.map");
    expect(cardSource).toContain("ProfilePrivacyInfoButton");
    expect(cardSource).not.toContain("评分 {technicianRating}");
    expect(cardSource).not.toContain("本月收入");
    expect(source).not.toContain('{ label: "本月收入", value: formatTechnicianCompactYen(baseTech.income) }');
    expect(source).not.toContain("function formatTechnicianCompactYen");
    expect(cardSource).toContain("grid grid-cols-2 gap-2");
    expect(cardSource).toContain("服务评分");
    expect(cardSource).toContain("profileEditorOpen ? cancelProfileEdit : openProfileEditor");
    expect(cardSource).toContain("toggleDraftLanguage(language)");
    expect(cardSource).toContain("toggleDraftServiceArea(area)");
    expect(cardSource).toContain("toggleDraftTag(tag)");
    expect(cardSource).toContain("toggleDraftPaymentMethod(method)");
    expect(cardSource).toContain("techProfile.bidBudgetMin");
    expect(cardSource).toContain("formatPaymentMethodLabels(techProfile.paymentMethods)");
    expect(cardSource).toContain("<TechnicianReviewStampList");
    expect(cardSource).toContain("getTechnicianIdentityDisplayLabel(profileEditorOpen ? profileDraft.identityLabel : techProfile.identityLabel)");
    expect(cardSource).toContain("getTechnicianIdentityDisplayLabel(label)");
    expect(cardSource).toContain("onClick={saveProfile}");
    expect(source).toContain("false && profileEditorOpen");
    expect(source).not.toContain('title="信息卡设置"');
    expect(source).not.toContain("公开主页、头像轮播和补充资料仍在设置页维护");
    expect(source).toContain("对所有人不可见");
    expect(source).toContain("对好友可见");
    expect(source).toContain("对好友以及关联人可见");
    expect(source).toContain('description: "仅本人可见"');
    expect(source).toContain('description: "仅好友可以看到该账号信息"');
    expect(source).toContain('description: "仅好友以及关联店铺和介绍关系中的关联人可见"');
    expect(source).not.toContain("仅好友关系中的用户可以看到这张信息卡。");
    expect(source).not.toContain("好友和订单、店铺、介绍关系中的关联人可以看到。");

    const basicInfoIndex = cardSource.indexOf("基础信息");
    const specialTagsIndex = cardSource.indexOf('data-testid="technician-info-special-tags"');
    const tagsIndex = cardSource.indexOf('data-testid="technician-info-tags"');

    expect(basicInfoIndex).toBeGreaterThan(-1);
    expect(specialTagsIndex).toBeGreaterThan(basicInfoIndex);
    expect(tagsIndex).toBeGreaterThan(specialTagsIndex);
    expectInOrder(cardSource.slice(basicInfoIndex), ["接单预算", "支持支付方式", "自我介绍", "标签"]);
  });

  it("shows technician services as per-service inline edit cards with a read-only pricing mode switch", () => {
    const serviceTabStart = source.indexOf('{activeMeTab === "services"');
    const serviceTabEnd = source.indexOf('{activeMeTab === "data"', serviceTabStart);
    const serviceTabSource = source.slice(serviceTabStart, serviceTabEnd);

    expect(source).toContain("pricingModeApi.getShopPricingMode");
    expect(source).toMatch(/pricingModeApi\s*\.\s*listTechnicianServices\(technicianShopApiId,\s*\{\s*page:\s*1,\s*pageSize:\s*20\s*\}\)/);
    expect(source).toContain('import { ApiClientError } from "../../api/httpClient";');
    expect(source).toContain("function TechnicianPricingModeReadonlySwitch");
    expect(source).toContain("function isTechnicianServiceIdentity");
    expect(source).toContain("function hasTechnicianProfileIdentity");
    expect(source).toContain("function getTechnicianServiceAccessIssue");
    expect(source).toContain("function needsTechnicianServiceSettingsSwitch");
    expect(source).toContain("function getTechnicianServiceMutationFailureMessage");
    expect(source).toContain('session.currentIdentity.type === "technician"');
    expect(source).toContain('session.currentIdentity.scopeType === "technician_profile"');
    expect(source).toContain('session.permissions.includes("technician:services:write")');
    expect(source).toContain('const { session, logout } = useAuth();');
    expect(source).toContain("const redirectToTechnicianServiceLogin = useCallback(async () =>");
    expect(source).toContain("technicianServiceLoginRedirectingRef");
    expect(source).not.toContain("technicianServiceIdentitySyncInFlightRef");
    expect(source).toContain("technicianServiceEditingCardRef");
    expect(source).toContain("technicianServiceCancelConfirmOpen");
    expect(source).toContain("technicianServiceDeleteConfirmOpen");
    expect(source).toContain('document.addEventListener("pointerdown", handleTechnicianServiceOutsidePointerDown, true)');
    expect(source).toContain('document.removeEventListener("pointerdown", handleTechnicianServiceOutsidePointerDown, true)');
    expect(source).toContain("technicianServiceEditingCardRef.current?.contains(target)");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("event.stopPropagation();");
    expect(source).toContain("setTechnicianServiceCancelConfirmOpen(true)");
    expect(source).toContain("const requestCancelTechnicianServiceEdit = () =>");
    expect(source).toContain("是否取消编辑服务信息？未保存的修改将不会保留。");
    expect(source).toContain('confirmLabel="取消编辑"');
    expect(source).toContain('cancelLabel="继续编辑"');
    expect(source).toContain("const requestDeleteEditingTechnicianService = () =>");
    expect(source).toContain("setTechnicianServiceDeleteConfirmOpen(true)");
    expect(source).toContain("是否要删除该服务项目？当前内容将不会被保存。");
    expect(source).toContain('confirmLabel="删除服务"');
    expect(source).toContain("await logout();");
    expect(source).toContain("/login/technician?redirect=");
    expect(source).toContain("const technicianServiceLoginRedirectPath = \"/technician/me?meTab=services\";");
    expect(source).not.toContain('const switched = await switchPortal("technician");');
    expect(source).not.toContain('void switchPortal("technician")');
    expect(source).not.toContain("当前技师身份同步失败，请重新登录技师账号后再");
    expect(source).toContain("请先到设置 > 身份切换切换到技师身份后再");
    expect(source).toContain("登录状态已失效，请重新登录技师账号后再");
    expect(source).toContain("当前账号无法");
    expect(source).toContain('data-testid="technician-service-pricing-mode-display"');
    expect(source).toContain('const statusLabel = technicianPricing ? "当前服务列表已生效" : "当前服务列表未启用";');
    expect(source).toContain('const blockedMessage = technicianPricing ? "无法关闭，详情请联系所属店铺的担当者" : "无法开启，详情请联系所属店铺的担当者";');
    expect(source).toContain("const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);");
    expect(source).toContain("setBlockedDialogOpen(true)");
    expect(source).toContain("message={blockedMessage}");
    expect(source).toContain("showConfirmAction={false}");
    expect(source).not.toContain("window.alert(blockedMessage)");
    expect(source).not.toContain(">当前模式<");
    expect(source).not.toContain('technicianPricing ? "技师定价" : "店铺定价"');
    expect(source).toContain('type TechnicianServiceEditorId = number | "default" | "draft";');
    expect(source).toContain('type TechnicianServiceCardItem = TechnicianServicePayload | "default" | "draft";');
    expect(source).toContain("const openNewTechnicianServiceEditor = () =>");
    expect(source).toContain("const deleteEditingTechnicianService = async () =>");
    expect(source).toContain('ensureTechnicianServiceMutationAccess("删除")');
    expect(source).toContain('ensureTechnicianServiceMutationAccess("保存")');
    expect(source).toContain('getTechnicianServiceMutationFailureMessage(error, "删除")');
    expect(source).toContain('getTechnicianServiceMutationFailureMessage(error, "保存")');
    expect(source).toContain('technicianServiceEditingId === "default"');
    expect(source).toContain("function shouldCreateDefaultTechnicianServiceBeforeDraftSave");
    expect(source).toContain("const shouldCreateDefaultService = shouldCreateDefaultTechnicianServiceBeforeDraftSave");
    expect(source).toContain("const savedDefaultService = shouldCreateDefaultService");
    expect(source).toContain("return [...createdServices, saved];");
    expect(source).toContain("pricingModeApi.deleteTechnicianService");
    expect(source).toContain("const technicianServiceCardItems: TechnicianServiceCardItem[] =");
    expect(source).toContain('technicianServiceEditingId === "draft" ? [...technicianServices, "draft"] : technicianServices');
    expect(source).toContain('technicianServiceEditingId === "draft" ? ["default", "draft"] : ["default"]');
    expect(source).toContain("const currentTechnicianServiceDisplayCount = technicianServiceCardItems.length;");
    expect(serviceTabSource).toContain("<TechnicianPricingModeReadonlySwitch");
    expect(serviceTabSource).toContain("technicianServiceCardItems.map");
    expect(serviceTabSource).toContain("technicianServiceCardItems.map((service, serviceIndex)");
    expect(serviceTabSource).toContain('const serviceRecord = typeof service === "string" ? null : service;');
    expect(serviceTabSource).toContain("const canDeleteEditingService = editing && serviceIndex > 0;");
    expect(serviceTabSource).toContain("ref={editing ? technicianServiceEditingCardRef : null}");
    expect(serviceTabSource).toContain('data-testid="technician-service-card"');
    expect(serviceTabSource).toContain("technicianServiceEditingId");
    expect(serviceTabSource).toContain("openTechnicianServiceEditor");
    expect(serviceTabSource).toContain("onClick={openNewTechnicianServiceEditor}");
    expect(serviceTabSource).toContain('icon="edit"');
    expect(serviceTabSource).toContain("cancelTechnicianServiceEdit");
    expect(serviceTabSource).toContain("保存");
    expect(serviceTabSource).toContain("取消");
    expect(serviceTabSource).toContain("onClick={requestCancelTechnicianServiceEdit}");
    expect(serviceTabSource).not.toContain("onClick={cancelTechnicianServiceEdit} type=\"button\"");
    expect(serviceTabSource).toContain("删除该服务");
    expect(serviceTabSource).toContain("onClick={requestDeleteEditingTechnicianService}");
    expect(serviceTabSource).not.toContain("onClick={() => void deleteEditingTechnicianService()}");
    expect(serviceTabSource).not.toContain("保存服务");
    expect(serviceTabSource).not.toContain('title="我的服务"');
    expect(serviceTabSource).not.toContain("还没有保存服务信息。");
    expect(serviceTabSource).not.toContain("technicianServices.length} 项");
    expect(source).toContain("const maxTechnicianServiceCount = 5;");
    expect(serviceTabSource).toContain("currentTechnicianServiceDisplayCount < maxTechnicianServiceCount");
    expect(serviceTabSource).toContain("currentTechnicianServiceDisplayCount}/{maxTechnicianServiceCount}");
    expect(serviceTabSource).toContain("添加服务");
    expect(serviceTabSource).not.toContain("已达到 5 项服务上限");
    expect(serviceTabSource).toContain("rounded-[18px] border px-3 py-2.5");
    expect(source).toContain("return [...current, ...createdServices, saved];");
  });
});

describe("TechnicianPortalPage task panel contrast", () => {
  it("keeps the today arrangement heading and utility icons readable on the white tasks background", () => {
    const todayTitleIndex = source.indexOf('title="今日安排"');
    const todayPanelSource = source.slice(todayTitleIndex, source.indexOf("{renderTechnicianStatusTimeline()}", todayTitleIndex));

    expect(todayTitleIndex).toBeGreaterThan(-1);
    expect(todayPanelSource).toContain('titleClassName="text-lg font-bold text-[color:var(--client-text)]"');
    expect(todayPanelSource).toContain('variant="paper"');
    expect(todayPanelSource).not.toContain('titleClassName="text-lg font-bold text-white"');
    expect(todayPanelSource).not.toContain('variant="dark"');

    expect(source).toContain("const technicianTaskUtilityActionClassName");
    expect(source).toContain("const technicianTaskCardClassName");
    expect(source).toContain("const technicianTaskSecondaryActionClassName");
    expect(source).toContain("text-[color:var(--client-text)]");
    expect(source).toContain("bg-[color:color-mix(in_srgb,var(--client-elevated)_96%,white_4%)]");
    expect(todayPanelSource).not.toContain("border border-white/20 bg-black/32 text-white");
    expect(todayPanelSource).not.toContain('className="mt-3 text-[18px] font-black tracking-[-0.03em] text-white"');
    expect(todayPanelSource).not.toContain('className="mt-2 text-xs leading-5 text-white/60"');
    expect(todayPanelSource).not.toContain('className="text-xs leading-5 text-white/60"');
    expect(todayPanelSource).not.toContain('className="mt-3 rounded-[20px] border border-white/10 bg-white/[0.06] px-4 py-3"');
    expect(todayPanelSource).not.toContain('className="text-[11px] font-bold text-white/45"');
    expect(todayPanelSource).not.toContain("border border-white/10 bg-white/[0.06] text-sm font-black text-white");
  });
});
