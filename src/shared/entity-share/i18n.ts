import type { Language } from "../../i18n/translations";

export const entityShareCopy: Record<
  Language,
  {
    title: string;
    search: string;
    empty: string;
    share: string;
    close: string;
    failed: string;
  }
> = {
  zh: {
    title: "分享到联系人或群聊",
    search: "搜索联系人或群聊",
    empty: "没有可分享的联系人或群聊",
    share: "分享",
    close: "关闭",
    failed: "部分发送失败，可重试失败项",
  },
  "zh-Hant": {
    title: "分享到聯絡人或群聊",
    search: "搜尋聯絡人或群聊",
    empty: "沒有可分享的聯絡人或群聊",
    share: "分享",
    close: "關閉",
    failed: "部分傳送失敗，可重試失敗項",
  },
  ja: {
    title: "連絡先またはグループへ共有",
    search: "連絡先・グループを検索",
    empty: "共有できる宛先がありません",
    share: "共有",
    close: "閉じる",
    failed: "一部の送信に失敗しました。再試行できます",
  },
  en: {
    title: "Share to contacts or groups",
    search: "Search contacts or groups",
    empty: "No available destinations",
    share: "Share",
    close: "Close",
    failed: "Some deliveries failed. Retry the failed items",
  },
  ko: {
    title: "연락처 또는 그룹에 공유",
    search: "연락처 또는 그룹 검색",
    empty: "공유할 대상이 없습니다",
    share: "공유",
    close: "닫기",
    failed: "일부 전송에 실패했습니다. 실패 항목을 다시 시도하세요",
  },
};
