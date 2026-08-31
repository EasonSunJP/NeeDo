import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type MembershipRewardPreview,
  type MembershipRewardPreviewScenario,
  type MembershipRewardRuleKind,
  type ShopMembershipCardPlan
} from "./api";
import {
  cardPlanBaseRuleOptions,
  cardPlanBonusRuleOptions,
  cardPlanVersionToEditor,
  createEmptyCardPlanEditor,
  createEmptyRuleEditor,
  validateCardPlanDraft,
  type CardPlanEditor,
  type CardPlanRuleEditor
} from "./cardPlanModel";

const surface = "rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,var(--client-bg)_8%)]";
const inset = "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";
const field = "min-h-11 w-full rounded-[16px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_22%,transparent)]";
const primaryButton = "min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton = "min-h-11 rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-5 text-sm font-black text-[color:var(--client-text)] disabled:cursor-not-allowed disabled:opacity-40";

const steps = ["基本信息", "发卡初始值", "基础返点", "加码规则与上限", "成本试算", "发布确认"] as const;
const cardTypeLabels = { stored_value: "储值卡", count: "次数卡", benefit: "权益卡" } as const;
const statusLabels = { draft: "草稿", active: "已发布", retired: "已停用" } as const;

type WorkspaceProps = { canManage: boolean; canPublish: boolean };

function describeCardPlanError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 400) return "有字段不符合规则，请检查标红或未填写的项目";
    if (error.status === 403) return "当前账号没有执行此操作的权限";
    if (error.status === 404) return "方案不存在，或其中的服务不属于当前店铺";
    if (error.status === 409) return "方案已被其他人更新，请重新载入后继续";
  }
  if (error instanceof Error && error.message === "percentage") return "返点比例须为 0–100%，最多两位小数";
  if (error instanceof Error && error.message === "issuance") return "发卡初始值与卡类型不匹配，或最小值大于最大值";
  return "操作未完成，请检查填写内容或网络后重试";
}

function localNow() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultScenario(): MembershipRewardPreviewScenario {
  return {
    eligibleAmountJpy: 10_000,
    servicePublicId: "00000000-0000-4000-8000-000000000000",
    categoryCode: "general",
    scheduledAt: new Date().toISOString(),
    completedCountBefore: 0,
    lifetimeEligibleSpendJpyBefore: 0,
    isFirstCardUse: true,
    customerBirthMonth: null,
    birthdayRewardsThisYear: 0,
    consecutiveEligibleMonths: 0,
    rewardedConsecutiveMonthMilestones: [],
    alreadyRewardedTodayNdp: 0,
    alreadyRewardedMonthNdp: 0,
    alreadyRewardedLifetimeNdp: 0
  };
}

function planVersion(plan: ShopMembershipCardPlan) {
  return plan.draftVersion ?? plan.currentVersion;
}

function rewardSummary(plan: ShopMembershipCardPlan) {
  const version = planVersion(plan);
  if (!version) return "尚未配置返点";
  const base = version.rules.find((rule) => rule.ruleGroup === "base");
  if (!base) return "尚未配置基础返点";
  if (base.kind === "fixed_per_completion") return `每次服务返 ${base.rewardNdp.toLocaleString()} NDP`;
  if (base.kind === "percent_of_eligible_amount") return `合格消费额的 ${(base.rewardRateBps / 100).toFixed(2).replace(/\.00$/, "")}% 返 NDP`;
  if (base.kind === "spend_block") return `每满 ¥${base.blockAmountJpy.toLocaleString()} 返 ${base.rewardNdpPerBlock.toLocaleString()} NDP`;
  return "NDP 基础返点";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">{children}</span>;
}

