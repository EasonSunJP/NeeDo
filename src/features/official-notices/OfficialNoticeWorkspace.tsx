import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
    return <p className="whitespace-pre-wrap" key={block.id}>{block.content}</p>;
  })}</>;
}

export function OfficialNoticeManagement({ scope, composePath }: { scope: OfficialNoticeScope; composePath: string }) {
  const { hasPermission } = useAuth();
  const { language } = useOptionalI18n();
  const [items, setItems] = useState<OfficialNotice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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
  }, [language, level, page, scope, status]);

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
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select aria-label="状态筛选" className={inputClass} onChange={(event) => { setPage(1); setStatus(event.target.value as OfficialNoticeStatus | ""); }} value={status}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="级别筛选" className={inputClass} onChange={(event) => { setPage(1); setLevel(event.target.value as OfficialNoticeLevel | ""); }} value={level}>
            <option value="">全部级别</option>
            {Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
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
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState(scope === "merchant" ? "shop_card_holders" : "all");
  const [identityTypes, setIdentityTypes] = useState<string[]>(["customer"]);
  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => makeKey("create"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !summary.trim() || !body.trim() || (sendMode === "scheduled" && !scheduledAt)) return;
    setSubmitting(true);
    setError("");
    try {
      const audience = scope === "merchant"
        ? { type: audienceType as "shop_card_holders" | "shop_employees" | "shop_technicians" }
        : audienceType === "all"
          ? { type: "all" as const }
          : { type: "identity_types" as const, identityTypes: identityTypes as Array<"customer" | "technician" | "merchant_owner" | "merchant_staff" | "platform" | "platform_admin" | "scout"> };
      await officialNoticesApi.createManaged(scope, {
        sourceLocale, level, title: title.trim(), summary: summary.trim(),
        blocks: [{ id: "body", type: "paragraph", content: body.trim() }],
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
  return <ModuleShell title={scope === "merchant" ? "创建店铺通知" : "发送官方通知"} description="受众由服务端按当前权限与店铺范围生成快照，不接受前端指定账号或店铺。" actions={<Button to={returnPath} variant="secondary">返回列表</Button>}>
    <form className="space-y-5 rounded-lg border border-line bg-white p-5 shadow-panel" onSubmit={submit}>
      {error ? <p className="rounded-lg bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-black">源语言<select className={`${inputClass} mt-2`} onChange={(event) => setSourceLocale(event.target.value as OfficialNoticeLocale)} value={sourceLocale}>{["ja", "zh-CN", "zh-TW", "en", "ko"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-black">级别<select className={`${inputClass} mt-2`} onChange={(event) => setLevel(event.target.value as OfficialNoticeLevel)} value={level}>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <label className="block text-sm font-black">标题<input className={`${inputClass} mt-2`} maxLength={160} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
      <label className="block text-sm font-black">摘要<input className={`${inputClass} mt-2`} maxLength={500} onChange={(event) => setSummary(event.target.value)} required value={summary} /></label>
      <label className="block text-sm font-black">正文<textarea className={`${textareaClass} mt-2`} maxLength={20000} onChange={(event) => setBody(event.target.value)} required value={body} /></label>
      <fieldset><legend className="text-sm font-black">发送对象</legend><div className="mt-2 grid gap-2 md:grid-cols-3">{(scope === "merchant" ? [["shop_card_holders", "本店持卡用户"], ["shop_employees", "本店员工"], ["shop_technicians", "本店技师"]] : [["all", "全体用户"], ["identity_types", "身份类型"]]).map(([value, label]) => <label className="rounded-lg border border-line p-3 text-sm font-bold" key={value}><input checked={audienceType === value} className="mr-2" name="audience" onChange={() => setAudienceType(value)} type="radio" />{label}</label>)}</div></fieldset>
      {scope === "platform" && audienceType === "identity_types" ? <fieldset><legend className="text-sm font-black">身份类型</legend><div className="mt-2 flex flex-wrap gap-2">{identityOptions.map((value) => <label className="rounded-lg border border-line px-3 py-2 text-xs font-bold" key={value}><input checked={identityTypes.includes(value)} className="mr-2" onChange={(event) => setIdentityTypes((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} type="checkbox" />{value}</label>)}</div></fieldset> : null}
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-black">发送方式<select className={`${inputClass} mt-2`} onChange={(event) => setSendMode(event.target.value as "now" | "scheduled")} value={sendMode}><option value="now">立即发送</option><option value="scheduled">定时发送</option></select></label>{sendMode === "scheduled" ? <label className="text-sm font-black">发送时间<input className={`${inputClass} mt-2`} onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label> : null}</div>
      <div className="flex justify-end"><Button disabled={submitting || (scope === "platform" && audienceType === "identity_types" && identityTypes.length === 0)} type="submit">{submitting ? "提交中…" : "确认创建"}</Button></div>
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
