import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { usePlatformSettings } from "../../features/platform-settings/PlatformSettingsProvider";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { yen } from "../../lib/utils";
import { MobileBottomActionBar } from "./MobileBottomActionBar";

const copy = {
  amount: { zh: "应付金额", "zh-Hant": "應付金額", ja: "お支払い金額", en: "Amount due", ko: "결제 금액" },
  methods: { zh: "支付方式", "zh-Hant": "付款方式", ja: "支払い方法", en: "Payment", ko: "결제 수단" },
  cash: { zh: "现金", "zh-Hant": "現金", ja: "現金", en: "Cash", ko: "현금" },
  loading: { zh: "读取中", "zh-Hant": "讀取中", ja: "読込中", en: "Loading", ko: "불러오는 중" },
  confirmLater: { zh: "预约时确认", "zh-Hant": "預約時確認", ja: "予約時に確認", en: "Confirm at booking", ko: "예약 시 확인" },
  contact: { zh: "联系", "zh-Hant": "聯絡", ja: "連絡", en: "Contact", ko: "문의" },
  confirm: { zh: "确定预约", "zh-Hant": "預約を確定", ja: "予約を確定", en: "Confirm booking", ko: "예약 확정" }
} satisfies Record<string, Record<Language, string>>;

export function ServiceBookingActionBar({
  amountJpy,
  confirmTo,
  contactTo
}: {
  amountJpy: number;
  confirmTo: string;
  contactTo: string;
}) {
  const { language } = useI18n();
  const platform = usePlatformSettings();
  const paymentLabels = platform.status === "loading"
    ? [copy.loading[language]]
    : platform.status === "ready" && platform.settings.paymentMethods.length > 0
      ? platform.settings.paymentMethods.map((method) => method === "cash" ? copy.cash[language] : "NDP")
      : [copy.confirmLater[language]];

  return (
    <MobileBottomActionBar
      contentClassName="mx-auto w-full max-w-[640px]"
      maskStyle={{ "--client-edge-mask-bottom-height": "calc(env(safe-area-inset-bottom,0px) + 12.5rem)" } as CSSProperties}
    >
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="shrink-0">
          <p className="text-[11px] font-black text-[color:var(--client-muted)]">{copy.amount[language]}</p>
          <strong className="mt-0.5 block text-[26px] font-black leading-none text-[color:var(--client-primary)]">{yen(amountJpy)}</strong>
        </div>
        <div className="min-w-0 text-right">
          <p className="mb-1.5 text-[10px] font-bold text-[color:var(--client-soft-muted)]">{copy.methods[language]}</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {paymentLabels.map((label) => (
              <span className="rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-muted)]" key={label}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(104px,0.38fr)_minmax(0,1fr)] gap-3">
        <Link className="focus-ring flex min-h-12 items-center justify-center rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-sm font-black text-[color:var(--client-text)]" to={contactTo}>
          {copy.contact[language]}
        </Link>
        <Link className="focus-ring flex min-h-12 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_14px_34px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]" to={confirmTo}>
          {copy.confirm[language]}
        </Link>
      </div>
    </MobileBottomActionBar>
  );
}
