import { ApiClientError } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";

type MessageKey =
  | "validation"
  | "verificationCodeInvalid"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "invalidTransition"
  | "serviceStartTooEarly"
  | "serviceEndTooEarly"
  | "exchangeCancellationRequired"
  | "paymentInvalidState"
  | "paymentAmountMismatch"
  | "paymentConflict"
  | "walletConflict"
  | "scheduleConflict"
  | "acceptancePaused"
  | "platformFeeConfirmationRequired"
  | "platformFeePreviewStale"
  | "platformFeeConfirmationConflict"
  | "conflict"
  | "timeout"
  | "identityUnavailable"
  | "accountWalletUnavailable"
  | "server"
  | "fallback";

const copy: Record<Language, Record<MessageKey, string>> = {
  zh: {
    validation: "提交内容不符合要求，请检查后重试",
    verificationCodeInvalid: "服务验证码错误，请向用户重新确认",
    unauthorized: "登录状态已失效，请重新登录",
    forbidden: "当前身份没有处理该订单的权限",
    notFound: "订单不存在或已不可见",
    invalidTransition: "订单状态已经变化，请重新加载后再操作",
    serviceStartTooEarly: "尚未到可开始服务时间",
    serviceEndTooEarly: "尚未到预计结束时间",
    exchangeCancellationRequired: "该订单必须通过 NeeDo Exchange 双方取消流程处理",
    paymentInvalidState: "当前支付状态不允许执行此操作",
    paymentAmountMismatch: "收款金额与订单金额不一致，请重新核对",
    paymentConflict: "支付记录已经变化，请重新加载后再操作",
    walletConflict: "NDP 账本状态异常，订单未发生部分变更，请联系运营核对账本",
    scheduleConflict: "技师时间已冲突，当前订单无法确认",
    acceptancePaused: "当前主体已暂停接单，暂时无法确认订单",
    platformFeeConfirmationRequired: "平台费余额不足，需要明确确认后才能接单",
    platformFeePreviewStale: "平台费余额或规则已变化，请重新读取后确认",
    platformFeeConfirmationConflict: "本次余额不足确认已被其他订单使用，请重新确认",
    conflict: "订单操作发生冲突，请重新加载后重试或联系运营",
    timeout: "网络响应超时，请稍后重试",
    identityUnavailable: "身份服务暂时不可用，请稍后重试",
    accountWalletUnavailable: "账户或 NDP 钱包不可用，请重登",
    server: "订单服务暂时不可用，请稍后重试",
    fallback: "订单操作失败，请检查网络后重试"
  },
  "zh-Hant": {
    validation: "提交內容不符合要求，請檢查後重試",
    verificationCodeInvalid: "服務驗證碼錯誤，請向用戶重新確認",
    unauthorized: "登入狀態已失效，請重新登入",
    forbidden: "目前身分沒有處理此訂單的權限",
    notFound: "訂單不存在或已不可見",
    invalidTransition: "訂單狀態已變更，請重新載入後再操作",
    serviceStartTooEarly: "尚未到可開始服務時間",
    serviceEndTooEarly: "尚未到預計結束時間",
    exchangeCancellationRequired: "此訂單必須透過 NeeDo Exchange 雙方取消流程處理",
    paymentInvalidState: "目前付款狀態不允許執行此操作",
    paymentAmountMismatch: "收款金額與訂單金額不一致，請重新核對",
    paymentConflict: "付款紀錄已變更，請重新載入後再操作",
    walletConflict: "NDP 帳本狀態異常，訂單未發生部分變更，請聯絡營運核對帳本",
    scheduleConflict: "技師時間已衝突，目前訂單無法確認",
    acceptancePaused: "目前主體已暫停接單，暫時無法確認訂單",
    platformFeeConfirmationRequired: "平台費餘額不足，需要明確確認後才能接單",
    platformFeePreviewStale: "平台費餘額或規則已變更，請重新讀取後確認",
    platformFeeConfirmationConflict: "本次餘額不足確認已被其他訂單使用，請重新確認",
    conflict: "訂單操作發生衝突，請重新載入後重試或聯絡營運",
    timeout: "網路回應逾時，請稍後重試",
    identityUnavailable: "身分服務暫時無法使用，請稍後再試",
    accountWalletUnavailable: "帳戶或 NDP 錢包無法使用，請重登",
    server: "訂單服務暫時無法使用，請稍後重試",
    fallback: "訂單操作失敗，請檢查網路後重試"
  },
  ja: {
    validation: "入力内容が要件を満たしていません。確認してから再試行してください",
    verificationCodeInvalid: "サービス認証コードが正しくありません。ユーザーに再確認してください",
    unauthorized: "ログインの有効期限が切れました。再度ログインしてください",
    forbidden: "現在の権限ではこの注文を操作できません",
    notFound: "注文が存在しないか、表示できなくなりました",
    invalidTransition: "注文状態が更新されています。再読み込みしてから操作してください",
    serviceStartTooEarly: "サービス開始可能時刻前です",
    serviceEndTooEarly: "予定終了時刻前です",
    exchangeCancellationRequired: "この注文は NeeDo Exchange の双方キャンセル手続きが必要です",
    paymentInvalidState: "現在の支払い状態ではこの操作を実行できません",
    paymentAmountMismatch: "受取金額が注文金額と一致しません。再確認してください",
    paymentConflict: "支払い記録が更新されています。再読み込みしてから操作してください",
    walletConflict:
      "NDP台帳の状態に異常があります。注文には一部変更が保存されていません。運営に台帳確認を依頼してください",
    scheduleConflict: "担当者の時間が重複しているため、この注文を確定できません",
    acceptancePaused: "現在この対象は受注停止中のため、注文を確定できません",
    platformFeeConfirmationRequired: "プラットフォーム利用料の残高が不足しています。受注には明示的な確認が必要です",
    platformFeePreviewStale: "プラットフォーム利用料の残高またはルールが更新されました。再確認してください",
    platformFeeConfirmationConflict: "この残高不足確認は別の注文で使用されています。もう一度確認してください",
    conflict: "注文操作が競合しました。再読み込み後に再試行するか、運営へ連絡してください",
    timeout: "通信がタイムアウトしました。しばらくしてから再試行してください",
    identityUnavailable: "認証サービスを一時的に利用できません。しばらくしてから再試行してください",
    accountWalletUnavailable: "アカウントかNDPウォレットを利用できません。再ログインしてください",
    server: "注文サービスを一時的に利用できません。しばらくしてから再試行してください",
    fallback: "注文操作に失敗しました。通信状況を確認して再試行してください"
  },
  en: {
    validation: "The submitted information is invalid. Check it and try again",
    verificationCodeInvalid: "The service verification code is incorrect. Confirm it with the customer",
    unauthorized: "Your session has expired. Sign in again",
    forbidden: "The current identity cannot manage this order",
    notFound: "The order does not exist or is no longer visible",
    invalidTransition: "The order status has changed. Reload it before trying again",
    serviceStartTooEarly: "The service cannot start yet",
    serviceEndTooEarly: "The scheduled end time has not arrived",
    exchangeCancellationRequired: "This order must use the bilateral NeeDo Exchange cancellation flow",
    paymentInvalidState: "The current payment status does not allow this action",
    paymentAmountMismatch: "The received amount does not match the order total. Check it again",
    paymentConflict: "The payment record has changed. Reload it before trying again",
    walletConflict:
      "The NDP ledger is inconsistent. No partial order change was saved; ask operations to reconcile the ledger",
    scheduleConflict: "The technician has a schedule conflict, so this order cannot be confirmed",
    acceptancePaused: "Order acceptance is paused for this subject, so the order cannot be confirmed",
    platformFeeConfirmationRequired: "The platform-fee balance is insufficient. Explicit confirmation is required",
    platformFeePreviewStale: "The platform-fee balance or rule changed. Reload it before confirming",
    platformFeeConfirmationConflict: "This insufficient-balance confirmation was used by another order. Confirm again",
    conflict: "The order action conflicted. Reload and retry, or contact operations",
    timeout: "The network request timed out. Try again later",
    identityUnavailable: "The identity service is temporarily unavailable. Try again later",
    accountWalletUnavailable: "Account or NDP wallet unavailable. Sign in",
    server: "The order service is temporarily unavailable. Try again later",
    fallback: "The order action failed. Check your network and try again"
  },
  ko: {
    validation: "제출 내용이 요구 사항에 맞지 않습니다. 확인한 뒤 다시 시도해 주세요",
    verificationCodeInvalid: "서비스 인증 코드가 올바르지 않습니다. 고객에게 다시 확인하세요",
    unauthorized: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요",
    forbidden: "현재 권한으로는 이 주문을 처리할 수 없습니다",
    notFound: "주문이 없거나 더 이상 표시할 수 없습니다",
    invalidTransition: "주문 상태가 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요",
    serviceStartTooEarly: "아직 서비스를 시작할 수 있는 시간이 아닙니다",
    serviceEndTooEarly: "아직 예정 종료 시간이 되지 않았습니다",
    exchangeCancellationRequired: "이 주문은 NeeDo Exchange 양측 취소 절차로 처리해야 합니다",
    paymentInvalidState: "현재 결제 상태에서는 이 작업을 실행할 수 없습니다",
    paymentAmountMismatch: "수납 금액이 주문 금액과 일치하지 않습니다. 다시 확인해 주세요",
    paymentConflict: "결제 기록이 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요",
    walletConflict: "NDP 원장 상태가 비정상입니다. 주문에는 일부 변경이 저장되지 않았습니다. 운영팀에 원장 확인을 요청해 주세요",
    scheduleConflict: "담당자 일정이 겹쳐 현재 주문을 확정할 수 없습니다",
    acceptancePaused: "현재 이 대상은 주문 접수가 중지되어 주문을 확정할 수 없습니다",
    platformFeeConfirmationRequired: "플랫폼 수수료 잔액이 부족합니다. 주문 수락에는 명시적 확인이 필요합니다",
    platformFeePreviewStale: "플랫폼 수수료 잔액 또는 규칙이 변경되었습니다. 다시 확인해 주세요",
    platformFeeConfirmationConflict: "이 잔액 부족 확인이 다른 주문에 사용되었습니다. 다시 확인해 주세요",
    conflict: "주문 작업이 충돌했습니다. 새로고침 후 다시 시도하거나 운영팀에 문의해 주세요",
    timeout: "네트워크 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요",
    identityUnavailable: "인증 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요",
    accountWalletUnavailable: "계정 또는 NDP 지갑을 사용할 수 없습니다. 다시 로그인하세요",
    server: "주문 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요",
    fallback: "주문 작업에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요"
  }
};

