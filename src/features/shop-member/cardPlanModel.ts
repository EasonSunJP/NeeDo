import type {
  MembershipRewardRule,
  MembershipRewardRuleKind,
  MembershipRewardScope,
  ShopMembershipCardPlanDraft,
  ShopMembershipCardPlanVersion,
  ShopMembershipCardType
} from "./api";

export const cardPlanRuleOptions: Array<{ kind: MembershipRewardRuleKind; label: string; group: "base" | "bonus" }> = [
  { kind: "fixed_per_completion", label: "每次完成固定返 NDP", group: "base" },
  { kind: "percent_of_eligible_amount", label: "按合格消费金额比例返 NDP", group: "base" },
  { kind: "spend_block", label: "每满一档消费返 NDP", group: "base" },
  { kind: "first_card_use_bonus", label: "首次使用加返 NDP", group: "bonus" },
  { kind: "service_scope_bonus", label: "指定服务加返 NDP", group: "bonus" },
  { kind: "completion_milestone_bonus", label: "完成次数里程碑返 NDP", group: "bonus" },
  { kind: "spend_milestone_bonus", label: "累计消费里程碑返 NDP", group: "bonus" },
  { kind: "birthday_month_bonus", label: "生日月加返 NDP", group: "bonus" },
  { kind: "schedule_window_bonus", label: "指定时段加返 NDP", group: "bonus" },
  { kind: "consecutive_month_bonus", label: "连续月份加返 NDP", group: "bonus" }
];

export const cardPlanBaseRuleOptions = cardPlanRuleOptions.filter((item) => item.group === "base");
export const cardPlanBonusRuleOptions = cardPlanRuleOptions.filter((item) => item.group === "bonus");

export type CardPlanRuleEditor = {
  id: string;
  kind: MembershipRewardRuleKind;
  rewardNdp: string;
  rewardRatePercent: string;
  blockAmountJpy: string;
  rewardNdpPerBlock: string;
  everyCompletions: string;
  thresholdJpy: string;
  repeat: boolean;
  annualLimit: string;
  consecutiveMonths: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  servicePublicIds: string;
  categoryCodes: string;
  excludedServicePublicIds: string;
  excludedCategoryCodes: string;
  activeFrom: string;
  activeTo: string;
  serviceRewardMode: "fixed" | "percent";
};

export type CardPlanEditor = {
  expectedLockVersion: number;
  name: string;
  description: string;
  cardType: ShopMembershipCardType;
  validityMode: "never" | "fixed_days" | "fixed_date";
  validityDays: string;
  expiresAt: string;
  minInitialPrincipalJpy: string;
  maxInitialPrincipalJpy: string;
  minInitialUses: string;
  maxInitialUses: string;
  perOrderNdp: string;
  perDayNdp: string;
  perMonthNdp: string;
  lifetimeNdp: string;
  baseRule: CardPlanRuleEditor;
  bonusRules: CardPlanRuleEditor[];
};

let editorSequence = 0;

export function createEmptyRuleEditor(kind: MembershipRewardRuleKind): CardPlanRuleEditor {
  editorSequence += 1;
  return {
    id: `rule-${editorSequence}`,
    kind,
    rewardNdp: "",
    rewardRatePercent: "",
    blockAmountJpy: "",
    rewardNdpPerBlock: "",
    everyCompletions: "",
    thresholdJpy: "",
    repeat: false,
    annualLimit: "1",
    consecutiveMonths: "",
    daysOfWeek: "1,2,3,4,5",
    startTime: "09:00",
    endTime: "18:00",
    servicePublicIds: "",
    categoryCodes: "",
    excludedServicePublicIds: "",
    excludedCategoryCodes: "",
    activeFrom: "",
    activeTo: "",
    serviceRewardMode: "fixed"
  };
}

export function createEmptyCardPlanEditor(): CardPlanEditor {
  return {
    expectedLockVersion: 0,
    name: "",
    description: "",
    cardType: "benefit",
    validityMode: "never",
    validityDays: "365",
    expiresAt: "",
    minInitialPrincipalJpy: "",
    maxInitialPrincipalJpy: "",
    minInitialUses: "",
    maxInitialUses: "",
    perOrderNdp: "",
    perDayNdp: "",
    perMonthNdp: "",
    lifetimeNdp: "",
    baseRule: createEmptyRuleEditor("fixed_per_completion"),
    bonusRules: []
  };
}

export function parsePercentageToBps(value: string): number {
  const normalized = value.trim();
  if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(normalized)) throw new Error("percentage");
  const [whole, fraction = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("percentage");
  return bps;
}

function optionalInteger(value: string, field: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) throw new Error(field);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(field);
  return parsed;
}

function positiveInteger(value: string, field: string): number {
  const parsed = optionalInteger(value, field);
  if (parsed === null || parsed <= 0) throw new Error(field);
  return parsed;
}

