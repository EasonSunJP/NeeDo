import { translateText, type Language } from "../../i18n/translations";

type AffiliateAllianceTranslation = Partial<
  Record<"zh-Hant" | "ja" | "en" | "ko", string>
>;

export const affiliateAllianceTranslations: Record<string, AffiliateAllianceTranslation> = {
  联盟: { "zh-Hant": "聯盟", ja: "アライアンス", en: "Alliance", ko: "연합" },
  "管理当前联盟、成员权限与独立联盟钱包。": {
    "zh-Hant": "管理目前聯盟、成員權限與獨立聯盟錢包。",
    ja: "現在のアライアンス、メンバー権限、専用ウォレットを管理します。",
    en: "Manage your current alliance, member permissions, and separate alliance wallet.",
    ko: "현재 연합, 회원 권한 및 독립 연합 지갑을 관리합니다."
  },
  查看联盟说明: {
    "zh-Hant": "查看聯盟說明",
    ja: "アライアンスの説明を表示",
    en: "View alliance information",
    ko: "연합 안내 보기"
  },
  正在读取联盟: {
    "zh-Hant": "正在讀取聯盟",
    ja: "アライアンスを読み込んでいます",
    en: "Loading alliance",
    ko: "연합을 불러오는 중"
  },
  没有权限查看联盟: {
    "zh-Hant": "沒有權限查看聯盟",
    ja: "アライアンスを表示する権限がありません",
    en: "You don't have permission to view the alliance",
    ko: "연합을 볼 권한이 없습니다"
  },
  联盟读取失败: {
    "zh-Hant": "聯盟讀取失敗",
    ja: "アライアンスを読み込めませんでした",
    en: "Couldn't load the alliance",
    ko: "연합을 불러오지 못했습니다"
  },
  重新加载: { "zh-Hant": "重新載入", ja: "再読み込み", en: "Reload", ko: "다시 불러오기" },
  联盟章程: { "zh-Hant": "聯盟章程", ja: "アライアンス規約", en: "Alliance charter", ko: "연합 규약" },
  建立你的第一个联盟: {
    "zh-Hant": "建立你的第一個聯盟",
    ja: "最初のアライアンスを作成",
    en: "Create your first alliance",
    ko: "첫 연합 만들기"
  },
  "创建后，你将成为所有者，并获得独立的联盟 NDP 钱包。": {
    "zh-Hant": "建立後，你將成為所有者，並取得獨立的聯盟 NDP 錢包。",
    ja: "作成するとオーナーになり、専用のアライアンスNDPウォレットが発行されます。",
    en: "You'll become the owner and receive a separate alliance NDP wallet.",
    ko: "생성 후 소유자가 되며 독립 연합 NDP 지갑을 받습니다."
  },
  联盟名称: { "zh-Hant": "聯盟名稱", ja: "アライアンス名", en: "Alliance name", ko: "연합 이름" },
  例如东京美容创作者联盟: {
    "zh-Hant": "例如東京美容創作者聯盟",
    ja: "例：東京ビューティークリエイターアライアンス",
    en: "For example: Tokyo Beauty Creator Alliance",
    ko: "예: 도쿄 뷰티 크리에이터 연합"
  },
  联盟介绍: { "zh-Hant": "聯盟介紹", ja: "アライアンス紹介", en: "Alliance description", ko: "연합 소개" },
  说明合作方向和联盟定位: {
    "zh-Hant": "說明合作方向和聯盟定位",
    ja: "提携方針とアライアンスの位置づけを説明",
    en: "Describe the collaboration focus and alliance positioning",
    ko: "협업 방향과 연합의 포지셔닝을 설명하세요"
  },
  实际推广者比例: {
    "zh-Hant": "實際推廣者比例",
    ja: "実際のプロモーター比率",
    en: "Actual promoter share",
    ko: "실제 프로모터 비율"
  },
  推广者: { "zh-Hant": "推廣者", ja: "プロモーター", en: "Promoter", ko: "프로모터" },
  "联盟创建无需 eKYC；联盟钱包提现时才需要完成 eKYC 并绑定同名银行账户。": {
    "zh-Hant": "建立聯盟無需 eKYC；聯盟錢包提現時才需要完成 eKYC 並綁定同名銀行帳戶。",
    ja: "アライアンス作成にeKYCは不要です。ウォレットからの出金時に、eKYCと同一名義の銀行口座が必要です。",
    en: "eKYC is not required to create an alliance. Withdrawal requires completed eKYC and a bank account in the same name.",
    ko: "연합 생성에는 eKYC가 필요하지 않습니다. 출금 시 eKYC 완료 및 동일 명의 은행 계좌가 필요합니다."
  },
  创建联盟: { "zh-Hant": "建立聯盟", ja: "アライアンスを作成", en: "Create alliance", ko: "연합 만들기" },
  创建中: { "zh-Hant": "建立中", ja: "作成中", en: "Creating", ko: "생성 중" },
  没有权限创建联盟: {
    "zh-Hant": "沒有權限建立聯盟",
    ja: "アライアンスを作成する権限がありません",
    en: "You don't have permission to create an alliance",
    ko: "연합을 만들 권한이 없습니다"
  },
  "联盟创建失败，请稍后重试": {
    "zh-Hant": "聯盟建立失敗，請稍後再試",
    ja: "アライアンスを作成できませんでした。後でもう一度お試しください",
    en: "Couldn't create the alliance. Try again later",
    ko: "연합을 만들지 못했습니다. 잠시 후 다시 시도하세요"
  },
  联盟已创建: { "zh-Hant": "聯盟已建立", ja: "アライアンスを作成しました", en: "Alliance created", ko: "연합을 만들었습니다" },
  联盟状态已刷新: {
    "zh-Hant": "聯盟狀態已重新整理",
    ja: "アライアンスの状態を更新しました",
    en: "Alliance status refreshed",
    ko: "연합 상태를 새로고침했습니다"
  },
  有效: { "zh-Hant": "有效", ja: "有効", en: "Active", ko: "활성" },
  暂停: { "zh-Hant": "暫停", ja: "停止中", en: "Suspended", ko: "일시 중지" },
  已关闭: { "zh-Hant": "已關閉", ja: "終了", en: "Closed", ko: "종료" },
  联盟所有者: { "zh-Hant": "聯盟所有者", ja: "アライアンスオーナー", en: "Alliance owner", ko: "연합 소유자" },
  所有者: { "zh-Hant": "所有者", ja: "オーナー", en: "Owner", ko: "소유자" },
  所有者权限: { "zh-Hant": "所有者權限", ja: "オーナー権限", en: "Owner permissions", ko: "소유자 권한" },
  领取任务: { "zh-Hant": "領取任務", ja: "案件を受け取る", en: "Claim tasks", ko: "작업 받기" },
  查看联盟概览: { "zh-Hant": "查看聯盟概覽", ja: "アライアンス概要を表示", en: "View alliance overview", ko: "연합 개요 보기" },
  查看成员详情: { "zh-Hant": "查看成員詳情", ja: "メンバー詳細を表示", en: "View member details", ko: "회원 상세 보기" },
  管理自己的下级: { "zh-Hant": "管理自己的下級", ja: "自分の配下を管理", en: "Manage own subordinates", ko: "자신의 하위 회원 관리" },
  查看联盟钱包: { "zh-Hant": "查看聯盟錢包", ja: "アライアンスウォレットを表示", en: "View alliance wallet", ko: "연합 지갑 보기" },
  已授权: { "zh-Hant": "已授權", ja: "許可済み", en: "Allowed", ko: "허용됨" },
  未授权: { "zh-Hant": "未授權", ja: "未許可", en: "Not allowed", ko: "허용되지 않음" },
  联盟钱包: { "zh-Hant": "聯盟錢包", ja: "アライアンスウォレット", en: "Alliance wallet", ko: "연합 지갑" },
  "与个人钱包分开记账，余额只来自正式联盟结算。": {
    "zh-Hant": "與個人錢包分開記帳，餘額只來自正式聯盟結算。",
    ja: "個人ウォレットとは別に記帳され、残高は正式なアライアンス精算のみから発生します。",
    en: "This is recorded separately from your personal wallet and receives only formal alliance settlements.",
    ko: "개인 지갑과 별도로 기록되며 잔액은 정식 연합 정산에서만 발생합니다."
  },
  可用余额: { "zh-Hant": "可用餘額", ja: "利用可能残高", en: "Available balance", ko: "사용 가능 잔액" },
  冻结余额: { "zh-Hant": "凍結餘額", ja: "凍結残高", en: "Frozen balance", ko: "동결 잔액" },
  最后更新: { "zh-Hant": "最後更新", ja: "最終更新", en: "Last updated", ko: "마지막 업데이트" }
};

export function translateAffiliateAllianceText(source: string, language: Language): string {
  if (language === "zh") return source;
  return affiliateAllianceTranslations[source]?.[language] ?? translateText(source, language);
}
