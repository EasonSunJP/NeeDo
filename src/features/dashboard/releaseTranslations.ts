const translations: Record<string, Record<string, string>> = {
  运营时间线: {
    en: "Operations timeline",
    ja: "運営タイムライン",
    "zh-Hant": "營運時間線",
    ko: "운영 타임라인",
  },
  版本发布记录: {
    en: "Release history",
    ja: "バージョン公開履歴",
    "zh-Hant": "版本發布記錄",
    ko: "버전 배포 기록",
  },
  "按实际发布时间记录每个版本的更新内容。": {
    en: "Version changes ordered by actual publication time.",
    ja: "実際の公開日時に基づいて各バージョンの更新内容を表示します。",
    "zh-Hant": "按實際發布時間記錄每個版本的更新內容。",
    ko: "실제 배포 시간순으로 버전별 변경 내용을 표시합니다.",
  },
  "尚无版本发布记录，部署成功后会自动记录。": {
    en: "No releases recorded yet. Successful deployments are recorded automatically.",
    ja: "公開履歴はまだありません。デプロイ成功後に自動記録されます。",
    "zh-Hant": "尚無版本發布記錄，部署成功後會自動記錄。",
    ko: "아직 배포 기록이 없습니다. 배포 성공 후 자동 기록됩니다.",
  },
  正在加载版本记录: {
    en: "Loading release history",
    ja: "公開履歴を読み込み中",
    "zh-Hant": "正在載入版本記錄",
    ko: "배포 기록 불러오는 중",
  },
  版本记录加载失败: {
    en: "Unable to load release history",
    ja: "公開履歴を読み込めませんでした",
    "zh-Hant": "版本記錄載入失敗",
    ko: "배포 기록을 불러오지 못했습니다",
  },
  重试: { en: "Retry", ja: "再試行", "zh-Hant": "重試", ko: "다시 시도" },
  版本: { en: "Version", ja: "バージョン", "zh-Hant": "版本", ko: "버전" },
  发布: { en: "Published", ja: "公開", "zh-Hant": "發布", ko: "배포" },
  回滚: { en: "Rollback", ja: "ロールバック", "zh-Hant": "回滾", ko: "롤백" },
  首次记录: {
    en: "Initial record",
    ja: "初回記録",
    "zh-Hant": "首次記錄",
    ko: "최초 기록",
  },
  重新发布: {
    en: "Redeployed",
    ja: "再公開",
    "zh-Hant": "重新發布",
    ko: "재배포",
  },
  "发布时间（东京）": {
    en: "Published at (Tokyo)",
    ja: "公開日時（東京）",
    "zh-Hant": "發布時間（東京）",
    ko: "배포 시간 (도쿄)",
  },
};
export const releaseText = (source: string, language: string) =>
  language === "zh" ? source : (translations[source]?.[language] ?? source);
