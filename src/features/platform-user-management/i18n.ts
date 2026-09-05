import type { Language, TranslationEntry } from "../../i18n/translations";

const zh = {
  userList: "用户列表",
  userGroups: "用户分组",
  globalSettings: "用户全局设置",
  membershipTiers: "会员等级设置",
  membershipBenefits: "会员权益说明",
  allUsers: "全部正式用户",
  search: "搜索",
  reset: "重置",
  filters: "筛选",
  refresh: "刷新",
  loading: "正在读取正式数据",
  empty: "没有符合条件的数据",
  retry: "重试",
  permissionDenied: "当前账号没有此项权限",
  loadFailed: "读取失败，请重试",
  conflict: "数据已被其他运营成员更新",
  reloadServer: "加载服务器版本",
  keepDraft: "保留当前草稿",
  saveDraft: "保存草稿",
  publish: "发布",
  cancel: "取消",
  close: "关闭",
  edit: "编辑",
  archive: "归档",
  confirm: "确认",
  details: "详情",
  members: "成员",
  addGroup: "添加分组",
  groupName: "分组名称",
  groupDescription: "分组简介",
  systemGroup: "系统分组",
  customGroup: "自定义分组",
  user: "用户",
  identities: "身份",
  source: "来源",
  status: "状态",
  active: "启用",
  inactive: "停用",
  membership: "会员",
  level: "等级",
  experience: "经验值",
  ndpBalance: "NDP余额",
  ekyc: "eKYC",
  verified: "已验证",
  unverified: "未验证",
  bound: "已绑定",
  unbound: "未绑定",
  registeredAt: "注册时间",
  bookings: "预约",
  spend: "消费",
  rolesPermissions: "角色与权限",
  audit: "审计记录",
  basicProfile: "基础资料",
  phoneRequired: "要求绑定手机",
  emailRequired: "要求绑定邮箱",
  homeEkycRequired: "上门服务必须通过 eKYC",
  storeEkycRequired: "到店服务必须通过 eKYC",
  ndpRatio: "NDP 基础经验比例",
  defaultRatio: "默认 100 NDP = 1 EXP",
  campaign: "临时倍率活动",
  currentVersion: "当前生效版本",
  draftVersion: "草稿版本",
  scheduled: "已排期",
  effectivePeriod: "生效期间",
  liveExample: "计算示例",
  tierFree: "免费会员",
  tierSilver: "白银会员",
  tierGold: "黄金会员",
  tierBlackDiamond: "黑钻会员",
  permanent: "永久",
  days30: "30天",
  monthlyValue: "月卡价值",
  annualMonths: "年费计费月数",
  experienceMultiplier: "经验倍率",
  cardTheme: "会员卡配色",
  detailCard: "详细信息卡",
  simpleCard: "简易信息卡",
  contrastInvalid: "当前配色对比度不足，无法发布",
  benefitNdpExperience: "NDP消费经验",
  benefitMemberSignIn: "会员签到",
  benefitPriorityRequest: "优先下单",
  benefitSupportService: "专属客服",
  benefitExclusiveDiscount: "专属优惠",
  benefitMemberDay: "会员日",
  benefitBirthdayGift: "生日礼",
  membershipBenefitsDescription: "八项系统权益的全局状态、显示顺序与五语言说明。等级内点亮状态在会员等级设置中管理。",
  membershipBenefitsCatalogInvalid: "正式接口必须且只能返回八项固定系统权益。",
  configured: "已配置",
  globallyDisabled: "全局停用",
  capabilityAvailable: "能力已接通",
  capabilityUnavailable: "能力未接通"
} as const;

type CopyKey = keyof typeof zh;
type Copy = Record<CopyKey, string>;

