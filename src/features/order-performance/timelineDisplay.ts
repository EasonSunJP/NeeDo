import { translateText, type Language } from "../../i18n/translations";

export type OrderTimelineAudience = "customer" | "technician" | "merchant";
export type OrderTimelineActorSource = "customer" | "merchant" | "technician" | "platform" | "system";

type PerformanceTimelineEventType =
  | "TECHNICIAN_CANCEL_CLASSIFIED"
  | "TECHNICIAN_UNCOMPLETED_CLASSIFIED"
  | "SPECIAL_CANCELLATION_APPLIED"
  | "SPECIAL_CANCELLATION_REVOKED";

const statusMessages: Readonly<Record<string, string>> = {
  pending: "预约待确认",
  confirmed: "预约已确认",
  inService: "服务已开始",
  awaitingCheckout: "等待结账",
  awaitingPaymentConfirmation: "等待确认收款",
  completed: "服务已完成",
  cancelled: "预约已取消"
};

const performanceMessages: Readonly<Record<PerformanceTimelineEventType, {
  fallback: string;
  label: string;
  tone: "green" | "red";
}>> = {
  TECHNICIAN_CANCEL_CLASSIFIED: {
    label: "技师原因取消",
    fallback: "已计入技师原因取消记录",
    tone: "red"
  },
  TECHNICIAN_UNCOMPLETED_CLASSIFIED: {
    label: "技师未完单",
    fallback: "已计入技师未完单记录",
    tone: "red"
  },
  SPECIAL_CANCELLATION_APPLIED: {
    label: "特殊取消已生效",
    fallback: "本单已从接单率计算中排除",
    tone: "green"
  },
  SPECIAL_CANCELLATION_REVOKED: {
    label: "特殊取消已撤销",
    fallback: "本单已恢复计入接单率计算",
    tone: "red"
  }
};

export function orderTimelineText(source: string, language: Language) {
  return translateText(source, language);
}

export function orderStatusTimelineMessage(status: string, language: Language) {
  return orderTimelineText(statusMessages[status] ?? "订单状态已更新", language);
}

export function performanceTimelineDisplay(type: PerformanceTimelineEventType, language: Language) {
  const copy = performanceMessages[type];
  return {
    label: orderTimelineText(copy.label, language),
    message: orderTimelineText(copy.fallback, language),
    tone: copy.tone
  };
}

export function orderTimelineActorName(name: string | null | undefined, language: Language) {
  const normalized = name?.trim() ?? "";
  if (!normalized || /^#?\d+$/u.test(normalized) || normalized === "NeeDo系统" || normalized === "NeeDo 系统") {
    return orderTimelineText("NeeDo 系统", language);
  }
  return normalized;
}

export function orderTimelineActorRole(
  source: OrderTimelineActorSource | null | undefined,
  language: Language
) {
  const labels: Record<OrderTimelineActorSource, Record<Language, string>> = {
    customer: { zh: "用户", "zh-Hant": "使用者", ja: "ユーザー", en: "Customer", ko: "사용자" },
    merchant: { zh: "店铺/商户", "zh-Hant": "店鋪/商戶", ja: "店舗/加盟店", en: "Shop/Merchant", ko: "매장/판매자" },
    technician: { zh: "担当技师", "zh-Hant": "擔當技師", ja: "担当スタッフ", en: "Assigned technician", ko: "담당 기술자" },
    platform: { zh: "平台运营", "zh-Hant": "平台營運", ja: "プラットフォーム運営", en: "Platform operations", ko: "플랫폼 운영" },
    system: { zh: "NeeDo 系统", "zh-Hant": "NeeDo 系統", ja: "NeeDo システム", en: "NeeDo system", ko: "NeeDo 시스템" }
  };
  return labels[source ?? "system"][language];
}

export function orderCancellationTimelineMessage(input: {
  actorSource: OrderTimelineActorSource | null | undefined;
  startsAt: string;
  serviceName: string;
  shopName: string;
  reason: string | null;
  language: Language;
}) {
  const at = formatOrderTimelineDate(input.startsAt, input.language);
  const reason = input.reason ?? (() => {
    if (input.language === "ja") return input.actorSource === "merchant" ? "店舗がキャンセル理由を入力していません" : "キャンセル理由が入力されていません";
    if (input.language === "en") return input.actorSource === "merchant" ? "The shop did not provide a cancellation reason" : "No cancellation reason was provided";
    if (input.language === "ko") return input.actorSource === "merchant" ? "매장에서 취소 사유를 입력하지 않았습니다" : "취소 사유가 입력되지 않았습니다";
    if (input.language === "zh-Hant") return input.actorSource === "merchant" ? "店鋪未填寫取消原因" : "未填寫取消原因";
    return input.actorSource === "merchant" ? "店铺未填写取消原因" : "未填写取消原因";
  })();
  if (input.language === "ja") return `${at} · ${input.serviceName} · ${input.shopName} · 理由：${reason}`;
  if (input.language === "en") return `${at} · ${input.serviceName} · ${input.shopName} · Reason: ${reason}`;
  if (input.language === "ko") return `${at} · ${input.serviceName} · ${input.shopName} · 사유: ${reason}`;
  if (input.language === "zh-Hant") return `${at} · ${input.serviceName} · ${input.shopName} · 原因：${reason}`;
  return `${at} · ${input.serviceName} · ${input.shopName} · 原因：${reason}`;
}

export function displayablePublicBusinessReason(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (/^#?\d+$/u.test(normalized)) return null;
  if (/^(?:created|service_started|service_ended|checkout_[a-z0-9_]+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)$/iu.test(normalized)) {
    return null;
  }
  if (/(?:\bqa[-_\s]*\d|\b(?:debug|fixture|payload)\b|调试|測試編號|测试编号)/iu.test(normalized)) {
    return null;
  }
  return normalized;
}

export function formatOrderTimelineDate(value: string, language: Language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const locales: Readonly<Record<Language, string>> = {
    zh: "zh-CN",
    "zh-Hant": "zh-Hant",
    ja: "ja-JP",
    en: "en-US",
    ko: "ko-KR"
  };
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatOrderTimelineDuration(minutes: number, language: Language) {
  if (language === "zh") return `+${minutes}分钟`;
  if (language === "zh-Hant") return `+${minutes} 分鐘`;
  if (language === "ja") return `+${minutes}分`;
  if (language === "en") return `+${minutes} min`;
  return `+${minutes}분`;
}
