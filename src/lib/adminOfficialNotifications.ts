export type NoticeLevel = "紧急" | "重要" | "一般";
export type NoticeStatus = "未读" | "已读" | "已归档";

export type OfficialNoticeBlockType =
  | "paragraph"
  | "heading"
  | "subheading"
  | "bullet"
  | "numbered"
  | "quote"
  | "callout"
  | "divider"
  | "image"
  | "video"
  | "file";

export type OfficialNoticeBlock = {
  id: string;
  type: OfficialNoticeBlockType;
  content: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  source?: "url" | "upload";
};

export type AdminNotice = {
  id: string;
  title: string;
  level: NoticeLevel;
  status: NoticeStatus;
  channel: string;
  at: string;
  summary: string;
  detail: string;
  blocks?: OfficialNoticeBlock[];
  sendMode?: "now" | "scheduled";
  targetMode?: "segment" | "account";
  targetSummary?: string;
  targetAccount?: {
    id: string;
    type: "user" | "technician" | "store";
    label: string;
    systemId: string;
  };
};

const officialNoticeStorageKey = "needo.admin.official-notices.v1";

function getOfficialNoticeStorage() {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createOfficialNoticeBlock(type: OfficialNoticeBlockType, content = ""): OfficialNoticeBlock {
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    content
  };
}

export function readStoredOfficialNotices(): AdminNotice[] {
  const storage = getOfficialNoticeStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(officialNoticeStorageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is AdminNotice => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.at === "string" &&
        typeof item.summary === "string" &&
        typeof item.detail === "string"
      );
    });
  } catch {
    return [];
  }
}

export function saveStoredOfficialNotice(notice: AdminNotice) {
  const storage = getOfficialNoticeStorage();
  if (!storage) {
    return false;
  }

  const current = readStoredOfficialNotices().filter((item) => item.id !== notice.id);
  try {
    storage.setItem(officialNoticeStorageKey, JSON.stringify([notice, ...current]));
    return true;
  } catch {
    return false;
  }
}

export function formatOfficialNoticeDateTime(value: string) {
  return value.replace("T", " ");
}

export function summarizeOfficialNoticeBlocks(blocks: OfficialNoticeBlock[]) {
  const text = blocks
    .filter((block) => block.type !== "divider")
    .map((block) => {
      if (block.type === "image") {
        return block.caption?.trim() || block.fileName || "[图片]";
      }

      if (block.type === "video") {
        return block.caption?.trim() || block.fileName || "[视频]";
      }

      if (block.type === "file") {
        return block.caption?.trim() || block.fileName || "[附件]";
      }

      return block.content.trim();
    })
    .filter(Boolean)
    .join(" ");

  if (!text) {
    return "官方通知正文已保存，可在详情中查看图文、视频和分段内容。";
  }

  return text.length > 92 ? `${text.slice(0, 92)}...` : text;
}

export function buildOfficialNoticeDetail(blocks: OfficialNoticeBlock[]) {
  return blocks
    .map((block, index) => {
      const content = block.content.trim();
      const caption = block.caption?.trim();

      if (block.type === "divider") {
        return "-----";
      }

      if (block.type === "bullet") {
        return `- ${content}`;
      }

      if (block.type === "numbered") {
        return `${index + 1}. ${content}`;
      }

      if (block.type === "image") {
        const label = caption || block.fileName || "已上传图片";
        return `[图片] ${label}${content && !content.startsWith("data:") && !content.startsWith("blob:") ? `: ${content}` : ""}`;
      }

      if (block.type === "video") {
        const label = caption || block.fileName || "已上传视频";
        return `[视频] ${label}${content && !content.startsWith("data:") && !content.startsWith("blob:") ? `: ${content}` : ""}`;
      }

      if (block.type === "file") {
        const label = caption || block.fileName || "已上传附件";
        return `[附件] ${label}${content && !content.startsWith("data:") && !content.startsWith("blob:") ? `: ${content}` : ""}`;
      }

      return content;
    })
    .filter(Boolean)
    .join("\n");
}