function TextField({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return <label className="block min-w-0"><FieldLabel>{label}</FieldLabel><input {...props} className={cn(field, props.className)} onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}

function RuleFields({ editor, onChange }: { editor: CardPlanRuleEditor; onChange: (next: CardPlanRuleEditor) => void }) {
  const set = (key: keyof CardPlanRuleEditor, value: CardPlanRuleEditor[keyof CardPlanRuleEditor]) => onChange({ ...editor, [key]: value });
  const fixedReward = ["fixed_per_completion", "first_card_use_bonus", "birthday_month_bonus", "schedule_window_bonus", "consecutive_month_bonus"].includes(editor.kind)
    || (["completion_milestone_bonus", "spend_milestone_bonus"].includes(editor.kind));
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {fixedReward ? <TextField inputMode="numeric" label="返还 NDP" onChange={(value) => set("rewardNdp", value)} placeholder="例如 1000" value={editor.rewardNdp} /> : null}
      {editor.kind === "percent_of_eligible_amount" ? <TextField inputMode="decimal" label="返点比例（%）" onChange={(value) => set("rewardRatePercent", value)} placeholder="例如 10" value={editor.rewardRatePercent} /> : null}
      {editor.kind === "spend_block" ? <><TextField inputMode="numeric" label="每满消费金额（JPY）" onChange={(value) => set("blockAmountJpy", value)} value={editor.blockAmountJpy} /><TextField inputMode="numeric" label="每档返还 NDP" onChange={(value) => set("rewardNdpPerBlock", value)} value={editor.rewardNdpPerBlock} /></> : null}
      {editor.kind === "service_scope_bonus" ? <><label><FieldLabel>加返方式</FieldLabel><select className={field} onChange={(event) => set("serviceRewardMode", event.target.value as "fixed" | "percent")} value={editor.serviceRewardMode}><option value="fixed">固定 NDP</option><option value="percent">按金额比例返 NDP</option></select></label>{editor.serviceRewardMode === "fixed" ? <TextField inputMode="numeric" label="加返 NDP" onChange={(value) => set("rewardNdp", value)} value={editor.rewardNdp} /> : <TextField inputMode="decimal" label="加返比例（%）" onChange={(value) => set("rewardRatePercent", value)} value={editor.rewardRatePercent} />}</> : null}
      {editor.kind === "completion_milestone_bonus" ? <TextField inputMode="numeric" label="每完成多少次" onChange={(value) => set("everyCompletions", value)} value={editor.everyCompletions} /> : null}
      {editor.kind === "spend_milestone_bonus" ? <TextField inputMode="numeric" label="累计消费门槛（JPY）" onChange={(value) => set("thresholdJpy", value)} value={editor.thresholdJpy} /> : null}
      {editor.kind === "birthday_month_bonus" ? <TextField inputMode="numeric" label="每年最多触发次数" onChange={(value) => set("annualLimit", value)} value={editor.annualLimit} /> : null}
      {editor.kind === "consecutive_month_bonus" ? <TextField inputMode="numeric" label="连续月数" onChange={(value) => set("consecutiveMonths", value)} value={editor.consecutiveMonths} /> : null}
      {editor.kind === "schedule_window_bonus" ? <><TextField label="星期（0 日–6 六，逗号分隔）" onChange={(value) => set("daysOfWeek", value)} value={editor.daysOfWeek} /><div className="grid grid-cols-2 gap-2"><TextField label="开始" onChange={(value) => set("startTime", value)} type="time" value={editor.startTime} /><TextField label="结束" onChange={(value) => set("endTime", value)} type="time" value={editor.endTime} /></div></> : null}
    </div>
    {["completion_milestone_bonus", "spend_milestone_bonus"].includes(editor.kind) ? <label className={cn(inset, "flex min-h-11 items-center gap-3 px-3 text-sm font-bold")}><input checked={editor.repeat} onChange={(event) => set("repeat", event.target.checked)} type="checkbox" />达到下一档时重复触发</label> : null}
    <details className={cn(inset, "px-3 py-2.5")}>
      <summary className="cursor-pointer text-xs font-black text-[color:var(--client-muted)]">适用范围与排除条件（可选）</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField label="适用服务 UUID（逗号分隔）" onChange={(value) => set("servicePublicIds", value)} value={editor.servicePublicIds} />
        <TextField label="适用分类代码（逗号分隔）" onChange={(value) => set("categoryCodes", value)} value={editor.categoryCodes} />
        <TextField label="排除服务 UUID" onChange={(value) => set("excludedServicePublicIds", value)} value={editor.excludedServicePublicIds} />
        <TextField label="排除分类代码" onChange={(value) => set("excludedCategoryCodes", value)} value={editor.excludedCategoryCodes} />
        <TextField label="规则开始时间" onChange={(value) => set("activeFrom", value)} type="datetime-local" value={editor.activeFrom} />
        <TextField label="规则结束时间" onChange={(value) => set("activeTo", value)} type="datetime-local" value={editor.activeTo} />
      </div>
    </details>
  </div>;
}

function CostFlow({ preview }: { preview: MembershipRewardPreview | null }) {
  const value = (amount?: number) => amount === undefined ? "—" : `${amount.toLocaleString()} NDP`;
  return <div className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_36%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary-soft)_66%,var(--client-surface))]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] px-4 py-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">NDP reward flow</p><h3 className="mt-0.5 text-sm font-black">返点资金流</h3></div><TestFeatureBadge /></div>
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 p-4 text-sm">
      <span className="font-bold text-[color:var(--client-muted)]">客户获得</span><strong className="font-mono">{value(preview?.customerRewardNdp)}</strong>
      <span className="font-bold text-[color:var(--client-muted)]">平台费率</span><strong className="font-mono">{preview ? `${(preview.platformFeeRateBps / 100).toFixed(2).replace(/\.00$/, "")}%` : "—"}</strong>
      <span className="font-bold text-[color:var(--client-muted)]">平台费</span><strong className="font-mono">{value(preview?.platformFeeNdp)}</strong>
      <span className="border-t border-[color:var(--client-line)] pt-3 font-black">店铺总成本</span><strong className="border-t border-[color:var(--client-line)] pt-3 text-right font-mono text-lg text-[color:var(--client-primary)]">{value(preview?.totalShopDebitNdp)}</strong>
    </div>
    <p className="px-4 pb-4 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">设定和发布方案不会冻结 NDP。返点实际发生时，客户所得与平台费才会从店铺钱包扣除。</p>
  </div>;
}

