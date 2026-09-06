import { translateText, type Language } from "../../i18n/translations";
import { serviceReviewSpecialLabelSet } from "../../shared/order-detail/serviceReviewTagCatalog";
import type { ReceivedUserReview } from "./types";

const labels = {
  zh: {
    paymentInfo: "支付信息",
    methodLabel: "支付方式",
    statusLabel: "支付状态",
    onsite: "线下支付",
    bank: "银行转账",
    cash: "现金支付",
    ndp: "NDP 支付",
    other: "其他支付",
    pending: "待支付",
    confirmed: "支付完成",
    refundPending: "退款处理中",
    refunded: "已退款",
    extraTime: "加钟",
    extended: "已加钟",
    noExtension: "未加钟",
    minutes: "分钟",
    special: "特殊标签",
    noSpecial: "未选择特殊标签",
    custom: "自定义标签",
    noCustom: "未填写自定义标签",
    standard: "评价标签",
    notes: "评价备注",
    noNotes: "未填写评价备注",
    bookingNotes: "预约备注",
    noBookingNotes: "未填写预约备注",
    unknownCurrency: "币种未记录",
  },
  "zh-Hant": {
    paymentInfo: "付款資訊",
    methodLabel: "付款方式",
    statusLabel: "付款狀態",
    onsite: "線下付款",
    bank: "銀行轉帳",
    cash: "現金付款",
    ndp: "NDP 付款",
    other: "其他付款",
    pending: "待付款",
    confirmed: "付款完成",
    refundPending: "退款處理中",
    refunded: "已退款",
    extraTime: "加鐘",
    extended: "已加鐘",
    noExtension: "未加鐘",
    minutes: "分鐘",
    special: "特殊標籤",
    noSpecial: "未選擇特殊標籤",
    custom: "自訂標籤",
    noCustom: "未填寫自訂標籤",
    standard: "評價標籤",
    notes: "評價備註",
    noNotes: "未填寫評價備註",
    bookingNotes: "預約備註",
    noBookingNotes: "未填寫預約備註",
    unknownCurrency: "幣別未記錄",
  },
  ja: {
    paymentInfo: "支払い情報",
    methodLabel: "支払い方法",
    statusLabel: "支払い状況",
    onsite: "現地払い",
    bank: "銀行振込",
    cash: "現金払い",
    ndp: "NDP 払い",
    other: "その他の支払い",
    pending: "支払い待ち",
    confirmed: "支払い済み",
    refundPending: "返金手続き中",
    refunded: "返金済み",
    extraTime: "延長",
    extended: "延長あり",
    noExtension: "延長なし",
    minutes: "分",
    special: "特別タグ",
    noSpecial: "特別タグは未選択",
    custom: "カスタムタグ",
    noCustom: "カスタムタグは未入力",
    standard: "評価タグ",
    notes: "評価コメント",
    noNotes: "評価コメントは未入力",
    bookingNotes: "予約メモ",
    noBookingNotes: "予約メモは未入力",
    unknownCurrency: "通貨の記録なし",
  },
  en: {
    paymentInfo: "Payment information",
    methodLabel: "Payment method",
    statusLabel: "Payment status",
    onsite: "Pay on site",
    bank: "Bank transfer",
    cash: "Cash",
    ndp: "NDP payment",
    other: "Other payment",
    pending: "Awaiting payment",
    confirmed: "Paid",
    refundPending: "Refund pending",
    refunded: "Refunded",
    extraTime: "Extra time",
    extended: "Extended",
    noExtension: "No extension",
    minutes: "min",
    special: "Special tags",
    noSpecial: "No special tags selected",
    custom: "Custom tags",
    noCustom: "No custom tags",
    standard: "Review tags",
    notes: "Review notes",
    noNotes: "No review notes",
    bookingNotes: "Booking notes",
    noBookingNotes: "No booking notes",
    unknownCurrency: "Currency not recorded",
  },
  ko: {
    paymentInfo: "결제 정보",
    methodLabel: "결제 방법",
    statusLabel: "결제 상태",
    onsite: "현장 결제",
    bank: "계좌 이체",
    cash: "현금 결제",
    ndp: "NDP 결제",
    other: "기타 결제",
    pending: "결제 대기",
    confirmed: "결제 완료",
    refundPending: "환불 처리 중",
    refunded: "환불 완료",
    extraTime: "시간 연장",
    extended: "연장 있음",
    noExtension: "연장 없음",
    minutes: "분",
    special: "특별 태그",
    noSpecial: "선택한 특별 태그 없음",
    custom: "사용자 지정 태그",
    noCustom: "사용자 지정 태그 없음",
    standard: "평가 태그",
    notes: "평가 메모",
    noNotes: "평가 메모 없음",
    bookingNotes: "예약 메모",
    noBookingNotes: "예약 메모 없음",
    unknownCurrency: "통화 기록 없음",
  },
} satisfies Record<Language, Record<string, string>>;

