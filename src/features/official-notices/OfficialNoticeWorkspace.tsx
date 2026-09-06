import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  OFFICIAL_NOTICE_CHANGED_EVENT,
  officialNoticesApi,
  type OfficialNotice,
  type OfficialNoticeBlock,
  type OfficialNoticeLevel,
  type OfficialNoticeLocale,
  type OfficialNoticeScope,
  type OfficialNoticeStatus,
  type RecipientOfficialNotice
} from "../../api/officialNotices";
import { ApiClientError } from "../../api/httpClient";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../auth/AuthProvider";
import { translateText, type Language } from "../../i18n/translations";
import { platformUserManagementApi } from "../platform-user-management/api";
import type { PlatformManagedUser } from "../platform-user-management/types";
import { contentPublicationApi } from "../../api/contentPublication";
import {
  defaultOfficialNoticeFontSize,
  isTextualOfficialNoticeBlock,
  officialNoticeFontSizeClass
} from "../../lib/officialNoticeBlockPresentation";

const inputClass = "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss";
const textareaClass = "min-h-32 w-full rounded-lg border border-line bg-white px-3 py-3 text-sm font-bold outline-none focus:border-moss";
const pageSize = 20;

const levelLabels: Record<OfficialNoticeLevel, string> = {
  general: "普通",
  important: "重要",
  urgent: "紧急"
};
const statusLabels: Record<OfficialNoticeStatus, string> = {
  draft: "草稿",
  pending_review: "待审核",
  approved: "已批准",
  scheduled: "待发送",
  sending: "发送中",
  sent: "已发送",
  cancelled: "已取消",
  archived: "已归档"
};
const statusTone: Record<OfficialNoticeStatus, BadgeTone> = {
  draft: "neutral",
  pending_review: "yellow",
  approved: "blue",
  scheduled: "blue",
  sending: "yellow",
  sent: "green",
  cancelled: "red",
  archived: "dark"
};
const blockOptions: Array<{ type: OfficialNoticeBlock["type"]; label: string; icon: string }> = [
  { type: "paragraph", label: "正文", icon: "文" },
  { type: "heading", label: "大段落标题", icon: "H2" },
  { type: "subheading", label: "小段落标题", icon: "H3" },
  { type: "bullet", label: "项目符号", icon: "•" },
  { type: "numbered", label: "编号段落", icon: "1." },
  { type: "quote", label: "引用", icon: "引" },
  { type: "callout", label: "提示块", icon: "!" },
  { type: "divider", label: "分隔线", icon: "─" },
  { type: "image", label: "图片", icon: "图" },
  { type: "video", label: "视频", icon: "影" },
  { type: "file", label: "文件", icon: "档" }
];
const noticeLocales: OfficialNoticeLocale[] = ["ja", "zh-CN", "zh-TW", "en", "ko"];
const noticeLocaleLabels: Record<Language, Record<OfficialNoticeLocale, string>> = {
  zh: { ja: "日语", "zh-CN": "简体中文", "zh-TW": "繁体中文", en: "英语", ko: "韩语" },
  "zh-Hant": { ja: "日語", "zh-CN": "簡體中文", "zh-TW": "繁體中文", en: "英語", ko: "韓語" },
  ja: { ja: "日本語", "zh-CN": "中国語（簡体）", "zh-TW": "中国語（繁体）", en: "英語", ko: "韓国語" },
  en: { ja: "Japanese", "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese", en: "English", ko: "Korean" },
  ko: { ja: "일본어", "zh-CN": "중국어(간체)", "zh-TW": "중국어(번체)", en: "영어", ko: "한국어" }
};
const identityOptions = ["customer", "technician", "merchant_owner", "merchant_staff", "platform", "platform_admin", "scout"] as const;
type NoticeIdentityType = typeof identityOptions[number];
const identityTypeLabels: Record<Language, Record<NoticeIdentityType, string>> = {
  zh: { customer: "用户", technician: "技师", merchant_owner: "商户店主", merchant_staff: "商户员工", platform: "平台", platform_admin: "平台管理员", scout: "星探" },
  "zh-Hant": { customer: "用戶", technician: "技師", merchant_owner: "商戶店主", merchant_staff: "商戶員工", platform: "平台", platform_admin: "平台管理員", scout: "星探" },
  ja: { customer: "顧客", technician: "技師", merchant_owner: "店舗オーナー", merchant_staff: "店舗スタッフ", platform: "プラットフォーム", platform_admin: "運営管理者", scout: "スカウト" },
  en: { customer: "Customer", technician: "Technician", merchant_owner: "Merchant owner", merchant_staff: "Merchant staff", platform: "Platform", platform_admin: "Platform administrator", scout: "Scout" },
  ko: { customer: "고객", technician: "기술자", merchant_owner: "매장 소유자", merchant_staff: "매장 직원", platform: "플랫폼", platform_admin: "플랫폼 관리자", scout: "스카우트" }
};
const noticeUiTranslations: Record<string, Partial<Record<Language, string>>> = {
  "搜索通知": { "zh-Hant": "搜尋通知", ja: "通知を検索", en: "Search notices", ko: "공지 검색" },
  "指定账号": { "zh-Hant": "指定帳號", ja: "指定アカウント", en: "Specific accounts", ko: "지정 계정" },
  "全局搜索账号": { "zh-Hant": "全域搜尋帳號", ja: "アカウントを全体検索", en: "Search all accounts", ko: "전체 계정 검색" },
  "邮箱、手机号或 NeeDoID": { "zh-Hant": "電子郵件、手機號碼或 NeeDoID", ja: "メール、携帯番号または NeeDoID", en: "Email, phone, or NeeDoID", ko: "이메일, 휴대폰 번호 또는 NeeDoID" },
  "输入邮箱、手机号或 NeeDoID": { "zh-Hant": "輸入電子郵件、手機號碼或 NeeDoID", ja: "メール、携帯番号または NeeDoID を入力", en: "Enter email, phone, or NeeDoID", ko: "이메일, 휴대폰 번호 또는 NeeDoID 입력" },
  "搜索账号": { "zh-Hant": "搜尋帳號", ja: "アカウントを検索", en: "Search accounts", ko: "계정 검색" },
  "正在搜索账号": { "zh-Hant": "正在搜尋帳號…", ja: "アカウントを検索中…", en: "Searching accounts…", ko: "계정 검색 중…" },
  "选择账号": { "zh-Hant": "選擇帳號", ja: "アカウントを選択", en: "Select account", ko: "계정 선택" },
  "已选择账号": { "zh-Hant": "已選擇帳號", ja: "選択済み", en: "Account selected", ko: "계정 선택됨" },
  "移除账号": { "zh-Hant": "移除帳號", ja: "アカウントを削除", en: "Remove account", ko: "계정 제거" },
  "源语言": { "zh-Hant": "來源語言", ja: "原文言語", en: "Source language", ko: "원문 언어" },
  "身份类型": { "zh-Hant": "身分類型", ja: "アカウント種別", en: "Identity types", ko: "신분 유형" },
  "字号": { "zh-Hant": "字號", ja: "文字サイズ", en: "Font size", ko: "글자 크기" },
  "小": { "zh-Hant": "小", ja: "小", en: "Small", ko: "작게" },
  "标准": { "zh-Hant": "標準", ja: "標準", en: "Standard", ko: "표준" },
  "大": { "zh-Hant": "大", ja: "大", en: "Large", ko: "크게" },
  "超大": { "zh-Hant": "特大", ja: "特大", en: "Extra large", ko: "매우 크게" },
  "全体用户": { "zh-Hant": "全體用戶", ja: "全ユーザー", en: "All users", ko: "전체 사용자" },
  "复制当前内容到全部语言": { "zh-Hant": "將目前內容複製到所有語言", ja: "現在の内容を全言語へコピー", en: "Copy current content to all languages", ko: "현재 내용을 모든 언어로 복사" },
  "每个语言标签都可独立编辑；复制后仍可逐项修改，发送时五份内容会一起保存。": { "zh-Hant": "每個語言頁籤皆可獨立編輯；複製後仍可逐項修改，傳送時會一併儲存五份內容。", ja: "各言語タブは個別に編集できます。コピー後も個別に変更でき、送信時に5言語すべてを保存します。", en: "Each language tab is independently editable. Copies remain editable, and all five versions are saved together.", ko: "각 언어 탭은 독립적으로 편집할 수 있습니다. 복사 후에도 개별 수정할 수 있으며 전송 시 5개 언어를 함께 저장합니다." },
  "请补齐五种语言的标题、摘要和正文": { "zh-Hant": "請補齊五種語言的標題、摘要和正文", ja: "5言語すべてのタイトル、概要、本文を入力してください", en: "Complete the title, summary, and body in all five languages", ko: "5개 언어의 제목, 요약, 본문을 모두 입력하세요" }
};

