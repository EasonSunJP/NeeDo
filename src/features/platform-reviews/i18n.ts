import type { TranslationEntry } from "../../i18n/translations";

type TranslationMap = Record<string, TranslationEntry>;

const fourLanguageTranslation = (
  zhHant: string,
  ja: string,
  en: string,
  ko: string,
): TranslationEntry => ({ "zh-Hant": zhHant, ja, en, ko });

export const platformReviewTranslations: TranslationMap = {
  "读取正式订单评价、关联用户、店铺与技师，并保留不可变修订历史。": fourLanguageTranslation("讀取正式訂單評價、關聯用戶、店鋪與技師，並保留不可變修訂歷史。", "正式な注文レビューと関連するユーザー・店舗・スタッフを表示し、変更不可の修正履歴を保持します。", "View formal order reviews with related users, stores, and staff while retaining an immutable amendment history.", "정식 주문 리뷰와 연결된 사용자, 매장, 직원을 표시하고 변경 불가능한 수정 이력을 보존합니다."),
  "正式数据": fourLanguageTranslation("正式資料", "正式データ", "Formal data", "정식 데이터"),
  "原始记录": fourLanguageTranslation("原始記錄", "元の記録", "Original", "원본 기록"),
  "已修订": fourLanguageTranslation("已修訂", "修正済み", "Amended", "수정됨"),
  "系统生成": fourLanguageTranslation("系統產生", "システム生成", "System generated", "시스템 생성"),
  "技师服务评价": fourLanguageTranslation("技師服務評價", "スタッフサービス評価", "Staff service review", "직원 서비스 리뷰"),
  "搜索评价": fourLanguageTranslation("搜尋評價", "レビューを検索", "Search reviews", "리뷰 검색"),
  "搜索评价、订单、用户、店铺或技师": fourLanguageTranslation("搜尋評價、訂單、用戶、店鋪或技師", "レビュー、注文、ユーザー、店舗、スタッフを検索", "Search reviews, orders, users, stores, or staff", "리뷰, 주문, 사용자, 매장 또는 직원 검색"),
  "应用评价日期": fourLanguageTranslation("套用評價日期", "レビュー日を適用", "Apply review dates", "리뷰 날짜 적용"),
  "应用日期": fourLanguageTranslation("套用日期", "日付を適用", "Apply dates", "날짜 적용"),
  "开始日期不能晚于结束日期": fourLanguageTranslation("開始日期不能晚於結束日期", "開始日は終了日より後にできません", "Start date cannot be after end date", "시작일은 종료일보다 늦을 수 없습니다"),
  "正在读取正式评价...": fourLanguageTranslation("正在讀取正式評價...", "正式レビューを読み込み中...", "Loading formal reviews...", "정식 리뷰를 불러오는 중..."),
  "正式评价读取失败": fourLanguageTranslation("正式評價讀取失敗", "正式レビューを読み込めませんでした", "Failed to load formal reviews", "정식 리뷰를 불러오지 못했습니다"),
  "正式评价读取失败，请稍后重试": fourLanguageTranslation("正式評價讀取失敗，請稍後重試", "正式レビューを読み込めませんでした。しばらくしてからお試しください", "Failed to load formal reviews. Try again later.", "정식 리뷰를 불러오지 못했습니다. 잠시 후 다시 시도하세요"),
  "当前筛选条件下没有正式评价": fourLanguageTranslation("目前篩選條件下沒有正式評價", "現在の条件に一致する正式レビューはありません", "No formal reviews match the current filters", "현재 필터 조건에 맞는 정식 리뷰가 없습니다"),
  "正式评价详情": fourLanguageTranslation("正式評價詳情", "正式レビュー詳細", "Formal review details", "정식 리뷰 상세"),
  "正在读取正式评价详情...": fourLanguageTranslation("正在讀取正式評價詳情...", "正式レビューの詳細を読み込み中...", "Loading formal review details...", "정식 리뷰 상세를 불러오는 중..."),
  "正式评价详情读取失败": fourLanguageTranslation("正式評價詳情讀取失敗", "正式レビューの詳細を読み込めませんでした", "Failed to load formal review details", "정식 리뷰 상세를 불러오지 못했습니다"),
  "正式评价详情读取失败，请稍后重试": fourLanguageTranslation("正式評價詳情讀取失敗，請稍後重試", "正式レビューの詳細を読み込めませんでした。しばらくしてからお試しください", "Failed to load formal review details. Try again later.", "정식 리뷰 상세를 불러오지 못했습니다. 잠시 후 다시 시도하세요"),
  "关联正式记录": fourLanguageTranslation("關聯正式記錄", "関連する正式記録", "Related formal records", "연결된 정식 기록"),
  "不可变修订历史": fourLanguageTranslation("不可變修訂歷史", "変更不可の修正履歴", "Immutable amendment history", "변경 불가능한 수정 이력"),
  "尚无修订记录，当前显示原始正式评价": fourLanguageTranslation("尚無修訂記錄，目前顯示原始正式評價", "修正履歴はありません。元の正式レビューを表示しています", "No amendments yet; showing the original formal review", "수정 이력이 없어 원본 정식 리뷰를 표시합니다"),
  "无文字评价": fourLanguageTranslation("無文字評價", "コメントなし", "No written review", "작성된 리뷰 없음"),
  "无评价标签": fourLanguageTranslation("無評價標籤", "レビュータグなし", "No review tags", "리뷰 태그 없음"),
  "文字评价未变更": fourLanguageTranslation("文字評價未變更", "コメントは変更されていません", "Written review unchanged", "작성 리뷰 변경 없음"),
};
