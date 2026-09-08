import type { TranslationEntry } from "../../i18n/translations";
const entry = (zhHant: string, ja: string, en: string, ko: string): TranslationEntry => ({ "zh-Hant": zhHant, ja, en, ko });
export const ekycTranslations: Record<string, TranslationEntry> = {
  "合同暂时无法读取，请重试或联系平台客服。": entry("合約暫時無法讀取，請重試或聯絡平台客服。", "契約を読み込めません。再試行するか、サポートにお問い合わせください。", "The contract is unavailable. Retry or contact support.", "계약을 불러올 수 없습니다. 다시 시도하거나 고객 지원에 문의해 주세요."),
  "eKYC手动": entry("eKYC手動", "eKYC手動審査", "Manual eKYC", "eKYC 수동 심사"),
  "店铺申请管理": entry("店鋪申請管理", "店舗申請管理", "Shop applications", "매장 신청 관리"),
  "员工申请管理": entry("員工申請管理", "スタッフ申請管理", "Employee applications", "직원 신청 관리"),
  "申请资料": entry("申請資料", "申請情報", "Application details", "신청 자료"),
  "提交审核": entry("提交審核", "審査に提出", "Submit for review", "심사 제출"),
  "审核已通过": entry("審核已通過", "承認済み", "Approved", "심사 승인"),
  "审核未通过": entry("審核未通過", "否認", "Rejected", "심사 거절"),
  "本人认证已通过运营人工审核。": entry("本人認證已通過營運人工審核。", "運営による本人確認の手動審査が承認されました。", "Your identity verification was approved by an operator.", "운영 담당자가 본인 인증을 승인했습니다."),
  "审核未通过，请根据原因修改后再次申请。": entry("審核未通過，請根據原因修改後再次申請。", "否認理由に沿って修正し、再申請してください。", "Please correct the details based on the rejection reason and apply again.", "거절 사유에 따라 내용을 수정한 후 다시 신청해 주세요."),
  "资料已提交，请等待运营人工审核。": entry("資料已提交，請等待營運人工審核。", "情報を提出しました。運営による手動審査をお待ちください。", "Details submitted. Please wait for operator review.", "자료가 제출되었습니다. 운영자의 심사를 기다려 주세요."),
  "核对本人提交的资料，记录人工核验依据后作出审核决定。": entry("核對本人提交的資料，記錄人工核驗依據後作出審核決定。", "提出情報を照合し、手動確認の根拠を記録して審査してください。", "Check the submitted details and record your verification evidence before deciding.", "제출된 자료를 확인하고 수동 확인 근거를 기록한 후 심사해 주세요."),
  "核验说明": entry("核驗說明", "確認内容・根拠", "Verification notes", "확인 근거"),
  "已通过人工核对确认上述资料与本人一致": entry("已通過人工核對確認上述資料與本人一致", "手動照合により上記情報と本人の一致を確認しました", "I have manually verified that these details match the applicant", "수동 확인을 통해 위 자료가 신청자 본인과 일치함을 확인했습니다"),
  "审核通过": entry("審核通過", "承認", "Approve", "승인"),
  "审核状态": entry("審核狀態", "審査状況", "Review status", "심사 상태"),
  "查看申请": entry("查看申請", "申請を表示", "View application", "신청 보기"),
  "暂无申请": entry("暫無申請", "申請はありません", "No applications", "신청이 없습니다"),
};
const errors: Record<string, [string, string, string, string]> = {
  not_found: ["找不到此申請或無權存取", "申請が見つからないか、アクセス権がありません", "Application not found or access denied", "신청을 찾을 수 없거나 접근 권한이 없습니다"],
  self_review_forbidden: ["不能審核自己的申請", "自分の申請は審査できません", "You cannot review your own application", "본인의 신청은 심사할 수 없습니다"],
  version_conflict: ["申請狀態已更新，請重新開啟頁面", "申請状況が更新されました。ページを開き直してください", "The application changed. Please reopen the page", "신청 상태가 변경되었습니다. 페이지를 다시 열어 주세요"],
  invalid_birth_date: ["請選擇有效的出生日期", "有効な生年月日を選択してください", "Select a valid birth date", "유효한 생년월일을 선택해 주세요"],
  other_occupation_required: ["請填寫其他職業", "その他の職業を入力してください", "Enter the other occupation", "기타 직업을 입력해 주세요"],
  active_application_exists: ["已有審核中的申請，請重新開啟查看", "審査中の申請があります。ページを開き直してください", "An application is already under review. Reopen the page to view it", "이미 심사 중인 신청이 있습니다. 페이지를 다시 열어 확인해 주세요"],
  already_verified: ["本人認證已完成，無需重複申請", "本人確認は完了しています。再申請は不要です", "Identity verification is complete. No new application is needed", "본인 인증이 완료되어 다시 신청할 필요가 없습니다"],
};
export const ekycChineseErrors: Record<string, string> = {
  not_found: "找不到此申请或无权访问", self_review_forbidden: "不能审核自己的申请", version_conflict: "申请状态已更新，请重新打开页面", invalid_birth_date: "请选择有效的出生日期", other_occupation_required: "请填写其他职业", active_application_exists: "已有审核中的申请，请重新打开查看", already_verified: "本人认证已完成，无需重复申请"
};
for (const [key, values] of Object.entries(errors)) ekycTranslations[`error.ekyc_application.${key}`] = entry(...values);