function translateNoticeText(source: string, language: Language) {
  return language === "zh" ? source : noticeUiTranslations[source]?.[language] ?? source;
}

function createNoticeBlock(type: OfficialNoticeBlock["type"] = "paragraph"): OfficialNoticeBlock {
  return { id: makeKey("block"), type, content: "" };
}

function createTranslationDraft() {
  return { title: "", summary: "", blocks: [createNoticeBlock()] };
}

function normalizeNoticeBlocks(blocks: OfficialNoticeBlock[]) {
  return blocks
    .filter((block) => block.type === "divider" || block.content.trim())
    .map((block) => ({
      ...block,
      content: block.content.trim(),
      ...(block.caption?.trim() ? { caption: block.caption.trim() } : {})
    }));
}

function blockPlaceholder(type: OfficialNoticeBlock["type"]) {
  if (type === "heading") return "输入这一段的主标题";
  if (type === "subheading") return "输入小段落标题";
  if (type === "bullet") return "输入一个要点";
  if (type === "numbered") return "输入步骤或顺序内容";
  if (type === "quote") return "输入需要强调引用的说明";
  if (type === "callout") return "输入重要提示、注意事项或行动要求";
  if (type === "image") return "粘贴正式图片 URL，或使用媒体上传";
  if (type === "video") return "粘贴正式视频 URL";
  if (type === "file") return "粘贴正式文件下载 URL";
  return "输入通知正文";
}

export function describeOfficialNoticeError(error: unknown, language: Language) {
  let message = "通知服务暂时不可用，请稍后重试";
  if (error instanceof ApiClientError) {
    if (error.status === 401) message = "登录状态已失效，请重新登录";
    else if (error.status === 403) message = "当前身份没有执行此通知操作的权限";
    else if (error.status === 409) message = "通知状态已经变化，请刷新后重试";
  } else if (error instanceof Error && error.message === "error.network.timeout") {
    message = "网络响应超时，请稍后重试。";
  }
  return translateText(message, language);
}

export function canCancelOfficialNotice(status: OfficialNoticeStatus) {
  return ["draft", "pending_review", "approved", "scheduled"].includes(status);
}

export function canRetryOfficialNotice(status: OfficialNoticeStatus, failed: number) {
  return failed > 0 && ["sent", "sending"].includes(status);
}