const conflictMessageKeys: Partial<Record<string, MessageKey>> = {
  "error.order.invalid_transition": "invalidTransition",
  "error.order.service_start_too_early": "serviceStartTooEarly",
  "error.order.service_end_too_early": "serviceEndTooEarly",
  "error.exchange.match_cancellation_required": "exchangeCancellationRequired",
  "error.payment.invalid_state": "paymentInvalidState",
  "error.payment.amount_mismatch": "paymentAmountMismatch",
  "error.payment.conflict": "paymentConflict",
  "error.wallet.insufficient_frozen": "walletConflict",
  "error.wallet.insufficient_available": "walletConflict",
  "error.wallet.mutation_failed": "walletConflict",
  "error.schedule.conflict": "scheduleConflict",
  "error.order.acceptance_paused": "acceptancePaused",
  "error.platform_fee.insufficient_balance_confirmation_required":
    "platformFeeConfirmationRequired",
  "error.platform_fee.preview_stale": "platformFeePreviewStale",
  "error.platform_fee.confirmation_conflict": "platformFeeConfirmationConflict"
};

export function describeBookingOrderMutationError(
  error: unknown,
  language: Language
): string {
  const messages = copy[language];
  if (!(error instanceof ApiClientError)) {
    return messages.fallback;
  }
  if (error.status === 400) {
    return error.message === "error.order.verification_code_invalid"
      ? messages.verificationCodeInvalid
      : messages.validation;
  }
  if (error.status === 401) return messages.unauthorized;
  if (error.status === 403) return messages.forbidden;
  if (
    error.message === "error.user.not_found" ||
    error.message === "error.wallet.not_found"
  ) {
    return messages.accountWalletUnavailable;
  }
  if (error.status === 404) return messages.notFound;
  if (error.status === 408 || error.message === "error.network.timeout") return messages.timeout;
  if (
    error.message === "error.dependency.redis_unavailable" ||
    error.message === "error.dependency.auth_generation_unavailable" ||
    error.message === "error.auth.service_unavailable"
  ) {
    return messages.identityUnavailable;
  }
  if (error.status === 409) {
    return messages[conflictMessageKeys[error.message] ?? "conflict"];
  }
  if (error.status >= 500) return messages.server;
  return messages.fallback;
}