const zhHant: Copy = {
  userList: "使用者列表", userGroups: "使用者分組", globalSettings: "使用者全域設定", membershipTiers: "會員等級設定", membershipBenefits: "會員權益說明", allUsers: "全部正式使用者", search: "搜尋", reset: "重設", filters: "篩選", refresh: "重新整理", loading: "正在讀取正式資料", empty: "沒有符合條件的資料", retry: "重試", permissionDenied: "目前帳號沒有此項權限", loadFailed: "讀取失敗，請重試", conflict: "資料已被其他營運成員更新", reloadServer: "載入伺服器版本", keepDraft: "保留目前草稿", saveDraft: "儲存草稿", publish: "發布", cancel: "取消", close: "關閉", edit: "編輯", archive: "封存", confirm: "確認", details: "詳情", members: "成員", addGroup: "新增分組", groupName: "分組名稱", groupDescription: "分組簡介", systemGroup: "系統分組", customGroup: "自訂分組", user: "使用者", identities: "身分", source: "來源", status: "狀態", active: "啟用", inactive: "停用", membership: "會員", level: "等級", experience: "經驗值", ndpBalance: "NDP餘額", ekyc: "eKYC", verified: "已驗證", unverified: "未驗證", bound: "已綁定", unbound: "未綁定", registeredAt: "註冊時間", bookings: "預約", spend: "消費", rolesPermissions: "角色與權限", audit: "稽核紀錄", basicProfile: "基本資料", phoneRequired: "要求綁定手機", emailRequired: "要求綁定信箱", homeEkycRequired: "上門服務必須通過 eKYC", storeEkycRequired: "到店服務必須通過 eKYC", ndpRatio: "NDP 基礎經驗比例", defaultRatio: "預設 100 NDP = 1 EXP", campaign: "臨時倍率活動", currentVersion: "目前生效版本", draftVersion: "草稿版本", scheduled: "已排程", effectivePeriod: "生效期間", liveExample: "計算範例", tierFree: "免費會員", tierSilver: "白銀會員", tierGold: "黃金會員", tierBlackDiamond: "黑鑽會員", permanent: "永久", days30: "30天", monthlyValue: "月卡價值", annualMonths: "年費計費月數", experienceMultiplier: "經驗倍率", cardTheme: "會員卡配色", detailCard: "詳細資訊卡", simpleCard: "簡易資訊卡", contrastInvalid: "目前配色對比度不足，無法發布", benefitNdpExperience: "NDP消費經驗", benefitMemberSignIn: "會員簽到", benefitPriorityRequest: "優先下單", benefitSupportService: "專屬客服", benefitExclusiveDiscount: "專屬優惠", benefitMemberDay: "會員日", benefitBirthdayGift: "生日禮", membershipBenefitsDescription: "八項系統權益的全域狀態、顯示順序與五語言說明。等級內啟用狀態在會員等級設定中管理。", membershipBenefitsCatalogInvalid: "正式介面必須且只能回傳八項固定系統權益。", configured: "已設定", globallyDisabled: "全域停用", capabilityAvailable: "能力已接通", capabilityUnavailable: "能力未接通"
};

const ja: Copy = {
  userList: "ユーザー一覧", userGroups: "ユーザーグループ", globalSettings: "ユーザー共通設定", membershipTiers: "会員ランク設定", membershipBenefits: "会員特典説明", allUsers: "全正式ユーザー", search: "検索", reset: "リセット", filters: "絞り込み", refresh: "更新", loading: "正式データを読み込み中", empty: "条件に一致するデータはありません", retry: "再試行", permissionDenied: "この操作を行う権限がありません", loadFailed: "読み込みに失敗しました。再試行してください", conflict: "別の運営メンバーがデータを更新しました", reloadServer: "サーバー版を読み込む", keepDraft: "現在の下書きを保持", saveDraft: "下書きを保存", publish: "公開", cancel: "キャンセル", close: "閉じる", edit: "編集", archive: "アーカイブ", confirm: "確認", details: "詳細", members: "メンバー", addGroup: "グループを追加", groupName: "グループ名", groupDescription: "グループ説明", systemGroup: "システムグループ", customGroup: "カスタムグループ", user: "ユーザー", identities: "ID種別", source: "登録経路", status: "状態", active: "有効", inactive: "無効", membership: "会員", level: "レベル", experience: "経験値", ndpBalance: "NDP残高", ekyc: "eKYC", verified: "認証済み", unverified: "未認証", bound: "連携済み", unbound: "未連携", registeredAt: "登録日時", bookings: "予約", spend: "利用額", rolesPermissions: "ロールと権限", audit: "監査履歴", basicProfile: "基本情報", phoneRequired: "電話番号の連携を必須にする", emailRequired: "メールの連携を必須にする", homeEkycRequired: "訪問サービスで eKYC を必須にする", storeEkycRequired: "店舗サービスで eKYC を必須にする", ndpRatio: "NDP基本経験値比率", defaultRatio: "初期値 100 NDP = 1 EXP", campaign: "期間限定倍率キャンペーン", currentVersion: "現在有効な版", draftVersion: "下書き版", scheduled: "公開予約済み", effectivePeriod: "適用期間", liveExample: "計算例", tierFree: "無料会員", tierSilver: "シルバー会員", tierGold: "ゴールド会員", tierBlackDiamond: "ブラックダイヤ会員", permanent: "無期限", days30: "30日", monthlyValue: "月額カード価値", annualMonths: "年額課金月数", experienceMultiplier: "経験値倍率", cardTheme: "会員カード配色", detailCard: "詳細カード", simpleCard: "簡易カード", contrastInvalid: "配色のコントラストが不足しているため公開できません", benefitNdpExperience: "NDP利用経験値", benefitMemberSignIn: "会員チェックイン", benefitPriorityRequest: "優先リクエスト", benefitSupportService: "専用サポート", benefitExclusiveDiscount: "会員限定割引", benefitMemberDay: "会員デー", benefitBirthdayGift: "誕生日特典", membershipBenefitsDescription: "8つのシステム特典の全体状態、表示順、5言語説明を管理します。ランクごとの有効状態は会員ランク設定で管理します。", membershipBenefitsCatalogInvalid: "正式APIは8つの固定システム特典だけを返す必要があります。", configured: "設定済み", globallyDisabled: "全体で無効", capabilityAvailable: "機能接続済み", capabilityUnavailable: "機能未接続"
};