export function isOfficialNoticeReasonValid(reason: string) {
  return reason.trim().length >= 2;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function makeKey(prefix: string) {
  return `${prefix}:${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}:${Math.random().toString(16).slice(2)}`}`;
}

function NoticeBlocks({ blocks }: { blocks: OfficialNoticeBlock[] | undefined }) {
  return <>{blocks?.map((block) => {
    if (block.type === "divider") return <hr className="my-3 border-line" key={block.id} />;
    if (block.type === "image") return <figure key={block.id}><img alt={block.caption ?? "通知图片"} className="max-h-[420px] w-full rounded-lg object-contain" src={block.content} />{block.caption ? <figcaption className="mt-2 text-xs text-ink/50">{block.caption}</figcaption> : null}</figure>;
    if (block.type === "video") return <video className="max-h-[420px] w-full rounded-lg" controls key={block.id} src={block.content} />;
    if (block.type === "file") return <a className="font-bold text-moss underline" href={block.content} key={block.id} rel="noreferrer" target="_blank">{block.fileName ?? block.caption ?? "查看附件"}</a>;
    const fontSize = block.fontSize ?? defaultOfficialNoticeFontSize(block.type);
    const fontSizeClass = officialNoticeFontSizeClass(block.type, block.fontSize);
    if (block.type === "heading") return <h2 className={`mt-4 font-black ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}>{block.content}</h2>;
    if (block.type === "subheading") return <h3 className={`mt-3 font-black ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}>{block.content}</h3>;
    if (block.type === "bullet") return <div className={`flex gap-2 ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}><span aria-hidden="true">•</span><p className="whitespace-pre-wrap">{block.content}</p></div>;
    if (block.type === "numbered") return <div className={`flex gap-2 ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}><span aria-hidden="true">1.</span><p className="whitespace-pre-wrap">{block.content}</p></div>;
    if (block.type === "quote") return <blockquote className={`border-l-4 border-moss/40 pl-4 italic text-ink/70 ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}>{block.content}</blockquote>;
    if (block.type === "callout") return <aside className={`rounded-lg border border-moss/30 bg-mint/10 p-3 font-bold ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}>{block.content}</aside>;
    return <p className={`whitespace-pre-wrap ${fontSizeClass}`} data-notice-font-size={fontSize} key={block.id}>{block.content}</p>;
  })}</>;
}

export function OfficialNoticeManagement({ scope, composePath }: { scope: OfficialNoticeScope; composePath: string }) {
  const { hasPermission } = useAuth();
  const { language } = useOptionalI18n();
  const [items, setItems] = useState<OfficialNotice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<OfficialNoticeStatus | "">("");
  const [level, setLevel] = useState<OfficialNoticeLevel | "">("");
  const [selected, setSelected] = useState<OfficialNotice | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const canCreate = hasPermission(scope === "merchant" ? "merchant-admin:notice:create" : "button:backoffice-official-notice-create")
    && hasPermission(scope === "merchant" ? "merchant-admin:notice:send" : "button:backoffice-official-notice-send");
  const canReview = hasPermission(scope === "merchant" ? "merchant-admin:notice:review" : "button:backoffice-official-notice-review");
  const canRetry = hasPermission(scope === "merchant" ? "merchant-admin:notice:send" : "button:backoffice-official-notice-send");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await officialNoticesApi.listManaged(scope, {
        page,
        pageSize,
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(status ? { status } : {}),
        ...(level ? { level } : {})
      });
      setItems(result.list);
      setTotal(result.total);
    } catch (nextError) {
      setError(describeOfficialNoticeError(nextError, language));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, language, level, page, scope, status]);

  useEffect(() => void load(), [load]);

  const mutate = async (action: "cancel" | "archive" | "retry") => {
    if (!selected || !reason.trim()) return;
    setMutating(true);
    setError("");
    try {
      const command = { expectedLockVersion: selected.lockVersion, reason: reason.trim(), idempotencyKey: `notice-ui:${selected.publicId}:${action}:${selected.lockVersion}` };
      const updated = action === "cancel"
        ? await officialNoticesApi.cancelManaged(scope, selected.publicId, command)
        : action === "archive"
          ? await officialNoticesApi.archiveManaged(scope, selected.publicId, command)
          : await officialNoticesApi.retryManaged(scope, selected.publicId, command);
      setSelected(updated);
      setReason("");
      await load();
    } catch (nextError) {
      setError(describeOfficialNoticeError(nextError, language));
    } finally {
      setMutating(false);
    }
  };

  return (
    <ModuleShell
      title={scope === "merchant" ? "店铺通知" : "官方通知"}
      description="通知内容、受众快照、发送状态与阅读回执均来自正式数据库。"
      actions={canCreate ? <Button to={composePath}>创建通知</Button> : <Badge tone="neutral">只读</Badge>}
    >
      <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_auto_auto]">
          <label className="block">
            <span className="sr-only">搜索通知</span>
            <input
              className={inputClass}
              id={`${scope}-official-notice-search`}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                setPage(1);
                setAppliedSearch(search.trim());
              }}
              placeholder={translateNoticeText("搜索通知", language)}
              value={search}
            />
          </label>
          <select aria-label="状态筛选" className={inputClass} onChange={(event) => { setPage(1); setStatus(event.target.value as OfficialNoticeStatus | ""); }} value={status}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="级别筛选" className={inputClass} onChange={(event) => { setPage(1); setLevel(event.target.value as OfficialNoticeLevel | ""); }} value={level}>
            <option value="">全部级别</option>
            {Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button onClick={() => { setPage(1); setAppliedSearch(search.trim()); }} variant="secondary">搜索</Button>
          <Button onClick={() => void load()} variant="secondary">刷新</Button>
        </div>
      </section>
      {error ? <p className="rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
      <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
        {loading ? <p className="p-8 text-center text-sm font-bold text-ink/55">正在读取正式通知…</p> : items.length === 0 ? <p className="p-8 text-center text-sm font-bold text-ink/55">暂无符合条件的通知</p> : (
          <div className="divide-y divide-line">
            {items.map((notice) => {
              const source = notice.translations[notice.sourceLocale];
              return (
                <button className="grid w-full gap-3 p-4 text-left transition hover:bg-paper md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center" key={notice.publicId} onClick={() => { setSelected(notice); setReason(""); }} type="button">
                  <span className="min-w-0"><strong className="block truncate text-sm text-ink">{source?.title ?? notice.publicId}</strong><span className="mt-1 block text-xs font-bold text-ink/50">{notice.targetSummary} · {formatDate(notice.scheduledAt ?? notice.sentAt ?? notice.createdAt)}</span></span>
                  <span className="flex gap-2"><Badge tone={notice.level === "urgent" ? "red" : notice.level === "important" ? "yellow" : "neutral"}>{levelLabels[notice.level]}</Badge><Badge tone={statusTone[notice.status]}>{statusLabels[notice.status]}</Badge></span>
                  <span className="text-xs font-bold text-ink/55">投递 {notice.delivery.delivered}/{notice.audienceCount} · 已读 {notice.delivery.read}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line p-4 text-xs font-bold text-ink/55">
          <span>共 {total} 条</span>
          <div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="secondary">上一页</Button><Button disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)} size="sm" variant="secondary">下一页</Button></div>
        </div>
      </section>
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="通知详情">
        {selected ? <div className="space-y-5">
          <div className="flex flex-wrap gap-2"><Badge tone={statusTone[selected.status]}>{statusLabels[selected.status]}</Badge><Badge>{levelLabels[selected.level]}</Badge></div>
          <div><h3 className="text-xl font-black">{selected.translations[selected.sourceLocale]?.title}</h3><p className="mt-2 text-sm font-bold text-ink/55">{selected.translations[selected.sourceLocale]?.summary}</p></div>
          <div className="rounded-lg border border-line bg-paper p-4 text-sm leading-7"><NoticeBlocks blocks={selected.translations[selected.sourceLocale]?.blocks} /></div>
          <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="font-bold text-ink/45">受众</dt><dd className="font-black">{selected.targetSummary}</dd></div><div><dt className="font-bold text-ink/45">受众快照</dt><dd className="font-black">{selected.audienceCount}</dd></div><div><dt className="font-bold text-ink/45">投递/失败</dt><dd className="font-black">{selected.delivery.delivered}/{selected.delivery.failed}</dd></div><div><dt className="font-bold text-ink/45">阅读</dt><dd className="font-black">{selected.delivery.read}</dd></div></dl>
          <label className="block text-sm font-black">操作理由<input className={`${inputClass} mt-2`} onChange={(event) => setReason(event.target.value)} value={reason} /></label>
          <div className="flex flex-wrap gap-2">
            {canReview && canCancelOfficialNotice(selected.status) ? <Button disabled={mutating || !isOfficialNoticeReasonValid(reason)} onClick={() => void mutate("cancel")} variant="danger">取消发送</Button> : null}
            {canReview && ["sent", "cancelled"].includes(selected.status) ? <Button disabled={mutating || !isOfficialNoticeReasonValid(reason)} onClick={() => void mutate("archive")} variant="secondary">归档</Button> : null}
            {canRetry && canRetryOfficialNotice(selected.status, selected.delivery.failed) ? <Button disabled={mutating || !isOfficialNoticeReasonValid(reason)} onClick={() => void mutate("retry")} variant="secondary">重试失败投递</Button> : null}
          </div>
        </div> : null}
      </Drawer>
    </ModuleShell>
  );
}

export function OfficialNoticeComposer({ scope, returnPath }: { scope: OfficialNoticeScope; returnPath: string }) {
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const [sourceLocale, setSourceLocale] = useState<OfficialNoticeLocale>("ja");
  const [activeLocale, setActiveLocale] = useState<OfficialNoticeLocale>("ja");
  const [level, setLevel] = useState<OfficialNoticeLevel>("general");
  const [translationDrafts, setTranslationDrafts] = useState<
    Record<OfficialNoticeLocale, { title: string; summary: string; blocks: OfficialNoticeBlock[] }>
  >(() => ({
    ja: createTranslationDraft(),
    "zh-CN": createTranslationDraft(),
    "zh-TW": createTranslationDraft(),
    en: createTranslationDraft(),
    ko: createTranslationDraft()
  }));
  const [audienceType, setAudienceType] = useState(scope === "merchant" ? "shop_card_holders" : "all");
  const [identityTypes, setIdentityTypes] = useState<string[]>(["customer"]);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<PlatformManagedUser[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<PlatformManagedUser[]>([]);
  const [accountSearching, setAccountSearching] = useState(false);
  const [accountSearchError, setAccountSearchError] = useState("");
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => makeKey("create"));
  const activeTranslation = translationDrafts[activeLocale];
  const title = activeTranslation.title;
  const summary = activeTranslation.summary;
  const blocks = activeTranslation.blocks;
  const setTitle = (value: string) => setTranslationDrafts((current) => ({
    ...current,
    [activeLocale]: { ...current[activeLocale], title: value }
  }));
  const setSummary = (value: string) => setTranslationDrafts((current) => ({
    ...current,
    [activeLocale]: { ...current[activeLocale], summary: value }
  }));
  const setBlocks = (update: (current: OfficialNoticeBlock[]) => OfficialNoticeBlock[]) => {
    setTranslationDrafts((current) => ({
      ...current,
      [activeLocale]: {
        ...current[activeLocale],
        blocks: update(current[activeLocale].blocks)
      }
    }));
  };
  const normalizedTranslations = useMemo(
    () => Object.fromEntries(noticeLocales.map((locale) => [
      locale,
      {
        title: translationDrafts[locale].title.trim(),
        summary: translationDrafts[locale].summary.trim(),
        blocks: normalizeNoticeBlocks(translationDrafts[locale].blocks)
      }
    ])) as Record<OfficialNoticeLocale, { title: string; summary: string; blocks: OfficialNoticeBlock[] }>,
    [translationDrafts]
  );
  const normalizedBlocks = useMemo(
    () => normalizeNoticeBlocks(blocks),
    [blocks]
  );

  const copyCurrentTranslationToAll = () => {
    const source = translationDrafts[activeLocale];
    setTranslationDrafts(Object.fromEntries(noticeLocales.map((locale) => [
      locale,
      {
        title: source.title,
        summary: source.summary,
        blocks: source.blocks.map((block) => ({ ...block }))
      }
    ])) as Record<OfficialNoticeLocale, { title: string; summary: string; blocks: OfficialNoticeBlock[] }>);
  };

  const updateBlock = (id: string, patch: Partial<OfficialNoticeBlock>) => {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
  };
  const addBlock = (type: OfficialNoticeBlock["type"]) => {
    setBlocks((current) => [...current, createNoticeBlock(type)]);
  };
  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [block] = next.splice(index, 1);
      next.splice(nextIndex, 0, block);
      return next;
    });
  };
  const duplicateBlock = (block: OfficialNoticeBlock) => {
    setBlocks((current) => {
      const index = current.findIndex((candidate) => candidate.id === block.id);
      const copy = { ...block, id: makeKey("block") };
      return index < 0
        ? [...current, copy]
        : [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
  };
  const removeBlock = (id: string) => {
    setBlocks((current) => {
      const next = current.filter((block) => block.id !== id);
      return next.length > 0 ? next : [createNoticeBlock()];
    });
  };

  const uploadImage = async (block: OfficialNoticeBlock, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    setUploadingBlockId(block.id);
    setError("");
    try {
      const media = await contentPublicationApi.uploadContentImage(file, block.caption || file.name);
      updateBlock(block.id, {
        content: media.url,
        caption: block.caption || file.name,
        fileName: file.name,
        fileSize: file.size,
        mimeType: media.mimeType,
        source: "media",
        mediaAssetId: media.mediaAssetId
      });
    } catch (nextError) {
      setError(describeOfficialNoticeError(nextError, language));
    } finally {
      setUploadingBlockId(null);
    }
  };

  const searchAccounts = async () => {
    const keyword = accountQuery.trim();
    if (scope !== "platform" || !keyword) return;
    setAccountSearching(true);
    setAccountSearchError("");
    try {
      const result = await platformUserManagementApi.listUsers("operations", {
        keyword,
        state: "active",
        page: 1,
        page_size: 20
      });
      setAccountResults(result.list.filter((account) => account.isActive));
    } catch (nextError) {
      setAccountResults([]);
      setAccountSearchError(describeOfficialNoticeError(nextError, language));
    } finally {
      setAccountSearching(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const allLocalesComplete = noticeLocales.every((locale) => {
      const translation = normalizedTranslations[locale];
      return translation.title && translation.summary && translation.blocks.some((block) => block.type !== "divider");
    });
    if (!allLocalesComplete || (sendMode === "scheduled" && !scheduledAt)) {
      setError(translateNoticeText("请补齐五种语言的标题、摘要和正文", language));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const audience = scope === "merchant"
        ? { type: audienceType as "shop_card_holders" | "shop_employees" | "shop_technicians" }
        : audienceType === "all"
          ? { type: "all" as const }
          : audienceType === "exact_users"
            ? { type: "exact_users" as const, needoIds: selectedAccounts.map((account) => account.needoId) }
            : { type: "identity_types" as const, identityTypes: identityTypes as Array<"customer" | "technician" | "merchant_owner" | "merchant_staff" | "platform" | "platform_admin" | "scout"> };
      await officialNoticesApi.createManaged(scope, {
        sourceLocale,
        level,
        translations: normalizedTranslations,
        audience,
        sendMode,
        scheduledAt: sendMode === "scheduled" ? new Date(scheduledAt).toISOString() : null,
        idempotencyKey
      });
      navigate(returnPath);
    } catch (nextError) {
      setError(describeOfficialNoticeError(nextError, language));
    } finally {
      setSubmitting(false);
    }
  };

  const audienceOptions = scope === "merchant"
    ? [["shop_card_holders", "本店持卡用户"], ["shop_employees", "本店员工"], ["shop_technicians", "本店技师"]]
    : [["all", translateNoticeText("全体用户", language)], ["identity_types", translateNoticeText("身份类型", language)], ["exact_users", translateNoticeText("指定账号", language)]];
  const allLocalesComplete = noticeLocales.every((locale) => {
    const translation = normalizedTranslations[locale];
    return Boolean(
      translation.title
      && translation.summary
      && translation.blocks.some((block) => block.type !== "divider")
    );
  });
  const audienceReady = scope === "merchant"
    || audienceType === "all"
    || (audienceType === "identity_types" && identityTypes.length > 0)
    || (audienceType === "exact_users" && selectedAccounts.length > 0);
  const hasSchedule = sendMode === "now" || Boolean(scheduledAt);
  const canSubmit = allLocalesComplete && audienceReady && hasSchedule && !submitting;
  const targetSummary = scope === "merchant"
    ? audienceOptions.find(([value]) => value === audienceType)?.[1]
    : audienceType === "all"
      ? "全体用户"
      : audienceType === "identity_types"
        ? identityTypes.map((identityType) => identityTypeLabels[language][identityType as NoticeIdentityType]).join(" / ")
        : selectedAccounts.length > 0
          ? selectedAccounts.map((account) => `${account.username} / ${account.needoId}`).join("、")
          : "未选择账号";

  return (
    <ModuleShell
      title={scope === "merchant" ? "创建店铺通知" : "发送官方通知"}
      description={scope === "merchant"
        ? "受众由服务端按当前权限与店铺范围生成快照，不接受前端指定账号或店铺。"
        : "编辑官方通知；发送时固定受众并记录投递与已读状态。"}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button to={returnPath} variant="secondary">返回列表</Button>
          <Button disabled={!canSubmit} form="official-notice-compose-form" type="submit">
            {submitting ? "提交中…" : "确认创建"}
          </Button>
        </div>
      )}
    >
      <form
        className="space-y-5 pb-36"
        id="official-notice-compose-form"
        onSubmit={submit}
      >
        {error ? (
          <p className="rounded-lg border border-coral/25 bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
            {error}
          </p>
        ) : null}

        <section className="grid items-stretch gap-4 lg:grid-cols-3 xl:grid-cols-[minmax(220px,0.78fr)_minmax(360px,1.42fr)_minmax(300px,1fr)]">
          <section className="h-full rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <TitleWithInfo
                as="h2"
                info="重要和紧急通知到达发送时间后，会在目标身份首页自动弹出。"
                label="发送设置说明"
                title="发送设置"
                titleClassName="text-lg font-black"
              />
              <Badge tone={level === "general" ? "neutral" : "red"}>
                {levelLabels[level]}
              </Badge>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-ink/40">通知级别</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.entries(levelLabels) as Array<[OfficialNoticeLevel, string]>).map(([value, label]) => (
                <button
                  className={`h-10 rounded-lg border px-4 text-sm font-black transition ${level === value ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/65 hover:border-moss"}`}
                  key={value}
                  onClick={() => setLevel(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs font-black text-ink/40">
                {translateNoticeText("源语言", language)}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {noticeLocales.map((locale) => (
                  <button
                    aria-pressed={sourceLocale === locale}
                    className={`h-10 rounded-lg border px-3 text-xs font-black transition ${sourceLocale === locale ? "border-moss bg-moss text-white" : "border-line bg-paper text-ink/65 hover:border-moss"}`}
                    data-source-locale={locale}
                    key={locale}
                    onClick={() => {
                      setSourceLocale(locale);
                      setActiveLocale(locale);
                    }}
                    type="button"
                  >
                    {noticeLocaleLabels[language][locale]}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="h-full rounded-lg border border-line bg-white p-4 shadow-panel">
            <TitleWithInfo
              as="h2"
              info={scope === "platform"
                ? "按身份端群发，或从正式全局账号库按邮箱、手机号、NeeDoID 搜索目标账号。"
                : "店铺受众由服务端根据当前店铺与权限生成。"}
              label="发送对象说明"
              title="发送对象"
              titleClassName="text-lg font-black"
            />
            <div className="mt-5 grid gap-2 md:grid-cols-3">
              {audienceOptions.map(([value, label]) => (
                <label
                  className={`cursor-pointer rounded-lg border px-3 py-3 text-sm font-black transition ${audienceType === value ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/65 hover:border-moss"}`}
                  key={value}
                >
                  <input
                    checked={audienceType === value}
                    className="sr-only"
                    name="audience"
                    onChange={() => setAudienceType(value)}
                    type="radio"
                  />
                  {label}
                </label>
              ))}
            </div>
            {scope === "platform" && audienceType === "identity_types" ? (
              <fieldset className="mt-3">
                <legend className="text-xs font-black text-ink/40">{translateNoticeText("身份类型", language)}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {identityOptions.map((value) => (
                    <label className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-bold" key={value}>
                      <input
                        checked={identityTypes.includes(value)}
                        className="mr-2"
                        onChange={(event) => setIdentityTypes((current) => event.target.checked
                          ? [...current, value]
                          : current.filter((item) => item !== value))}
                        type="checkbox"
                      />
                      {identityTypeLabels[language][value]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {scope === "platform" && audienceType === "exact_users" ? (
              <fieldset className="mt-3 space-y-3 rounded-lg border border-line bg-paper p-3">
                <legend className="px-1 text-xs font-black text-ink/40">{translateNoticeText("全局搜索账号", language)}</legend>
                <div className="flex flex-col gap-2 md:flex-row">
                  <label className="min-w-0 flex-1 text-sm font-black">
                    {translateNoticeText("邮箱、手机号或 NeeDoID", language)}
                    <input
                      className={`${inputClass} mt-2`}
                      onChange={(event) => setAccountQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void searchAccounts();
                        }
                      }}
                      placeholder={translateNoticeText("输入邮箱、手机号或 NeeDoID", language)}
                      value={accountQuery}
                    />
                  </label>
                  <Button
                    className="self-end"
                    disabled={accountSearching || !accountQuery.trim()}
                    onClick={() => void searchAccounts()}
                    type="button"
                    variant="secondary"
                  >
                    {accountSearching ? translateNoticeText("正在搜索账号", language) : translateNoticeText("搜索账号", language)}
                  </Button>
                </div>
                {accountSearchError ? <p className="text-sm font-bold text-coral">{accountSearchError}</p> : null}
                {selectedAccounts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedAccounts.map((account) => (
                      <button
                        aria-label={`${translateNoticeText("移除账号", language)} ${account.needoId}`}
                        className="rounded-full border border-moss/30 bg-white px-3 py-2 text-xs font-black text-moss"
                        key={account.needoId}
                        onClick={() => setSelectedAccounts((current) => current.filter((item) => item.needoId !== account.needoId))}
                        type="button"
                      >
                        {account.username} · {account.needoId} ×
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="grid max-h-56 gap-2 overflow-y-auto">
                  {accountResults.map((account) => {
                    const selected = selectedAccounts.some((item) => item.needoId === account.needoId);
                    return (
                      <button
                        aria-label={`${selected ? translateNoticeText("已选择账号", language) : translateNoticeText("选择账号", language)} ${account.needoId}`}
                        className="grid gap-1 rounded-lg border border-line bg-white p-3 text-left text-sm disabled:opacity-60 md:grid-cols-[minmax(0,1fr)_auto]"
                        disabled={selected}
                        key={account.needoId}
                        onClick={() => setSelectedAccounts((current) => current.some((item) => item.needoId === account.needoId) ? current : [...current, account])}
                        type="button"
                      >
                        <span>
                          <strong className="block text-ink">{account.username} · {account.needoId}</strong>
                          <span className="mt-1 block text-xs font-bold text-ink/55">
                            {account.email}{account.phone ? ` · ${account.phone}` : ""}
                          </span>
                        </span>
                        <span className="text-xs font-black text-moss">
                          {selected ? translateNoticeText("已选择账号", language) : translateNoticeText("选择账号", language)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </section>

          <section className="h-full rounded-lg border border-line bg-white p-4 shadow-panel">
            <TitleWithInfo
              as="h2"
              info="立即发送会在提交后进入投递；定时发送按保存时间由后台任务执行。"
              label="发送时间说明"
              title="发送时间"
              titleClassName="text-lg font-black"
            />
            <div className="mt-5 grid grid-cols-2 gap-2">
              {(["now", "scheduled"] as const).map((value) => (
                <button
                  className={`h-10 rounded-lg border px-3 text-sm font-black ${sendMode === value ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/65"}`}
                  key={value}
                  onClick={() => setSendMode(value)}
                  type="button"
                >
                  {value === "now" ? "立即发送" : "定时发送"}
                </button>
              ))}
            </div>
            {sendMode === "scheduled" ? (
              <label className="mt-3 block text-sm font-black">
                发送时间
                <input
                  className={`${inputClass} mt-2 bg-paper`}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  required
                  type="datetime-local"
                  value={scheduledAt}
                />
              </label>
            ) : (
              <div className="mt-3 rounded-lg border border-moss/30 bg-moss/10 px-3 py-3 text-sm font-black text-moss">
                提交后立即进入逐身份投递
              </div>
            )}
          </section>
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="official-notice-editor overflow-hidden rounded-lg border border-line bg-white shadow-panel">
            <div className="border-b border-line bg-paper px-4 py-3">
              <TitleWithInfo
                as="h2"
                info="使用内容块组织正文。图片可上传到正式内容媒体库；视频和文件只接受持久化 HTTPS 地址。"
                label="编辑器说明"
                title="通知正文"
                titleClassName="text-lg font-black"
                variant="paper"
              />
            </div>
            <div className="border-b border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {noticeLocales.map((locale) => {
                    const translation = normalizedTranslations[locale];
                    const complete = Boolean(
                      translation.title
                      && translation.summary
                      && translation.blocks.some((block) => block.type !== "divider")
                    );
                    return (
                      <button
                        aria-pressed={activeLocale === locale}
                        className={`rounded-lg border px-3 py-2 text-xs font-black ${activeLocale === locale ? "border-moss bg-moss text-white" : "border-line bg-paper text-ink"}`}
                        key={locale}
                        onClick={() => setActiveLocale(locale)}
                        type="button"
                      >
                        {noticeLocaleLabels[language][locale]}
                        {locale === sourceLocale ? ` · ${translateNoticeText("源语言", language)}` : ""}
                        {complete ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
                <Button onClick={copyCurrentTranslationToAll} size="sm" type="button" variant="secondary">
                  {translateNoticeText("复制当前内容到全部语言", language)}
                </Button>
              </div>
              <p className="mt-2 text-xs font-bold text-ink/50">
                {translateNoticeText("每个语言标签都可独立编辑；复制后仍可逐项修改，发送时五份内容会一起保存。", language)}
              </p>
            </div>
            <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-2">
              <label className="text-sm font-black">
                <span className="text-xs font-black text-ink/40">标题</span>
                <input
                  className={`${inputClass} mt-2 bg-paper text-base font-black`}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  value={title}
                />
              </label>
              <label className="text-sm font-black">
                <span className="text-xs font-black text-ink/40">摘要</span>
                <input
                  className={`${inputClass} mt-2 bg-paper`}
                  maxLength={500}
                  onChange={(event) => setSummary(event.target.value)}
                  required
                  value={summary}
                />
              </label>
            </div>
            <div className="divide-y divide-line">
              {blocks.map((block, index) => (
                <article className="bg-white p-4" key={block.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`内容块 ${index + 1} 类型`}
                        className="h-9 rounded-lg border border-line bg-paper px-3 text-xs font-black"
                        onChange={(event) => updateBlock(block.id, {
                          type: event.target.value as OfficialNoticeBlock["type"],
                          content: event.target.value === "divider" ? "" : block.content,
                          caption: undefined,
                          fileName: undefined,
                          fileSize: undefined,
                          mimeType: undefined,
                          fontSize: isTextualOfficialNoticeBlock(event.target.value as OfficialNoticeBlock["type"])
                            ? block.fontSize
                            : undefined,
                          source: undefined,
                          mediaAssetId: undefined
                        })}
                        value={block.type}
                      >
                        {blockOptions.map((option) => (
                          <option key={option.type} value={option.type}>{option.label}</option>
                        ))}
                      </select>
                      <Badge tone="neutral">Block {index + 1}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button disabled={index === 0} onClick={() => moveBlock(block.id, -1)} size="sm" type="button" variant="secondary">↑</Button>
                      <Button disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} size="sm" type="button" variant="secondary">↓</Button>
                      <Button onClick={() => duplicateBlock(block)} size="sm" type="button" variant="secondary">复制</Button>
                      <Button onClick={() => removeBlock(block.id)} size="sm" type="button" variant="danger">删除</Button>
                    </div>
                  </div>
                  {block.type === "divider" ? (
                    <div className="mt-4 border-t border-line" />
                  ) : block.type === "image" || block.type === "video" || block.type === "file" ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <label className="text-sm font-black">
                          <span className="text-xs font-black text-ink/40">资源 URL</span>
                          <input
                            className={`${inputClass} mt-2 bg-paper`}
                            onChange={(event) => updateBlock(block.id, {
                              content: event.target.value,
                              source: "url",
                              mediaAssetId: undefined,
                              fileName: block.type === "file" ? block.fileName : undefined,
                              fileSize: undefined,
                              mimeType: undefined
                            })}
                            placeholder={blockPlaceholder(block.type)}
                            type="url"
                            value={block.source === "media" ? "" : block.content}
                          />
                        </label>
                        <label className="text-sm font-black">
                          <span className="text-xs font-black text-ink/40">说明文字</span>
                          <input
                            className={`${inputClass} mt-2 bg-paper`}
                            onChange={(event) => updateBlock(block.id, {
                              caption: event.target.value,
                              ...(block.type === "file" ? { fileName: event.target.value } : {})
                            })}
                            value={block.caption ?? ""}
                          />
                        </label>
                      </div>
                      {block.type === "image" && scope === "platform" ? (
                        <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black">
                          {uploadingBlockId === block.id ? "上传中…" : "上传图片到正式媒体库"}
                          <input
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={uploadingBlockId === block.id}
                            onChange={(event) => void uploadImage(block, event)}
                            type="file"
                          />
                        </label>
                      ) : (
                        <p className="text-xs font-bold text-ink/50">当前只保存正式 HTTPS 媒体地址，不会把文件写入浏览器缓存。</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
                      <label className="block text-sm font-black">
                        {blockOptions.find((option) => option.type === block.type)?.label}
                        <textarea
                          className={`${textareaClass} mt-2 bg-paper`}
                          maxLength={20000}
                          onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                          placeholder={blockPlaceholder(block.type)}
                          required
                          value={block.content}
                        />
                      </label>
                      <label className="block text-sm font-black">
                        {translateNoticeText("字号", language)}
                        <select
                          className={`${inputClass} mt-2 bg-paper`}
                          onChange={(event) => updateBlock(block.id, {
                            fontSize: event.target.value as NonNullable<OfficialNoticeBlock["fontSize"]>
                          })}
                          value={block.fontSize ?? defaultOfficialNoticeFontSize(block.type)}
                        >
                          <option value="small">{translateNoticeText("小", language)}</option>
                          <option value="medium">{translateNoticeText("标准", language)}</option>
                          <option value="large">{translateNoticeText("大", language)}</option>
                          <option value="xlarge">{translateNoticeText("超大", language)}</option>
                        </select>
                      </label>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-28">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="发送前检查当前语言内容、时间、对象和内容块顺序。"
                  label="预览说明"
                  title="发送预览"
                  titleClassName="text-lg font-black"
                />
                <Badge tone={level === "general" ? "neutral" : "red"}>{levelLabels[level]}</Badge>
              </div>
              <div className="mt-4 rounded-lg border border-line bg-paper p-4">
                <p className="text-xs font-black text-ink/40">发送时间</p>
                <p className="mt-1 text-sm font-black">{sendMode === "now" ? "立即发送" : scheduledAt || "未设置"}</p>
                <p className="mt-3 text-xs font-black text-ink/40">发送对象</p>
                <p className="mt-1 text-sm font-black">{targetSummary || "未选择"}</p>
              </div>
              <div className="mt-4 space-y-3">
                <h3 className="text-xl font-black">{title || "官方通知标题"}</h3>
                <p className="text-sm font-bold text-ink/55">{summary || "通知摘要"}</p>
                <div className="space-y-3 text-sm leading-7">
                  <NoticeBlocks blocks={normalizedBlocks.length > 0 ? normalizedBlocks : blocks} />
                </div>
              </div>
            </section>
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="text-lg font-black">发送检查</h2>
              <div className="mt-3 space-y-2 text-sm font-bold">
                <p className={allLocalesComplete ? "text-moss" : "text-coral"}>五种语言：{allLocalesComplete ? "已填写" : "未填写完整"}</p>
                <p className={audienceReady ? "text-moss" : "text-coral"}>对象：{audienceReady ? targetSummary : "未选择"}</p>
                <p className={hasSchedule ? "text-moss" : "text-coral"}>时间：{hasSchedule ? (sendMode === "now" ? "立即发送" : "已设置") : "未设置"}</p>
              </div>
              <Button className="mt-4 w-full" disabled={!canSubmit} type="submit">
                {submitting ? "提交中…" : "确认创建"}
              </Button>
            </section>
          </aside>
        </section>

        <div
          className="fixed inset-x-0 bottom-0 z-[55] border-t border-line bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_rgba(0,0,0,0.18)] backdrop-blur lg:left-64 md:px-5 2xl:px-6"
          data-official-notice-block-toolbar
        >
          <div className="scrollbar-none flex min-w-0 items-center gap-3 overflow-x-auto">
            {blockOptions.map((option) => (
              <button
                className="focus-ring inline-flex h-11 shrink-0 items-center gap-3 rounded-lg border border-line bg-white px-4 text-sm font-black text-ink/65 transition hover:border-moss"
                key={option.type}
                onClick={() => addBlock(option.type)}
                type="button"
              >
                <span className="grid h-7 min-w-7 place-items-center rounded-md bg-paper px-1 text-xs text-ink">
                  {option.icon}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </ModuleShell>
  );
}

export function OfficialNoticeInbox() {
  const { language } = useOptionalI18n();
  const locale = useMemo<OfficialNoticeLocale>(() => language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language, [language]);
  const [items, setItems] = useState<RecipientOfficialNotice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await officialNoticesApi.listInbox({ locale, unreadOnly, page, pageSize }); setItems(result.list); setTotal(result.total); } catch (nextError) { setError(describeOfficialNoticeError(nextError, language)); } finally { setLoading(false); } }, [language, locale, page, unreadOnly]);
  useEffect(() => void load(), [load]);
  const markRead = async (item: RecipientOfficialNotice) => { if (item.readAt) return; try { const result = await officialNoticesApi.markRead(item.publicId); setItems((current) => current.map((candidate) => candidate.publicId === item.publicId ? { ...candidate, readAt: result.readAt } : candidate)); window.dispatchEvent(new Event(OFFICIAL_NOTICE_CHANGED_EVENT)); } catch (nextError) { setError(describeOfficialNoticeError(nextError, language)); } };
  return <ModuleShell title="通知收件箱" description="这里只展示当前登录身份实际收到的通知及其阅读状态。" actions={<label className="flex items-center gap-2 text-sm font-black"><input checked={unreadOnly} onChange={(event) => { setPage(1); setUnreadOnly(event.target.checked); }} type="checkbox" />只看未读</label>}>
    {error ? <p className="rounded-lg bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
    <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">{loading ? <p className="p-8 text-center text-sm font-bold text-ink/55">正在读取收件箱…</p> : items.length === 0 ? <p className="p-8 text-center text-sm font-bold text-ink/55">暂无通知</p> : <div className="divide-y divide-line">{items.map((item) => <article className="p-5" key={item.publicId}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2"><Badge tone={item.readAt ? "neutral" : "blue"}>{item.readAt ? "已读" : "未读"}</Badge><Badge tone={item.level === "urgent" ? "red" : item.level === "important" ? "yellow" : "neutral"}>{levelLabels[item.level]}</Badge></div><h3 className="mt-3 text-lg font-black">{item.title}</h3><p className="mt-1 text-sm font-bold text-ink/55">{item.summary}</p></div><Button disabled={Boolean(item.readAt)} onClick={() => void markRead(item)} size="sm" variant="secondary">标记已读</Button></div><div className="mt-4 rounded-lg bg-paper p-4 text-sm leading-7"><NoticeBlocks blocks={item.blocks} /></div><p className="mt-3 text-xs font-bold text-ink/45">{item.targetSummary} · {formatDate(item.sentAt)}</p></article>)}</div>}<div className="flex items-center justify-between border-t border-line p-4 text-xs font-bold text-ink/55"><span>共 {total} 条</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="secondary">上一页</Button><Button disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)} size="sm" variant="secondary">下一页</Button></div></div></section>
  </ModuleShell>;
}
