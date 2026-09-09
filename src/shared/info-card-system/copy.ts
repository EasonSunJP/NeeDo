import type { Language } from "../../i18n/translations";

export const unifiedCardCopy = {
  zh: { bookable: "可预约", completedOrders: "完单次数", distance: "距离", distanceToYou: "距离你", distanceUnavailable: "距离未读取", durationUnavailable: "时长未读取", favorite: "收藏", minute: "分钟", noDescription: "暂无简介", noImage: "暂无公开图片", noTags: "暂无标签", notBookable: "暂不可预约", rating: "评分", reviews: "评价次数", share: "分享", unavailable: "未读取", usage: "利用次数", viewService: "查看服务", viewShop: "查看店铺", viewTechnician: "查看技师", viewUser: "查看用户" },
  "zh-Hant": { bookable: "可預約", completedOrders: "完單次數", distance: "距離", distanceToYou: "距離你", distanceUnavailable: "距離未讀取", durationUnavailable: "時長未讀取", favorite: "收藏", minute: "分鐘", noDescription: "暫無簡介", noImage: "暫無公開圖片", noTags: "暫無標籤", notBookable: "暫不可預約", rating: "評分", reviews: "評價次數", share: "分享", unavailable: "未讀取", usage: "利用次數", viewService: "查看服務", viewShop: "查看店鋪", viewTechnician: "查看技師", viewUser: "查看用戶" },
  ja: { bookable: "予約可能", completedOrders: "完了件数", distance: "距離", distanceToYou: "現在地から", distanceUnavailable: "距離未取得", durationUnavailable: "所要時間未取得", favorite: "お気に入り", minute: "分", noDescription: "紹介はありません", noImage: "公開画像はありません", noTags: "タグはありません", notBookable: "現在予約不可", rating: "評価", reviews: "評価件数", share: "シェア", unavailable: "未取得", usage: "利用回数", viewService: "サービスを見る", viewShop: "店舗を見る", viewTechnician: "スタッフを見る", viewUser: "ユーザーを見る" },
  en: { bookable: "Bookable", completedOrders: "Completed", distance: "Distance", distanceToYou: "From you", distanceUnavailable: "Distance unavailable", durationUnavailable: "Duration unavailable", favorite: "Favorites", minute: "min", noDescription: "No description", noImage: "No public image", noTags: "No tags", notBookable: "Not bookable", rating: "Rating", reviews: "Reviews", share: "Share", unavailable: "Unavailable", usage: "Uses", viewService: "View service", viewShop: "View shop", viewTechnician: "View technician", viewUser: "View user" },
  ko: { bookable: "예약 가능", completedOrders: "완료 건수", distance: "거리", distanceToYou: "현재 위치에서", distanceUnavailable: "거리 불러오지 못함", durationUnavailable: "소요 시간 불러오지 못함", favorite: "즐겨찾기", minute: "분", noDescription: "소개 없음", noImage: "공개 이미지 없음", noTags: "태그 없음", notBookable: "현재 예약 불가", rating: "평점", reviews: "평가 수", share: "공유", unavailable: "불러오지 못함", usage: "이용 횟수", viewService: "서비스 보기", viewShop: "매장 보기", viewTechnician: "스태프 보기", viewUser: "사용자 보기" },
} satisfies Record<Language, Record<string, string>>;

export type UnifiedCardCopy = (typeof unifiedCardCopy)[Language];

export const getUnifiedCardCopy = (language: Language = "zh") =>
  unifiedCardCopy[language];
