export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function hasLocalizedTitleText(value: string) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(value);
}

export function yen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);
}

export function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function shortNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: value > 9999 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(value);
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待确认",
    unpaid: "待支付",
    confirmed: "已确认",
    scheduled: "待服务",
    inService: "服务中",
    completed: "已完成",
    cancelled: "已取消",
    refunding: "退款中",
    refunded: "已退款",
    pendingDispatch: "待派工",
    dispatched: "已派工",
    exception: "异常",
    active: "启用",
    paused: "暂停",
    pendingApproval: "待审核"
  };

  return labels[status] ?? status;
}

export function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: "已支付",
    unpaid: "未支付",
    depositPaid: "定金已支付",
    refunded: "已退款"
  };

  return labels[status] ?? status;
}

export function paymentStatusTone(status: string) {
  const tones: Record<string, "green" | "yellow" | "red" | "blue" | "neutral"> = {
    paid: "green",
    unpaid: "red",
    depositPaid: "blue",
    refunded: "neutral"
  };

  return tones[status] ?? "yellow";
}
