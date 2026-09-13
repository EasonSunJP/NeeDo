import type { Language } from "../../i18n/translations";

const copy = {
  zh: {
    title: "退款争议审核",
    description: "仅展示已正式投诉的退款争议；案件、责任、金额和版本均来自正式退款 API。裁定继续由后端执行 RBAC、状态机、幂等与审计校验。",
    canResolve: "可裁定", readOnly: "只读", disputeStatus: "争议状态", open: "待裁定", resolved: "已裁定",
    searchLabel: "搜索退款争议", searchPlaceholder: "订单号、店铺、用户 NeeDoID", search: "搜索",
    loading: "正在加载正式退款争议", loadFailed: "退款争议加载失败", reload: "重新加载",
    empty: "当前没有符合条件的正式退款争议", orderNo: "订单编号", shop: "店铺", customer: "用户",
    refundAmount: "退款金额", complaintReason: "投诉原因", review: "审核", paginationLabel: "退款争议分页",
    detailTitle: "退款争议详情", caseId: "案件编号", requestReason: "退款申请理由", merchantNote: "商户处理说明",
    responsibility: "责任归属", shopResponsible: "店铺", affiliateReward: "联盟奖励", disputeVersion: "争议版本",
    resolutionTitle: "裁定退款争议", publicReason: "公开裁定理由", internalNote: "内部备注",
    validation: "公开裁定理由至少填写 2 个字符", versionConflict: "案件版本已经变化，填写内容已保留，请刷新最新数据后重新确认",
    resolveFailed: "退款争议裁定失败，请核对权限和案件状态后重试", resolveRefund: "裁定退款",
    confirmResolveRefund: "再次点击确认裁定退款", rejectRefund: "驳回退款", confirmRejectRefund: "再次点击确认驳回退款",
    readOnlyNotice: "当前账号仅可读取争议，不能提交裁定。", none: "无", settledRewardSuffix: "NDP · 已结算（不会撤回）",
    serverTotal: "服务器共", records: "条", page: "第", of: "/", previous: "上一页", next: "下一页"
  },
  "zh-Hant": {
    title: "退款爭議審核",
    description: "僅展示已正式投訴的退款爭議；案件、責任、金額和版本均來自正式退款 API。裁定繼續由後端執行 RBAC、狀態機、冪等與審計校驗。",
    canResolve: "可裁定", readOnly: "唯讀", disputeStatus: "爭議狀態", open: "待裁定", resolved: "已裁定",
    searchLabel: "搜尋退款爭議", searchPlaceholder: "訂單號、店鋪、用戶 NeeDoID", search: "搜尋",
    loading: "正在載入正式退款爭議", loadFailed: "退款爭議載入失敗", reload: "重新載入",
    empty: "目前沒有符合條件的正式退款爭議", orderNo: "訂單編號", shop: "店鋪", customer: "用戶",
    refundAmount: "退款金額", complaintReason: "投訴原因", review: "審核", paginationLabel: "退款爭議分頁",
    detailTitle: "退款爭議詳情", caseId: "案件編號", requestReason: "退款申請理由", merchantNote: "商戶處理說明",
    responsibility: "責任歸屬", shopResponsible: "店鋪", affiliateReward: "聯盟獎勵", disputeVersion: "爭議版本",
    resolutionTitle: "裁定退款爭議", publicReason: "公開裁定理由", internalNote: "內部備註",
    validation: "公開裁定理由至少填寫 2 個字元", versionConflict: "案件版本已變更，填寫內容已保留，請重新整理最新資料後再次確認",
    resolveFailed: "退款爭議裁定失敗，請核對權限和案件狀態後重試", resolveRefund: "裁定退款",
    confirmResolveRefund: "再次點擊確認裁定退款", rejectRefund: "駁回退款", confirmRejectRefund: "再次點擊確認駁回退款",
    readOnlyNotice: "目前帳號僅可讀取爭議，不能提交裁定。", none: "無", settledRewardSuffix: "NDP · 已結算（不會撤回）",
    serverTotal: "伺服器共", records: "條", page: "第", of: "/", previous: "上一頁", next: "下一頁"
  },
  ja: {
    title: "返金紛争審査",
    description: "正式に申し立てられた返金紛争のみを表示します。案件、責任、金額、バージョンは正式な返金 API から取得し、裁定時もバックエンドで RBAC、状態遷移、冪等性、監査を検証します。",
    canResolve: "裁定可能", readOnly: "閲覧のみ", disputeStatus: "紛争状態", open: "裁定待ち", resolved: "裁定済み",
    searchLabel: "返金紛争を検索", searchPlaceholder: "注文番号、店舗、ユーザー NeeDoID", search: "検索",
    loading: "正式な返金紛争を読み込み中", loadFailed: "返金紛争の読み込みに失敗しました", reload: "再読み込み",
    empty: "条件に一致する正式な返金紛争はありません", orderNo: "注文番号", shop: "店舗", customer: "ユーザー",
    refundAmount: "返金額", complaintReason: "申立理由", review: "審査", paginationLabel: "返金紛争のページ",
    detailTitle: "返金紛争の詳細", caseId: "案件番号", requestReason: "返金申請理由", merchantNote: "加盟店の対応説明",
    responsibility: "責任区分", shopResponsible: "店舗", affiliateReward: "アフィリエイト報酬", disputeVersion: "紛争バージョン",
    resolutionTitle: "返金紛争を裁定", publicReason: "公開裁定理由", internalNote: "内部メモ",
    validation: "公開裁定理由は2文字以上入力してください", versionConflict: "案件のバージョンが更新されました。入力内容は保持されています。最新データを読み込んで再確認してください",
    resolveFailed: "返金紛争の裁定に失敗しました。権限と案件の状態を確認して再試行してください", resolveRefund: "返金と裁定",
    confirmResolveRefund: "もう一度クリックして返金裁定を確定", rejectRefund: "返金を棄却", confirmRejectRefund: "もう一度クリックして返金棄却を確定",
    readOnlyNotice: "現在のアカウントは紛争の閲覧のみ可能で、裁定は送信できません。", none: "なし", settledRewardSuffix: "NDP · 精算済み（取消不可）",
    serverTotal: "全", records: "件", page: "ページ", of: "/", previous: "前へ", next: "次へ"
  },
  en: {
    title: "Refund dispute review",
    description: "Only formally disputed refunds are shown. Case, responsibility, amount, and version data come from the formal refund API; the backend continues to enforce RBAC, state transitions, idempotency, and audit checks for resolutions.",
    canResolve: "Resolution allowed", readOnly: "Read only", disputeStatus: "Dispute status", open: "Pending resolution", resolved: "Resolved",
    searchLabel: "Search refund disputes", searchPlaceholder: "Order number, shop, or user NeeDoID", search: "Search",
    loading: "Loading formal refund disputes", loadFailed: "Failed to load refund disputes", reload: "Reload",
    empty: "No formal refund disputes match the current filters", orderNo: "Order number", shop: "Shop", customer: "User",
    refundAmount: "Refund amount", complaintReason: "Dispute reason", review: "Review", paginationLabel: "Refund dispute pages",
    detailTitle: "Refund dispute details", caseId: "Case ID", requestReason: "Refund request reason", merchantNote: "Merchant handling note",
    responsibility: "Responsible party", shopResponsible: "Shop", affiliateReward: "Affiliate reward", disputeVersion: "Dispute version",
    resolutionTitle: "Resolve refund dispute", publicReason: "Public resolution reason", internalNote: "Internal note",
    validation: "Enter at least 2 characters for the public resolution reason", versionConflict: "The case version changed. Your entries were preserved; refresh the latest data and confirm again",
    resolveFailed: "Refund dispute resolution failed. Check your permission and the case status, then try again", resolveRefund: "Resolve as refund",
    confirmResolveRefund: "Click again to confirm refund resolution", rejectRefund: "Reject refund", confirmRejectRefund: "Click again to confirm refund rejection",
    readOnlyNotice: "This account can only read disputes and cannot submit a resolution.", none: "None", settledRewardSuffix: "NDP · settled (not reversed)",
    serverTotal: "Server total", records: "records", page: "page", of: "/", previous: "Previous", next: "Next"
  },
  ko: {
    title: "환불 분쟁 심사",
    description: "정식으로 이의가 제기된 환불 분쟁만 표시합니다. 사건, 책임, 금액 및 버전은 정식 환불 API에서 가져오며 판정 시에도 백엔드가 RBAC, 상태 전이, 멱등성 및 감사를 검증합니다.",
    canResolve: "판정 가능", readOnly: "읽기 전용", disputeStatus: "분쟁 상태", open: "판정 대기", resolved: "판정 완료",
    searchLabel: "환불 분쟁 검색", searchPlaceholder: "주문 번호, 매장 또는 사용자 NeeDoID", search: "검색",
    loading: "정식 환불 분쟁을 불러오는 중", loadFailed: "환불 분쟁을 불러오지 못했습니다", reload: "다시 불러오기",
    empty: "현재 조건에 맞는 정식 환불 분쟁이 없습니다", orderNo: "주문 번호", shop: "매장", customer: "사용자",
    refundAmount: "환불 금액", complaintReason: "이의 제기 사유", review: "심사", paginationLabel: "환불 분쟁 페이지",
    detailTitle: "환불 분쟁 상세", caseId: "사건 번호", requestReason: "환불 신청 사유", merchantNote: "가맹점 처리 설명",
    responsibility: "책임 귀속", shopResponsible: "매장", affiliateReward: "제휴 보상", disputeVersion: "분쟁 버전",
    resolutionTitle: "환불 분쟁 판정", publicReason: "공개 판정 사유", internalNote: "내부 메모",
    validation: "공개 판정 사유를 2자 이상 입력해 주세요", versionConflict: "사건 버전이 변경되었습니다. 입력 내용은 유지되었으니 최신 데이터를 새로고침한 후 다시 확인해 주세요",
    resolveFailed: "환불 분쟁 판정에 실패했습니다. 권한과 사건 상태를 확인한 후 다시 시도해 주세요", resolveRefund: "환불 판정",
    confirmResolveRefund: "환불 판정을 확인하려면 다시 클릭", rejectRefund: "환불 기각", confirmRejectRefund: "환불 기각을 확인하려면 다시 클릭",
    readOnlyNotice: "현재 계정은 분쟁 조회만 가능하며 판정을 제출할 수 없습니다.", none: "없음", settledRewardSuffix: "NDP · 정산 완료 (회수하지 않음)",
    serverTotal: "서버 전체", records: "건", page: "페이지", of: "/", previous: "이전", next: "다음"
  }
} as const;

export function getRefundDisputeCopy(language: Language) {
  return copy[language];
}
