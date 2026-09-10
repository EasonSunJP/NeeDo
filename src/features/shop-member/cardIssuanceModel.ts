import type {
  ShopMembershipCardIssuanceRequest,
  ShopMembershipCardIssuanceSource,
  ShopMembershipCardPlan
} from "./api";

export type CardIssuanceEditor = {
  initialValue: string;
  issuanceSource: ShopMembershipCardIssuanceSource;
  issuanceReference: string;
  issuanceNote: string;
};

export type CardIssuanceAttempt = {
  signature: string;
  idempotencyKey: string;
  request: ShopMembershipCardIssuanceRequest;
};

export function createCardIssuanceEditor(): CardIssuanceEditor {
  return { initialValue: "", issuanceSource: "offline_paid", issuanceReference: "", issuanceNote: "" };
}

function publishedVersion(plan: ShopMembershipCardPlan) {
  if (plan.status !== "active" || plan.currentVersion?.status !== "published") throw new Error("plan");
  return plan.currentVersion;
}

function optionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

function parseInitialValue(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("value");
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("value");
  return parsed;
}

function assertRange(value: number, minimum: number | null, maximum: number | null) {
  if ((minimum !== null && value < minimum) || (maximum !== null && value > maximum)) throw new Error("range");
}

export function validateCardIssuance(
  membershipPublicId: string,
  plan: ShopMembershipCardPlan,
  editor: CardIssuanceEditor,
  idempotencyKey: string
): ShopMembershipCardIssuanceRequest {
  if (!membershipPublicId.trim()) throw new Error("membership");
  if (idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 160) throw new Error("idempotency");
  const version = publishedVersion(plan);
  const issuanceReference = optionalText(editor.issuanceReference);
  const issuanceNote = optionalText(editor.issuanceNote);
  if (editor.issuanceSource === "offline_paid" && !issuanceReference && !issuanceNote) throw new Error("source");
  if (editor.issuanceSource !== "offline_paid" && !issuanceNote) throw new Error("source");

  let initialPrincipalJpy: number | null = null;
  let initialUses: number | null = null;
  if (version.cardType === "stored_value") {
    initialPrincipalJpy = parseInitialValue(editor.initialValue);
    assertRange(initialPrincipalJpy, version.issuance.minInitialPrincipalJpy, version.issuance.maxInitialPrincipalJpy);
  } else if (version.cardType === "count") {
    initialUses = parseInitialValue(editor.initialValue);
    assertRange(initialUses, version.issuance.minInitialUses, version.issuance.maxInitialUses);
  } else if (editor.initialValue.trim()) {
    throw new Error("value");
  }

  return {
    planPublicId: plan.publicId,
    initialPrincipalJpy,
    initialUses,
    issuanceSource: editor.issuanceSource,
    issuanceReference,
    issuanceNote,
    idempotencyKey: idempotencyKey.trim()
  };
}

export function buildCardIssuanceAttempt(
  previous: CardIssuanceAttempt | null,
  membershipPublicId: string,
  plan: ShopMembershipCardPlan,
  editor: CardIssuanceEditor,
  createKey: () => string
): CardIssuanceAttempt {
  const provisional = validateCardIssuance(membershipPublicId, plan, editor, createKey());
  const { idempotencyKey: _ignored, ...fingerprintFields } = provisional;
  void _ignored;
  const signature = JSON.stringify({ membershipPublicId, ...fingerprintFields });
  const idempotencyKey = previous?.signature === signature ? previous.idempotencyKey : provisional.idempotencyKey;
  return { signature, idempotencyKey, request: { ...provisional, idempotencyKey } };
}

export function cardIssuanceExpirySummary(plan: ShopMembershipCardPlan, now = new Date()): string {
  const validity = publishedVersion(plan).validity;
  if (validity.mode === "never") return "长期有效";
  if (validity.mode === "fixed_days") return `开卡后 ${validity.days} 天有效`;
  const date = new Date(validity.expiresAt);
  if (Number.isNaN(date.getTime()) || date <= now) return "方案有效期已结束";
  return `有效至 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date)}`;
}

export function cardIssuanceRewardSummary(plan: ShopMembershipCardPlan): string {
  const version = publishedVersion(plan);
  const base = version.rules.find((rule) => rule.ruleGroup === "base");
  let reward = "NDP 返点按方案规则执行";
  if (base?.kind === "fixed_per_completion") reward = `每次服务返 ${base.rewardNdp.toLocaleString()} NDP`;
  if (base?.kind === "percent_of_eligible_amount") reward = `合格消费金额的 ${(base.rewardRateBps / 100).toFixed(2).replace(/\.00$/, "")}% 返 NDP`;
  if (base?.kind === "spend_block") reward = `每满 ¥${base.blockAmountJpy.toLocaleString()} 返 ${base.rewardNdpPerBlock.toLocaleString()} NDP`;
  const fee = version.platformFeeRateBps === null ? "平台费待确认" : `平台费 ${(version.platformFeeRateBps / 100).toFixed(2).replace(/\.00$/, "")}%`;
  return `${reward} · ${fee}`;
}