function requiredInteger(value: string, field: string): number {
  const parsed = optionalInteger(value, field);
  if (parsed === null) throw new Error(field);
  return parsed;
}

function csv(value: string): string[] {
  return [...new Set(value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function isoOrNull(value: string, field: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(field);
  return date.toISOString();
}

function scopeFromEditor(rule: CardPlanRuleEditor): MembershipRewardScope {
  const servicePublicIds = csv(rule.servicePublicIds);
  const excludedServicePublicIds = csv(rule.excludedServicePublicIds);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if ([...servicePublicIds, ...excludedServicePublicIds].some((value) => !uuid.test(value))) throw new Error("scope");
  return {
    servicePublicIds,
    categoryCodes: csv(rule.categoryCodes),
    excludedServicePublicIds,
    excludedCategoryCodes: csv(rule.excludedCategoryCodes),
    activeFrom: isoOrNull(rule.activeFrom, "scope"),
    activeTo: isoOrNull(rule.activeTo, "scope")
  };
}

function ruleFromEditor(editor: CardPlanRuleEditor): MembershipRewardRule {
  const scope = scopeFromEditor(editor);
  switch (editor.kind) {
    case "fixed_per_completion": return { kind: editor.kind, rewardNdp: requiredInteger(editor.rewardNdp, "reward"), scope };
    case "percent_of_eligible_amount": return { kind: editor.kind, rewardRateBps: parsePercentageToBps(editor.rewardRatePercent), scope };
    case "spend_block": return { kind: editor.kind, blockAmountJpy: positiveInteger(editor.blockAmountJpy, "reward"), rewardNdpPerBlock: requiredInteger(editor.rewardNdpPerBlock, "reward"), scope };
    case "first_card_use_bonus": return { kind: editor.kind, rewardNdp: requiredInteger(editor.rewardNdp, "reward"), scope };
    case "service_scope_bonus": return editor.serviceRewardMode === "fixed"
      ? { kind: editor.kind, rewardNdp: positiveInteger(editor.rewardNdp, "reward"), rewardRateBps: null, scope }
      : { kind: editor.kind, rewardNdp: null, rewardRateBps: parsePercentageToBps(editor.rewardRatePercent), scope };
    case "completion_milestone_bonus": return { kind: editor.kind, everyCompletions: positiveInteger(editor.everyCompletions, "reward"), rewardNdp: requiredInteger(editor.rewardNdp, "reward"), repeat: editor.repeat, scope };
    case "spend_milestone_bonus": return { kind: editor.kind, thresholdJpy: positiveInteger(editor.thresholdJpy, "reward"), rewardNdp: requiredInteger(editor.rewardNdp, "reward"), repeat: editor.repeat, scope };
    case "birthday_month_bonus": return { kind: editor.kind, rewardNdp: requiredInteger(editor.rewardNdp, "reward"), annualLimit: positiveInteger(editor.annualLimit, "reward"), scope };
    case "schedule_window_bonus": {
      const daysOfWeek = csv(editor.daysOfWeek).map((value) => Number(value));
      if (!daysOfWeek.length || daysOfWeek.some((value) => !Number.isInteger(value) || value < 0 || value > 6)) throw new Error("schedule");
      return { kind: editor.kind, rewardNdp: requiredInteger(editor.rewardNdp, "reward"), timezone: "Asia/Tokyo", daysOfWeek, startTime: editor.startTime, endTime: editor.endTime, scope };
    }
    case "consecutive_month_bonus": return { kind: editor.kind, consecutiveMonths: positiveInteger(editor.consecutiveMonths, "reward"), rewardNdp: requiredInteger(editor.rewardNdp, "reward"), scope };
  }
}

export function validateCardPlanDraft(editor: CardPlanEditor): ShopMembershipCardPlanDraft {
  const name = editor.name.trim();
  if (!name || name.length > 120 || editor.description.trim().length > 500) throw new Error("basic");
  const principal = [optionalInteger(editor.minInitialPrincipalJpy, "issuance"), optionalInteger(editor.maxInitialPrincipalJpy, "issuance")] as const;
  const uses = [optionalInteger(editor.minInitialUses, "issuance"), optionalInteger(editor.maxInitialUses, "issuance")] as const;
  if (editor.cardType === "benefit" && [...principal, ...uses].some((value) => value !== null)) throw new Error("issuance");
  if (editor.cardType === "stored_value" && uses.some((value) => value !== null)) throw new Error("issuance");
  if (editor.cardType === "count" && principal.some((value) => value !== null)) throw new Error("issuance");
  if (principal[0] !== null && principal[1] !== null && principal[0] > principal[1]) throw new Error("issuance");
  if (uses[0] !== null && uses[1] !== null && uses[0] > uses[1]) throw new Error("issuance");
  const validity = editor.validityMode === "never"
    ? { mode: "never" as const }
    : editor.validityMode === "fixed_days"
      ? { mode: "fixed_days" as const, days: positiveInteger(editor.validityDays, "validity") }
      : { mode: "fixed_date" as const, expiresAt: isoOrNull(editor.expiresAt, "validity") ?? (() => { throw new Error("validity"); })() };
  return {
    expectedLockVersion: editor.expectedLockVersion,
    name,
    description: editor.description.trim() || null,
    cardType: editor.cardType,
    validity,
    issuance: { minInitialPrincipalJpy: principal[0], maxInitialPrincipalJpy: principal[1], minInitialUses: uses[0], maxInitialUses: uses[1] },
    caps: {
      perOrderNdp: optionalInteger(editor.perOrderNdp, "caps"),
      perDayNdp: optionalInteger(editor.perDayNdp, "caps"),
      perMonthNdp: optionalInteger(editor.perMonthNdp, "caps"),
      lifetimeNdp: optionalInteger(editor.lifetimeNdp, "caps")
    },
    rules: [ruleFromEditor(editor.baseRule), ...editor.bonusRules.map(ruleFromEditor)]
  };
}

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function percentFromBps(value: number): string {
  return (value / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function editorFromRule(rule: ShopMembershipCardPlanVersion["rules"][number]): CardPlanRuleEditor {
  const editor = createEmptyRuleEditor(rule.kind);
  const scope = rule.scope;
  Object.assign(editor, {
    servicePublicIds: scope.servicePublicIds.join(", "), categoryCodes: scope.categoryCodes.join(", "),
    excludedServicePublicIds: scope.excludedServicePublicIds.join(", "), excludedCategoryCodes: scope.excludedCategoryCodes.join(", "),
    activeFrom: localDateTime(scope.activeFrom), activeTo: localDateTime(scope.activeTo)
  });
  if ("rewardNdp" in rule && typeof rule.rewardNdp === "number") editor.rewardNdp = String(rule.rewardNdp);
  if ("rewardRateBps" in rule && typeof rule.rewardRateBps === "number") { editor.rewardRatePercent = percentFromBps(rule.rewardRateBps); editor.serviceRewardMode = "percent"; }
  if (rule.kind === "spend_block") { editor.blockAmountJpy = String(rule.blockAmountJpy); editor.rewardNdpPerBlock = String(rule.rewardNdpPerBlock); }
  if (rule.kind === "completion_milestone_bonus") { editor.everyCompletions = String(rule.everyCompletions); editor.repeat = rule.repeat; }
  if (rule.kind === "spend_milestone_bonus") { editor.thresholdJpy = String(rule.thresholdJpy); editor.repeat = rule.repeat; }
  if (rule.kind === "birthday_month_bonus") editor.annualLimit = String(rule.annualLimit);
  if (rule.kind === "schedule_window_bonus") { editor.daysOfWeek = rule.daysOfWeek.join(","); editor.startTime = rule.startTime; editor.endTime = rule.endTime; }
  if (rule.kind === "consecutive_month_bonus") editor.consecutiveMonths = String(rule.consecutiveMonths);
  return editor;
}

export function cardPlanVersionToEditor(version: ShopMembershipCardPlanVersion): CardPlanEditor {
  const rules = [...version.rules].sort((left, right) => left.sortOrder - right.sortOrder);
  const base = rules.find((rule) => rule.ruleGroup === "base");
  if (!base) throw new Error("base_rule");
  return {
    ...createEmptyCardPlanEditor(),
    expectedLockVersion: version.lockVersion,
    name: version.name,
    description: version.description ?? "",
    cardType: version.cardType,
    validityMode: version.validity.mode,
    validityDays: version.validity.mode === "fixed_days" ? String(version.validity.days) : "365",
    expiresAt: version.validity.mode === "fixed_date" ? localDateTime(version.validity.expiresAt) : "",
    minInitialPrincipalJpy: version.issuance.minInitialPrincipalJpy?.toString() ?? "",
    maxInitialPrincipalJpy: version.issuance.maxInitialPrincipalJpy?.toString() ?? "",
    minInitialUses: version.issuance.minInitialUses?.toString() ?? "",
    maxInitialUses: version.issuance.maxInitialUses?.toString() ?? "",
    perOrderNdp: version.caps.perOrderNdp?.toString() ?? "",
    perDayNdp: version.caps.perDayNdp?.toString() ?? "",
    perMonthNdp: version.caps.perMonthNdp?.toString() ?? "",
    lifetimeNdp: version.caps.lifetimeNdp?.toString() ?? "",
    baseRule: editorFromRule(base),
    bonusRules: rules.filter((rule) => rule.ruleGroup === "bonus").map(editorFromRule)
  };
}