const en: Copy = {
  userList: "User list", userGroups: "User groups", globalSettings: "Global user settings", membershipTiers: "Membership tiers", membershipBenefits: "Membership benefits", allUsers: "All formal users", search: "Search", reset: "Reset", filters: "Filters", refresh: "Refresh", loading: "Loading formal data", empty: "No data matches these filters", retry: "Retry", permissionDenied: "This account does not have permission", loadFailed: "Could not load data. Try again", conflict: "Another operations member updated this data", reloadServer: "Load server version", keepDraft: "Keep local draft", saveDraft: "Save draft", publish: "Publish", cancel: "Cancel", close: "Close", edit: "Edit", archive: "Archive", confirm: "Confirm", details: "Details", members: "Members", addGroup: "Add group", groupName: "Group name", groupDescription: "Group description", systemGroup: "System group", customGroup: "Custom group", user: "User", identities: "Identities", source: "Source", status: "Status", active: "Active", inactive: "Inactive", membership: "Membership", level: "Level", experience: "Experience", ndpBalance: "NDP balance", ekyc: "eKYC", verified: "Verified", unverified: "Unverified", bound: "Bound", unbound: "Not bound", registeredAt: "Registered", bookings: "Bookings", spend: "Spend", rolesPermissions: "Roles and permissions", audit: "Audit history", basicProfile: "Basic profile", phoneRequired: "Require phone binding", emailRequired: "Require email binding", homeEkycRequired: "Require eKYC for home services", storeEkycRequired: "Require eKYC for in-store services", ndpRatio: "Base NDP experience ratio", defaultRatio: "Default 100 NDP = 1 EXP", campaign: "Temporary multiplier campaign", currentVersion: "Current effective version", draftVersion: "Draft version", scheduled: "Scheduled", effectivePeriod: "Effective period", liveExample: "Calculation example", tierFree: "Free", tierSilver: "Silver", tierGold: "Gold", tierBlackDiamond: "Black Diamond", permanent: "Permanent", days30: "30 days", monthlyValue: "Monthly card value", annualMonths: "Annual billing months", experienceMultiplier: "Experience multiplier", cardTheme: "Card theme", detailCard: "Detailed card", simpleCard: "Simple card", contrastInvalid: "The current colors do not meet minimum contrast and cannot be published", benefitNdpExperience: "NDP experience", benefitMemberSignIn: "Member check-in", benefitPriorityRequest: "Priority requests", benefitSupportService: "Dedicated support", benefitExclusiveDiscount: "Exclusive discounts", benefitMemberDay: "Member day", benefitBirthdayGift: "Birthday gift", membershipBenefitsDescription: "Manage the global status, display order, and five-language copy for eight system benefits. Tier activation is managed in Membership tiers.", membershipBenefitsCatalogInvalid: "The formal API must return exactly the eight fixed system benefits.", configured: "Configured", globallyDisabled: "Globally disabled", capabilityAvailable: "Capability connected", capabilityUnavailable: "Capability unavailable"
};