export function CardPlanWorkspace({ canManage, canPublish }: WorkspaceProps) {
  const [plans, setPlans] = useState<ShopMembershipCardPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);
  const [editor, setEditor] = useState<CardPlanEditor>(() => createEmptyCardPlanEditor());
  const [activeStep, setActiveStep] = useState(0);
  const [busy, setBusy] = useState<"save" | "preview" | "publish" | "retire" | "">("");
  const [feedback, setFeedback] = useState("");
  const [preview, setPreview] = useState<MembershipRewardPreview | null>(null);
  const [scenario, setScenario] = useState(() => ({ amount: "10000", servicePublicId: defaultScenario().servicePublicId, categoryCode: "general", scheduledAt: localNow() }));

  const selectedPlan = useMemo(() => plans.find((plan) => plan.publicId === selectedPublicId) ?? null, [plans, selectedPublicId]);

  const applyPlan = useCallback((plan: ShopMembershipCardPlan) => {
    setPlans((current) => [plan, ...current.filter((item) => item.publicId !== plan.publicId)]);
    setSelectedPublicId(plan.publicId);
    const version = planVersion(plan);
    if (version) setEditor(cardPlanVersionToEditor(version));
    setPreview(null);
  }, []);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setFeedback("");
    try {
      const result = await merchantShopMembershipApi.listCardPlans({ page: 1, pageSize: 20 });
      setPlans(result.list);
      if (result.list[0]) {
        setSelectedPublicId(result.list[0].publicId);
        const version = planVersion(result.list[0]);
        if (version) setEditor(cardPlanVersionToEditor(version));
      }
    } catch (error) {
      setFeedback(describeCardPlanError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const save = async () => {
    setBusy("save"); setFeedback("");
    try {
      const body = validateCardPlanDraft(editor);
      const saved = selectedPlan
        ? await merchantShopMembershipApi.saveCardPlanDraft(selectedPlan.publicId, body)
        : await merchantShopMembershipApi.createCardPlan(body);
      applyPlan(saved);
      setFeedback("草稿已保存");
    } catch (error) {
      setFeedback(describeCardPlanError(error));
    } finally { setBusy(""); }
  };

  const runPreview = async () => {
    if (!selectedPlan) { setFeedback("请先保存草稿，再进行服务器成本试算"); return; }
    setBusy("preview"); setFeedback("");
    try {
      const amount = Number(scenario.amount);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("scenario");
      const facts = defaultScenario();
      const result = await merchantShopMembershipApi.previewCardPlan(selectedPlan.publicId, {
        ...facts,
        eligibleAmountJpy: amount,
        servicePublicId: scenario.servicePublicId.trim(),
        categoryCode: scenario.categoryCode.trim(),
        scheduledAt: new Date(scenario.scheduledAt).toISOString()
      });
      setPreview(result);
    } catch (error) {
      setFeedback(describeCardPlanError(error));
    } finally { setBusy(""); }
  };

  const publish = async () => {
    if (!selectedPlan?.draftVersion || !window.confirm("确认发布此方案？发布版本及平台费率快照将保持不变。")) return;
    setBusy("publish"); setFeedback("");
    try { applyPlan(await merchantShopMembershipApi.publishCardPlan(selectedPlan.publicId, selectedPlan.draftVersion.lockVersion)); setFeedback("方案已发布"); }
    catch (error) { setFeedback(describeCardPlanError(error)); }
    finally { setBusy(""); }
  };

  const retire = async () => {
    if (!selectedPlan || !window.confirm("停用后不能再用于后续发卡，确认继续？")) return;
    setBusy("retire"); setFeedback("");
    try { applyPlan(await merchantShopMembershipApi.retireCardPlan(selectedPlan.publicId)); setFeedback("方案已停用"); }
    catch (error) { setFeedback(describeCardPlanError(error)); }
    finally { setBusy(""); }
  };

  const setRule = (next: CardPlanRuleEditor) => setEditor((current) => ({ ...current, baseRule: next }));
  const setBonusRule = (index: number, next: CardPlanRuleEditor) => setEditor((current) => ({ ...current, bonusRules: current.bonusRules.map((item, itemIndex) => itemIndex === index ? next : item) }));
  const setValue = <K extends keyof CardPlanEditor>(key: K, value: CardPlanEditor[K]) => setEditor((current) => ({ ...current, [key]: value }));

  return <div className="space-y-4">
    <section className={cn(surface, "overflow-hidden p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">Card plan desk</p><TestFeatureBadge /></div><h2 className="mt-1 text-xl font-black">会员卡方案</h2><p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-[color:var(--client-muted)]">先定义发卡边界与 NDP 返点。开卡与客户确认调整已独立接入；充值、核销、退款仍是后续步骤。</p></div>{canManage ? <button className={secondaryButton} onClick={() => { setSelectedPublicId(null); setEditor(createEmptyCardPlanEditor()); setPreview(null); setActiveStep(0); setFeedback(""); }} type="button">新建方案</button> : <span className={cn(inset, "px-3 py-2 text-xs font-black text-[color:var(--client-muted)]")}>只读查看</span>}</div>
    </section>

    {feedback ? <p className={cn(inset, "px-4 py-3 text-sm font-bold")} role="status">{feedback}</p> : null}
    {loading ? <section className={cn(surface, "p-8 text-center text-sm font-bold text-[color:var(--client-muted)]")}>正在读取卡方案</section> : null}

    {!loading ? <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-2" aria-label="会员卡方案列表">
        {plans.length ? plans.map((plan) => {
          const version = planVersion(plan);
          return <button className={cn(surface, "w-full p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[color:var(--client-primary)]", selectedPublicId === plan.publicId && "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]")} key={plan.publicId} onClick={() => { setSelectedPublicId(plan.publicId); if (version) setEditor(cardPlanVersionToEditor(version)); setPreview(null); }} type="button"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-[0.13em] text-[color:var(--client-primary)]">{version ? cardTypeLabels[version.cardType] : "未配置"}</span><span className="rounded-full bg-[color:var(--client-bg)] px-2 py-1 text-[10px] font-black text-[color:var(--client-muted)]">{statusLabels[plan.status]}</span></div><strong className="mt-2 block truncate text-sm">{version?.name ?? "未命名方案"}</strong><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{rewardSummary(plan)}</p><p className="mt-2 font-mono text-[10px] font-bold text-[color:var(--client-muted)]">v{version?.version ?? 0} · {version?.rules.filter((rule) => rule.ruleGroup === "bonus").length ?? 0} 条加码</p></button>;
        }) : <div className={cn(surface, "p-5 text-sm font-bold text-[color:var(--client-muted)]")}>还没有卡方案。店主可从右侧建立第一张 NDP 会员卡方案。</div>}
      </aside>

      <section className={cn(surface, "min-w-0 overflow-hidden")}>
        <nav aria-label="方案配置步骤" className="grid grid-cols-3 gap-px border-b border-[color:var(--client-line)] bg-[color:var(--client-line)] sm:grid-cols-6">
          {steps.map((label, index) => <button aria-current={activeStep === index ? "step" : undefined} className={cn("min-h-14 bg-[color:var(--client-surface)] px-2 py-2 text-[10px] font-black leading-4 text-[color:var(--client-muted)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--client-primary)]", activeStep === index && "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]")} key={label} onClick={() => setActiveStep(index)} type="button"><span className="block font-mono text-[9px] opacity-70">{String(index + 1).padStart(2, "0")}</span>{label}</button>)}
        </nav>

        <div className="p-4 sm:p-5">
          {activeStep === 0 ? <div className="space-y-4"><div><h3 className="text-lg font-black">基本信息</h3><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">让员工和客人都能一眼认出这张卡。</p></div><div className="grid gap-3 sm:grid-cols-2"><TextField label="方案名称" maxLength={120} onChange={(value) => setValue("name", value)} placeholder="例如 青山常客 NDP 卡" value={editor.name} /><label><FieldLabel>卡类型</FieldLabel><select className={field} onChange={(event) => setValue("cardType", event.target.value as CardPlanEditor["cardType"])} value={editor.cardType}><option value="benefit">权益卡</option><option value="stored_value">储值卡</option><option value="count">次数卡</option></select></label></div><label className="block"><FieldLabel>面向员工的方案说明</FieldLabel><textarea className={cn(field, "min-h-24 py-3")} maxLength={500} onChange={(event) => setValue("description", event.target.value)} value={editor.description} /></label><div className="grid gap-3 sm:grid-cols-2"><label><FieldLabel>有效期</FieldLabel><select className={field} onChange={(event) => setValue("validityMode", event.target.value as CardPlanEditor["validityMode"])} value={editor.validityMode}><option value="never">长期有效</option><option value="fixed_days">发卡后固定天数</option><option value="fixed_date">统一截止日期</option></select></label>{editor.validityMode === "fixed_days" ? <TextField inputMode="numeric" label="有效天数" onChange={(value) => setValue("validityDays", value)} value={editor.validityDays} /> : editor.validityMode === "fixed_date" ? <TextField label="截止时间" onChange={(value) => setValue("expiresAt", value)} type="datetime-local" value={editor.expiresAt} /> : null}</div></div> : null}

          {activeStep === 1 ? <div className="space-y-4"><div><h3 className="text-lg font-black">发卡初始值</h3><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">店铺可在线下收款后，按实际金额或次数直接发卡；这里只设允许范围，不会自动增加金额或次数。</p></div>{editor.cardType === "benefit" ? <div className={cn(inset, "p-4 text-sm font-bold text-[color:var(--client-muted)]")}>权益卡没有初始金额或次数。若需要记录金额，请选择储值卡；需要记录服务次数，请选择次数卡。</div> : <div className="grid gap-3 sm:grid-cols-2">{editor.cardType === "stored_value" ? <><TextField inputMode="numeric" label="允许的最小初始金额（JPY）" onChange={(value) => setValue("minInitialPrincipalJpy", value)} value={editor.minInitialPrincipalJpy} /><TextField inputMode="numeric" label="允许的最大初始金额（JPY）" onChange={(value) => setValue("maxInitialPrincipalJpy", value)} value={editor.maxInitialPrincipalJpy} /></> : <><TextField inputMode="numeric" label="允许的最小初始次数" onChange={(value) => setValue("minInitialUses", value)} value={editor.minInitialUses} /><TextField inputMode="numeric" label="允许的最大初始次数" onChange={(value) => setValue("maxInitialUses", value)} value={editor.maxInitialUses} /></>}</div>}<div className={cn(inset, "p-4 text-xs font-semibold leading-5 text-[color:var(--client-muted)]")}>之后店铺若调整余额或次数，必须另行发起变更并由客人在 72 小时内点击同意；该审批流已接入正式数据库、审计与通知。</div></div> : null}

          {activeStep === 2 ? <div className="space-y-4"><div><h3 className="text-lg font-black">基础返点</h3><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">每个方案必须且只能选择一种基础 NDP 返点。</p></div><label><FieldLabel>基础规则</FieldLabel><select className={field} onChange={(event) => setRule(createEmptyRuleEditor(event.target.value as MembershipRewardRuleKind))} value={editor.baseRule.kind}>{cardPlanBaseRuleOptions.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}</select></label><RuleFields editor={editor.baseRule} onChange={setRule} /></div> : null}

          {activeStep === 3 ? <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black">加码规则与上限</h3><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">最多 20 条加码，所有结果只能是 NDP。</p></div>{canManage ? <select aria-label="添加加码规则" className={cn(field, "w-auto max-w-full")} onChange={(event) => { if (!event.target.value) return; setEditor((current) => ({ ...current, bonusRules: [...current.bonusRules, createEmptyRuleEditor(event.target.value as MembershipRewardRuleKind)] })); event.target.value = ""; }} defaultValue=""><option value="">＋ 添加加码</option>{cardPlanBonusRuleOptions.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}</select> : null}</div><div className="space-y-3">{editor.bonusRules.map((rule, index) => <article className={cn(inset, "p-3")} key={rule.id}><div className="mb-3 flex items-center justify-between gap-3"><strong className="text-sm">{cardPlanBonusRuleOptions.find((option) => option.kind === rule.kind)?.label}</strong>{canManage ? <button className="min-h-10 px-3 text-xs font-black text-red-500" onClick={() => setEditor((current) => ({ ...current, bonusRules: current.bonusRules.filter((_, itemIndex) => itemIndex !== index) }))} type="button">移除</button> : null}</div><RuleFields editor={rule} onChange={(next) => setBonusRule(index, next)} /></article>)}{!editor.bonusRules.length ? <div className={cn(inset, "p-5 text-center text-sm font-bold text-[color:var(--client-muted)]")}>暂无加码规则；基础返点仍会正常生效。</div> : null}</div><div><h4 className="mb-2 text-sm font-black">返点上限（留空表示不限）</h4><div className="grid grid-cols-2 gap-3"><TextField inputMode="numeric" label="单次上限 NDP" onChange={(value) => setValue("perOrderNdp", value)} value={editor.perOrderNdp} /><TextField inputMode="numeric" label="每日上限 NDP" onChange={(value) => setValue("perDayNdp", value)} value={editor.perDayNdp} /><TextField inputMode="numeric" label="每月上限 NDP" onChange={(value) => setValue("perMonthNdp", value)} value={editor.perMonthNdp} /><TextField inputMode="numeric" label="卡生命周期上限 NDP" onChange={(value) => setValue("lifetimeNdp", value)} value={editor.lifetimeNdp} /></div></div></div> : null}

          {activeStep === 4 ? <div className="space-y-4"><div><h3 className="text-lg font-black">成本试算</h3><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">使用服务器上的当前费率与规则引擎计算；页面不自行推算财务结果。</p></div><div className="grid gap-3 sm:grid-cols-2"><TextField inputMode="numeric" label="本次合格消费金额（JPY）" onChange={(value) => setScenario((current) => ({ ...current, amount: value }))} value={scenario.amount} /><TextField label="服务分类代码" onChange={(value) => setScenario((current) => ({ ...current, categoryCode: value }))} value={scenario.categoryCode} /><TextField label="服务 UUID" onChange={(value) => setScenario((current) => ({ ...current, servicePublicId: value }))} value={scenario.servicePublicId} /><TextField label="服务时间" onChange={(value) => setScenario((current) => ({ ...current, scheduledAt: value }))} type="datetime-local" value={scenario.scheduledAt} /></div><button className={primaryButton} disabled={busy === "preview"} onClick={() => void runPreview()} type="button">{busy === "preview" ? "试算中" : "服务器试算"}</button><CostFlow preview={preview} /></div> : null}

          {activeStep === 5 ? <div className="space-y-4"><div><h3 className="text-lg font-black">发布确认</h3><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">发布会锁定此版本的规则与当时平台费率。以后修改会生成新草稿，不改写历史版本。</p></div><div className={cn(inset, "grid gap-3 p-4 sm:grid-cols-2")}><div><span className="text-xs font-bold text-[color:var(--client-muted)]">方案</span><strong className="mt-1 block">{editor.name || "未命名"}</strong></div><div><span className="text-xs font-bold text-[color:var(--client-muted)]">规则</span><strong className="mt-1 block">1 条基础 + {editor.bonusRules.length} 条加码</strong></div><div><span className="text-xs font-bold text-[color:var(--client-muted)]">版本状态</span><strong className="mt-1 block">{selectedPlan ? statusLabels[selectedPlan.status] : "尚未保存"}</strong></div><div><span className="text-xs font-bold text-[color:var(--client-muted)]">平台费率</span><strong className="mt-1 block">发布时由服务器写入快照</strong></div></div><CostFlow preview={preview} /><div className="flex flex-wrap gap-2">{canManage ? <button className={secondaryButton} disabled={Boolean(busy)} onClick={() => void save()} type="button">{busy === "save" ? "保存中" : "保存草稿"}</button> : null}{canPublish ? <button className={primaryButton} disabled={Boolean(busy) || !selectedPlan?.draftVersion} onClick={() => void publish()} type="button">{busy === "publish" ? "发布中" : "发布方案"}</button> : null}{canManage && selectedPlan?.status === "active" ? <button className={cn(secondaryButton, "text-red-500")} disabled={Boolean(busy)} onClick={() => void retire()} type="button">停用方案</button> : null}</div></div> : null}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] pt-4"><button className={secondaryButton} disabled={activeStep === 0} onClick={() => setActiveStep((value) => Math.max(0, value - 1))} type="button">上一步</button><div className="flex gap-2">{canManage && activeStep < 5 ? <button className={secondaryButton} disabled={Boolean(busy)} onClick={() => void save()} type="button">{busy === "save" ? "保存中" : "保存草稿"}</button> : null}<button className={primaryButton} disabled={activeStep === 5} onClick={() => setActiveStep((value) => Math.min(5, value + 1))} type="button">下一步</button></div></div>
        </div>
      </section>
    </div> : null}
  </div>;
}