const standardTags = new Set([
  "punctual",
  "polite",
  "professional",
  "communicative",
  "礼貌友好",
  "准时到达",
  "沟通顺畅",
  "支付顺利",
]);

export function ReceivedReviewFacts({
  review,
  language,
  tagText,
}: {
  review: ReceivedUserReview;
  language: Language;
  tagText: (tag: string, language: Language) => string;
}) {
  const {
    paymentInfo,
    methodLabel,
    statusLabel,
    onsite,
    bank,
    cash,
    ndp,
    other,
    pending,
    confirmed,
    refundPending,
    refunded,
    extraTime,
    extended,
    noExtension,
    minutes,
    special,
    noSpecial,
    custom,
    noCustom,
    standard,
    notes,
    noNotes,
    bookingNotes,
    noBookingNotes,
    unknownCurrency,
  } = labels[language];
  const order = review.order;
  const method = { onsite, bank_transfer: bank, cash, ndp, other }[
    order.paymentMethod
  ];
  const status = {
    pending,
    confirmed,
    refund_pending: refundPending,
    refunded,
  }[order.paymentStatus];
  const paymentMethod =
    order.paymentMethod === "ndp"
      ? order.paymentCurrency === "TEST_NDP"
        ? "Test NDP"
        : order.paymentCurrency === "NDP"
          ? ndp
          : `${ndp} · ${unknownCurrency}`
      : order.paymentMethod === "other" && order.otherPaymentMethod
        ? order.otherPaymentMethod
        : method;
  const specialTags = review.tags.filter((tag) =>
    serviceReviewSpecialLabelSet.has(tag),
  );
  const customTags = review.tags.filter(
    (tag) => !serviceReviewSpecialLabelSet.has(tag) && !standardTags.has(tag),
  );
  const ordinaryTags = review.tags.filter((tag) => standardTags.has(tag));
  const tagGroup = (
    title: string,
    tags: string[],
    empty: string,
    emphasis = false,
  ) => (
    <div className="min-w-0">
      <h4 className="text-xs font-bold text-ink/50">{title}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.length ? (
          tags.map((tag) => (
            <span
              className={
                emphasis
                  ? "break-words rounded-full border border-moss/30 bg-moss/10 px-3 py-1.5 text-xs font-black text-moss"
                  : "break-words rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink/75"
              }
              key={tag}
            >
              {translateText(tagText(tag, language), language)}
            </span>
          ))
        ) : (
          <p className="text-xs text-ink/40">{empty}</p>
        )}
      </div>
    </div>
  );
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <dl
          aria-label={paymentInfo}
          className="grid min-w-0 grid-cols-2 gap-4 rounded-2xl border border-line bg-white p-4"
        >
          <div className="min-w-0">
            <dt className="text-xs font-bold text-ink/50">{methodLabel}</dt>
            <dd className="mt-2 break-words text-sm font-black text-ink">
              {paymentMethod}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-bold text-ink/50">{statusLabel}</dt>
            <dd
              className={`mt-2 text-sm font-black ${order.paymentStatus === "confirmed" ? "text-moss" : order.paymentStatus === "pending" || order.paymentStatus === "refund_pending" ? "text-amber-600" : "text-coral"}`}
            >
              {status}
            </dd>
          </div>
        </dl>
        <dl className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs font-bold text-ink/50">{extraTime}</dt>
          <dd className="mt-2 text-sm font-black text-ink">
            {order.addOnCount > 0 ? (
              <>
                {extended}
                <span className="ml-2 tabular-nums text-moss">
                  +{order.addOnMinutes} {minutes}
                </span>
              </>
            ) : (
              noExtension
            )}
          </dd>
        </dl>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {tagGroup(special, specialTags, noSpecial, true)}
        {tagGroup(custom, customTags, noCustom)}
        {ordinaryTags.length > 0 ? tagGroup(standard, ordinaryTags, "") : null}
      </div>
      <div className="mt-5 space-y-4 border-t border-line pt-4">
        <div>
          <h4 className="text-xs font-bold text-ink/50">{notes}</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-ink/80">
            {review.comment || noNotes}
          </p>
        </div>
        <div>
          <h4 className="text-xs font-bold text-ink/50">{bookingNotes}</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-ink/60">
            {order.note || noBookingNotes}
          </p>
        </div>
      </div>
    </>
  );
}