const ko: Copy = {
  userList: "사용자 목록", userGroups: "사용자 그룹", globalSettings: "사용자 전역 설정", membershipTiers: "회원 등급 설정", membershipBenefits: "회원 혜택 설명", allUsers: "전체 정식 사용자", search: "검색", reset: "초기화", filters: "필터", refresh: "새로고침", loading: "정식 데이터 불러오는 중", empty: "조건에 맞는 데이터가 없습니다", retry: "다시 시도", permissionDenied: "이 계정에는 권한이 없습니다", loadFailed: "데이터를 불러오지 못했습니다. 다시 시도하세요", conflict: "다른 운영 담당자가 데이터를 업데이트했습니다", reloadServer: "서버 버전 불러오기", keepDraft: "현재 초안 유지", saveDraft: "초안 저장", publish: "게시", cancel: "취소", close: "닫기", edit: "편집", archive: "보관", confirm: "확인", details: "상세", members: "구성원", addGroup: "그룹 추가", groupName: "그룹 이름", groupDescription: "그룹 소개", systemGroup: "시스템 그룹", customGroup: "사용자 지정 그룹", user: "사용자", identities: "신원", source: "유입 경로", status: "상태", active: "활성", inactive: "비활성", membership: "회원", level: "레벨", experience: "경험치", ndpBalance: "NDP 잔액", ekyc: "eKYC", verified: "인증됨", unverified: "미인증", bound: "연결됨", unbound: "연결 안 됨", registeredAt: "가입 일시", bookings: "예약", spend: "사용 금액", rolesPermissions: "역할 및 권한", audit: "감사 기록", basicProfile: "기본 정보", phoneRequired: "휴대전화 연결 필수", emailRequired: "이메일 연결 필수", homeEkycRequired: "방문 서비스 eKYC 필수", storeEkycRequired: "매장 서비스 eKYC 필수", ndpRatio: "NDP 기본 경험치 비율", defaultRatio: "기본값 100 NDP = 1 EXP", campaign: "기간 한정 배율 캠페인", currentVersion: "현재 적용 버전", draftVersion: "초안 버전", scheduled: "예약됨", effectivePeriod: "적용 기간", liveExample: "계산 예시", tierFree: "무료 회원", tierSilver: "실버 회원", tierGold: "골드 회원", tierBlackDiamond: "블랙 다이아 회원", permanent: "영구", days30: "30일", monthlyValue: "월 카드 가치", annualMonths: "연간 청구 개월", experienceMultiplier: "경험치 배율", cardTheme: "회원 카드 색상", detailCard: "상세 카드", simpleCard: "간단 카드", contrastInvalid: "현재 색상 대비가 부족하여 게시할 수 없습니다", benefitNdpExperience: "NDP 사용 경험치", benefitMemberSignIn: "회원 체크인", benefitPriorityRequest: "우선 요청", benefitSupportService: "전용 고객 지원", benefitExclusiveDiscount: "전용 할인", benefitMemberDay: "회원의 날", benefitBirthdayGift: "생일 선물", membershipBenefitsDescription: "8개 시스템 혜택의 전체 상태, 표시 순서 및 5개 언어 설명을 관리합니다. 등급별 활성 상태는 회원 등급 설정에서 관리합니다.", membershipBenefitsCatalogInvalid: "정식 API는 8개의 고정 시스템 혜택만 반환해야 합니다.", configured: "설정됨", globallyDisabled: "전체 비활성", capabilityAvailable: "기능 연결됨", capabilityUnavailable: "기능 미연결"
};

export const platformUserManagementCopy: Record<Language, Copy> = {
  zh,
  "zh-Hant": zhHant,
  ja,
  en,
  ko
};

export const platformUserManagementText = (key: CopyKey, language: Language) =>
  platformUserManagementCopy[language][key];

export const platformUserManagementTranslations: Record<string, TranslationEntry> =
  Object.fromEntries(
    (Object.keys(zh) as CopyKey[]).map((key) => [
      zh[key],
      { "zh-Hant": zhHant[key], ja: ja[key], en: en[key], ko: ko[key] }
    ])
  );

export type PlatformUserManagementCopyKey = CopyKey;
