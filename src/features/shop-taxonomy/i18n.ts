import type { Language } from "../../i18n/translations";

type Copy = {
  title: string;
  description: string;
  loading: string;
  loadFailed: string;
  categoryCount: (selected: number, limit: number) => string;
  keywordCount: (selected: number, limit: number) => string;
  categoryLimit: (limit: number) => string;
  keywordLimit: (limit: number) => string;
  removed: (count: number) => string;
  review: string;
  save: string;
  saving: string;
  saved: string;
  conflict: string;
  saveFailed: string;
};

export const shopTaxonomyCopy: Record<Language, Copy> = {
  zh: {
    title: "服务种类与关键词",
    description: "先选择服务种类，再从对应的常用关键词中选择。服务种类可被搜索，但不会显示在店铺关键词框内。",
    loading: "正在读取正式标签库…",
    loadFailed: "服务标签读取失败，请稍后重试。",
    categoryCount: (selected, limit) => `已选服务种类 ${selected}/${limit}`,
    keywordCount: (selected, limit) => `已选关键词 ${selected}/${limit}`,
    categoryLimit: (limit) => `最多选择 ${limit} 个服务种类`,
    keywordLimit: (limit) => `最多选择 ${limit} 个关键词`,
    removed: (count) => `将同时移除 ${count} 个关键词`,
    review: "需审核",
    save: "保存服务标签",
    saving: "正在保存…",
    saved: "服务标签已保存",
    conflict: "服务器资料已更新；已保留当前草稿，请确认后再次保存。",
    saveFailed: "保存失败，请检查所选种类与资质后重试。"
  },
  "zh-Hant": {
    title: "服務種類與關鍵詞",
    description: "先選擇服務種類，再從對應的常用關鍵詞中選擇。服務種類可被搜尋，但不會顯示在店鋪關鍵詞框內。",
    loading: "正在讀取正式標籤庫…",
    loadFailed: "服務標籤讀取失敗，請稍後重試。",
    categoryCount: (selected, limit) => `已選服務種類 ${selected}/${limit}`,
    keywordCount: (selected, limit) => `已選關鍵詞 ${selected}/${limit}`,
    categoryLimit: (limit) => `最多選擇 ${limit} 個服務種類`,
    keywordLimit: (limit) => `最多選擇 ${limit} 個關鍵詞`,
    removed: (count) => `將同時移除 ${count} 個關鍵詞`,
    review: "需審核",
    save: "儲存服務標籤",
    saving: "正在儲存…",
    saved: "服務標籤已儲存",
    conflict: "伺服器資料已更新；已保留目前草稿，請確認後再次儲存。",
    saveFailed: "儲存失敗，請檢查所選種類與資格後重試。"
  },
  ja: {
    title: "サービス種類とキーワード",
    description: "サービス種類を選び、その種類の一般的なキーワードを選択します。種類名は検索対象ですが、店舗のキーワード欄には表示されません。",
    loading: "正式タグを読み込んでいます…",
    loadFailed: "サービスタグを読み込めませんでした。しばらくしてから再試行してください。",
    categoryCount: (selected, limit) => `選択中の種類 ${selected}/${limit}`,
    keywordCount: (selected, limit) => `選択中のキーワード ${selected}/${limit}`,
    categoryLimit: (limit) => `サービス種類は最大${limit}件です`,
    keywordLimit: (limit) => `キーワードは最大${limit}件です`,
    removed: (count) => `関連するキーワード${count}件も削除されます`,
    review: "審査必要",
    save: "サービスタグを保存",
    saving: "保存中…",
    saved: "サービスタグを保存しました",
    conflict: "サーバー上の情報が更新されました。現在の下書きを保持したため、確認して再度保存してください。",
    saveFailed: "保存できませんでした。選択内容と資格を確認して再試行してください。"
  },
  en: {
    title: "Service types and keywords",
    description: "Choose service types first, then common keywords from those types. Type names are searchable but do not appear in the shop keyword row.",
    loading: "Loading the formal tag catalog…",
    loadFailed: "Service tags could not be loaded. Try again shortly.",
    categoryCount: (selected, limit) => `Service types ${selected}/${limit}`,
    keywordCount: (selected, limit) => `Keywords ${selected}/${limit}`,
    categoryLimit: (limit) => `Choose up to ${limit} service types`,
    keywordLimit: (limit) => `Choose up to ${limit} keywords`,
    removed: (count) => `${count} dependent keyword${count === 1 ? "" : "s"} will also be removed`,
    review: "Review required",
    save: "Save service tags",
    saving: "Saving…",
    saved: "Service tags saved",
    conflict: "The server record changed. Your draft is preserved; review it and save again.",
    saveFailed: "Could not save. Check the selected types and qualifications, then retry."
  },
  ko: {
    title: "서비스 종류와 키워드",
    description: "서비스 종류를 먼저 선택한 뒤 해당 종류의 자주 쓰는 키워드를 선택하세요. 종류명은 검색되지만 매장 키워드 영역에는 표시되지 않습니다.",
    loading: "정식 태그 목록을 불러오는 중…",
    loadFailed: "서비스 태그를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
    categoryCount: (selected, limit) => `선택한 서비스 종류 ${selected}/${limit}`,
    keywordCount: (selected, limit) => `선택한 키워드 ${selected}/${limit}`,
    categoryLimit: (limit) => `서비스 종류는 최대 ${limit}개까지 선택할 수 있습니다`,
    keywordLimit: (limit) => `키워드는 최대 ${limit}개까지 선택할 수 있습니다`,
    removed: (count) => `연결된 키워드 ${count}개도 함께 삭제됩니다`,
    review: "심사 필요",
    save: "서비스 태그 저장",
    saving: "저장 중…",
    saved: "서비스 태그를 저장했습니다",
    conflict: "서버 정보가 변경되었습니다. 현재 초안을 유지했으니 확인 후 다시 저장하세요.",
    saveFailed: "저장하지 못했습니다. 선택한 종류와 자격을 확인한 뒤 다시 시도하세요."
  }
};
