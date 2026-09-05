import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
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
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../auth/AuthProvider";
import { translateText, type Language } from "../../i18n/translations";
import { platformUserManagementApi } from "../platform-user-management/api";
import type { PlatformManagedUser } from "../platform-user-management/types";
import { contentPublicationApi } from "../../api/contentPublication";

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

function createNoticeBlock(type: OfficialNoticeBlock["type"] = "paragraph"): OfficialNoticeBlock {
  return { id: makeKey("block"), type, content: "" };
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
    if (block.type === "heading") return <h2 className="mt-4 text-xl font-black" key={block.id}>{block.content}</h2>;
    if (block.type === "subheading") return <h3 className="mt-3 text-base font-black" key={block.id}>{block.content}</h3>;
    if (block.type === "bullet") return <div className="flex gap-2" key={block.id}><span aria-hidden="true">•</span><p className="whitespace-pre-wrap">{block.content}</p></div>;
    if (block.type === "numbered") return <div className="flex gap-2" key={block.id}><span aria-hidden="true">1.</span><p className="whitespace-pre-wrap">{block.content}</p></div>;
    if (block.type === "quote") return <blockquote className="border-l-4 border-moss/40 pl-4 italic text-ink/70" key={block.id}>{block.content}</blockquote>;
    if (block.type === "callout") return <aside className="rounded-lg border border-moss/30 bg-mint/10 p-3 font-bold" key={block.id}>{block.content}</aside>;
    return <p className="whitespace-pre-wrap" key={block.id}>{block.content}</p>;
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
              placeholder={translateText("搜索通知", language)}
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
  const [level, setLevel] = useState<OfficialNoticeLevel>("general");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [blocks, setBlocks] = useState<OfficialNoticeBlock[]>(() => [createNoticeBlock()]);
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
  const normalizedBlocks = useMemo(
    () => blocks
      .filter((block) => block.type === "divider" || block.content.trim())
      .map((block) => ({
        ...block,
        content: block.content.trim(),
        ...(block.caption?.trim() ? { caption: block.caption.trim() } : {})
      })),
    [blocks]
  );

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
      const result = await platformUserManagementApi.listUsers({
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
    if (!title.trim() || !summary.trim() || normalizedBlocks.length === 0 || (sendMode === "scheduled" && !scheduledAt)) return;
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
        sourceLocale, level, title: title.trim(), summary: summary.trim(),
        blocks: normalizedBlocks,
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

  const identityOptions = ["customer", "technician", "merchant_owner", "merchant_staff", "platform", "platform_admin", "scout"];
  const audienceOptions = scope === "merchant"
    ? [["shop_card_holders", "本店持卡用户"], ["shop_employees", "本店员工"], ["shop_technicians", "本店技师"]]
    : [["all", "全体用户"], ["identity_types", "身份类型"], ["exact_users", translateText("指定账号", language)]];
  return <ModuleShell title={scope === "merchant" ? "创建店铺通知" : "发送官方通知"} description={scope === "merchant" ? "受众由服务端按当前权限与店铺范围生成快照，不接受前端指定账号或店铺。" : "全体与身份受众由服务端生成；指定账号通过正式全局账号目录搜索并在发送时再次校验。"} actions={<Button to={returnPath} variant="secondary">返回列表</Button>}>
    <form className="space-y-5 rounded-lg border border-line bg-white p-5 shadow-panel" onSubmit={submit}>
      {error ? <p className="rounded-lg bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-black">源语言<select className={`${inputClass} mt-2`} onChange={(event) => setSourceLocale(event.target.value as OfficialNoticeLocale)} value={sourceLocale}>{["ja", "zh-CN", "zh-TW", "en", "ko"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-black">级别<select className={`${inputClass} mt-2`} onChange={(event) => setLevel(event.target.value as OfficialNoticeLevel)} value={level}>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <label className="block text-sm font-black">标题<input className={`${inputClass} mt-2`} maxLength={160} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
      <label className="block text-sm font-black">摘要<input className={`${inputClass} mt-2`} maxLength={500} onChange={(event) => setSummary(event.target.value)} required value={summary} /></label>
      <section className="overflow-hidden rounded-lg border border-line"><div className="border-b border-line bg-paper px-4 py-3"><h2 className="text-base font-black">通知正文</h2><p className="mt-1 text-xs font-bold text-ink/50">按顺序编辑结构化内容块；图片上传使用正式媒体接口，视频和文件只接受正式 URL。</p></div><div className="divide-y divide-line">{blocks.map((block, index) => <article className="space-y-3 p-4" key={block.id}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><select aria-label={`内容块 ${index + 1} 类型`} className="h-9 rounded-lg border border-line bg-paper px-3 text-xs font-black" onChange={(event) => updateBlock(block.id, { type: event.target.value as OfficialNoticeBlock["type"], content: "", caption: undefined, fileName: undefined, fileSize: undefined, mimeType: undefined, source: undefined, mediaAssetId: undefined })} value={block.type}>{blockOptions.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select><Badge tone="neutral">Block {index + 1}</Badge></div><div className="flex gap-2"><Button disabled={index === 0} onClick={() => moveBlock(block.id, -1)} size="sm" type="button" variant="secondary">↑</Button><Button disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} size="sm" type="button" variant="secondary">↓</Button><Button onClick={() => duplicateBlock(block)} size="sm" type="button" variant="secondary">复制</Button><Button onClick={() => removeBlock(block.id)} size="sm" type="button" variant="danger">删除</Button></div></div>{block.type === "divider" ? <hr className="border-line" /> : block.type === "image" || block.type === "video" || block.type === "file" ? <div className="space-y-3"><label className="block text-sm font-black">{blockOptions.find((option) => option.type === block.type)?.label} URL<input className={`${inputClass} mt-2`} onChange={(event) => updateBlock(block.id, { content: event.target.value, source: "url", mediaAssetId: undefined, fileName: block.type === "file" ? block.fileName : undefined, fileSize: undefined, mimeType: undefined })} placeholder={blockPlaceholder(block.type)} type="url" value={block.source === "media" ? "" : block.content} /></label><label className="block text-sm font-black">说明文字<input className={`${inputClass} mt-2`} onChange={(event) => updateBlock(block.id, { caption: event.target.value, ...(block.type === "file" ? { fileName: event.target.value } : {}) })} value={block.caption ?? ""} /></label>{block.type === "image" && scope === "platform" ? <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black">{uploadingBlockId === block.id ? "上传中…" : "上传图片"}<input accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingBlockId === block.id} onChange={(event) => void uploadImage(block, event)} type="file" /></label> : <p className="text-xs font-bold text-ink/50">当前只保存正式 HTTPS 媒体地址，不会把文件写入浏览器缓存。</p>}{block.content ? <div className="rounded-lg border border-line bg-paper p-3"><NoticeBlocks blocks={[block]} /></div> : null}</div> : <label className="block text-sm font-black">{blockOptions.find((option) => option.type === block.type)?.label}<textarea className={`${textareaClass} mt-2`} maxLength={20000} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder={blockPlaceholder(block.type)} required value={block.content} /></label>}</article>)}</div><div className="flex gap-2 overflow-x-auto border-t border-line bg-paper p-3">{blockOptions.map((option) => <button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-black hover:border-moss" key={option.type} onClick={() => addBlock(option.type)} type="button"><span className="grid h-6 min-w-6 place-items-center rounded bg-paper px-1">{option.icon}</span>{option.label}</button>)}</div></section>
      <fieldset><legend className="text-sm font-black">发送对象</legend><div className="mt-2 grid gap-2 md:grid-cols-3">{audienceOptions.map(([value, label]) => <label className="rounded-lg border border-line p-3 text-sm font-bold" key={value}><input checked={audienceType === value} className="mr-2" name="audience" onChange={() => setAudienceType(value)} type="radio" />{label}</label>)}</div></fieldset>
      {scope === "platform" && audienceType === "identity_types" ? <fieldset><legend className="text-sm font-black">身份类型</legend><div className="mt-2 flex flex-wrap gap-2">{identityOptions.map((value) => <label className="rounded-lg border border-line px-3 py-2 text-xs font-bold" key={value}><input checked={identityTypes.includes(value)} className="mr-2" onChange={(event) => setIdentityTypes((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} type="checkbox" />{value}</label>)}</div></fieldset> : null}
      {scope === "platform" && audienceType === "exact_users" ? <fieldset className="space-y-3 rounded-lg border border-line bg-paper p-4"><legend className="px-1 text-sm font-black">{translateText("全局搜索账号", language)}</legend><div className="flex flex-col gap-2 md:flex-row"><label className="min-w-0 flex-1 text-sm font-black">{translateText("邮箱、手机号或 NeeDoID", language)}<input className={`${inputClass} mt-2`} onChange={(event) => setAccountQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchAccounts(); } }} placeholder={translateText("输入邮箱、手机号或 NeeDoID", language)} value={accountQuery} /></label><Button disabled={accountSearching || !accountQuery.trim()} onClick={() => void searchAccounts()} type="button" variant="secondary">{accountSearching ? translateText("正在搜索账号", language) : translateText("搜索账号", language)}</Button></div>{accountSearchError ? <p className="text-sm font-bold text-coral">{accountSearchError}</p> : null}{selectedAccounts.length > 0 ? <div className="flex flex-wrap gap-2">{selectedAccounts.map((account) => <button aria-label={`${translateText("移除账号", language)} ${account.needoId}`} className="rounded-full border border-moss/30 bg-white px-3 py-2 text-xs font-black text-moss" key={account.needoId} onClick={() => setSelectedAccounts((current) => current.filter((item) => item.needoId !== account.needoId))} type="button">{account.username} · {account.needoId} ×</button>)}</div> : null}<div className="grid gap-2">{accountResults.map((account) => { const selected = selectedAccounts.some((item) => item.needoId === account.needoId); return <button aria-label={`${selected ? translateText("已选择账号", language) : translateText("选择账号", language)} ${account.needoId}`} className="grid gap-1 rounded-lg border border-line bg-white p-3 text-left text-sm disabled:opacity-60 md:grid-cols-[minmax(0,1fr)_auto]" disabled={selected} key={account.needoId} onClick={() => setSelectedAccounts((current) => current.some((item) => item.needoId === account.needoId) ? current : [...current, account])} type="button"><span><strong className="block text-ink">{account.username} · {account.needoId}</strong><span className="mt-1 block text-xs font-bold text-ink/55">{account.email}{account.phone ? ` · ${account.phone}` : ""}</span></span><span className="text-xs font-black text-moss">{selected ? translateText("已选择账号", language) : translateText("选择账号", language)}</span></button>; })}</div></fieldset> : null}
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-black">发送方式<select className={`${inputClass} mt-2`} onChange={(event) => setSendMode(event.target.value as "now" | "scheduled")} value={sendMode}><option value="now">立即发送</option><option value="scheduled">定时发送</option></select></label>{sendMode === "scheduled" ? <label className="text-sm font-black">发送时间<input className={`${inputClass} mt-2`} onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label> : null}</div>
      <div className="flex justify-end"><Button disabled={submitting || (scope === "platform" && audienceType === "identity_types" && identityTypes.length === 0) || (scope === "platform" && audienceType === "exact_users" && selectedAccounts.length === 0)} type="submit">{submitting ? "提交中…" : "确认创建"}</Button></div>
    </form>
  </ModuleShell>;
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
  const markRead = async (item: RecipientOfficialNotice) => { if (item.readAt) return; try { const result = await officialNoticesApi.markRead(item.publicId); setItems((current) => current.map((candidate) => candidate.publicId === item.publicId ? { ...candidate, readAt: result.readAt } : candidate)); } catch (nextError) { setError(describeOfficialNoticeError(nextError, language)); } };
  return <ModuleShell title="通知收件箱" description="这里只展示当前登录身份实际收到的通知及其阅读状态。" actions={<label className="flex items-center gap-2 text-sm font-black"><input checked={unreadOnly} onChange={(event) => { setPage(1); setUnreadOnly(event.target.checked); }} type="checkbox" />只看未读</label>}>
    {error ? <p className="rounded-lg bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
    <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">{loading ? <p className="p-8 text-center text-sm font-bold text-ink/55">正在读取收件箱…</p> : items.length === 0 ? <p className="p-8 text-center text-sm font-bold text-ink/55">暂无通知</p> : <div className="divide-y divide-line">{items.map((item) => <article className="p-5" key={item.publicId}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2"><Badge tone={item.readAt ? "neutral" : "blue"}>{item.readAt ? "已读" : "未读"}</Badge><Badge tone={item.level === "urgent" ? "red" : item.level === "important" ? "yellow" : "neutral"}>{levelLabels[item.level]}</Badge></div><h3 className="mt-3 text-lg font-black">{item.title}</h3><p className="mt-1 text-sm font-bold text-ink/55">{item.summary}</p></div><Button disabled={Boolean(item.readAt)} onClick={() => void markRead(item)} size="sm" variant="secondary">标记已读</Button></div><div className="mt-4 rounded-lg bg-paper p-4 text-sm leading-7"><NoticeBlocks blocks={item.blocks} /></div><p className="mt-3 text-xs font-bold text-ink/45">{item.targetSummary} · {formatDate(item.sentAt)}</p></article>)}</div>}<div className="flex items-center justify-between border-t border-line p-4 text-xs font-bold text-ink/55"><span>共 {total} 条</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="secondary">上一页</Button><Button disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)} size="sm" variant="secondary">下一页</Button></div></div></section>
  </ModuleShell>;
}
