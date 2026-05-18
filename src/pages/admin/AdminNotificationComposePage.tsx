import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { readImageFileAsDataUrl } from "../../lib/imageUpload";
import {
  buildOfficialNoticeDetail,
  createOfficialNoticeBlock,
  formatOfficialNoticeDateTime,
  saveStoredOfficialNotice,
  summarizeOfficialNoticeBlocks,
  type NoticeLevel,
  type OfficialNoticeBlock,
  type OfficialNoticeBlockType
} from "../../lib/adminOfficialNotifications";
import { cn } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";

type DeliveryTarget = "全体用户" | "用户端" | "技师端" | "商户端" | "产运后台" | "NDA管理后台";
type DeliveryMode = "segment" | "account";
type SendTimingMode = "now" | "scheduled";
type AccountTargetType = "user" | "technician" | "store";
type AccountTargetOption = {
  id: string;
  type: AccountTargetType;
  label: string;
  systemId: string;
  caption: string;
  avatar?: string;
};

const defaultDeliveryTargets: DeliveryTarget[] = ["全体用户", "用户端", "技师端", "商户端", "产运后台"];
const noticeLevels: NoticeLevel[] = ["一般", "重要", "紧急"];
const persistentFileUploadLimitBytes = 3_500_000;
const persistentVideoUploadLimitBytes = 4_500_000;

const blockOptions: Array<{ type: OfficialNoticeBlockType; label: string; icon: string }> = [
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

const blockLabels = blockOptions.reduce<Record<OfficialNoticeBlockType, string>>((current, item) => {
  current[item.type] = item.label;
  return current;
}, {} as Record<OfficialNoticeBlockType, string>);

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function getDefaultSendAt() {
  return formatDateTimeLocal(new Date(Date.now() + 10 * 60 * 1000));
}

function formatDateTimeLocal(date: Date) {
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
    ":",
    padDatePart(date.getSeconds())
  ].join("");
}

function getAccountTypeLabel(type: AccountTargetType) {
  if (type === "technician") {
    return "技师";
  }

  if (type === "store") {
    return "商户";
  }

  return "用户";
}

function getNoticeLevelButtonClass(item: NoticeLevel, selected: boolean) {
  if (item === "一般") {
    return selected ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/65 hover:border-moss hover:text-ink";
  }

  if (item === "重要") {
    return selected ? "official-notice-level-button--danger is-active" : "official-notice-level-button--danger";
  }

  return selected ? "official-notice-level-button--danger is-urgent is-active" : "official-notice-level-button--danger is-urgent";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file."));
    };

    reader.readAsDataURL(file);
  });
}

function formatUploadedFileSize(size?: number) {
  if (!size) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function getBlockPlaceholder(type: OfficialNoticeBlockType) {
  if (type === "heading") {
    return "输入这一段的主标题";
  }

  if (type === "subheading") {
    return "输入小段落标题";
  }

  if (type === "bullet") {
    return "输入一个要点";
  }

  if (type === "numbered") {
    return "输入步骤或顺序内容";
  }

  if (type === "quote") {
    return "输入需要强调引用的说明";
  }

  if (type === "callout") {
    return "输入重要提示、注意事项或行动要求";
  }

  if (type === "image") {
    return "粘贴图片 URL";
  }

  if (type === "video") {
    return "粘贴视频 URL";
  }

  if (type === "file") {
    return "粘贴文件下载 URL";
  }

  return "输入通知正文";
}

function DraftBlockPreview({ block, index }: { block: OfficialNoticeBlock; index: number }) {
  if (block.type === "divider") {
    return <div className="official-notice-divider" />;
  }

  if (block.type === "image") {
    return (
      <figure className="overflow-hidden rounded-lg border border-line bg-white">
        {block.content.trim() ? (
          <img alt={block.caption || "通知图片"} className="max-h-56 w-full object-cover" src={block.content} />
        ) : (
          <div className="grid h-32 place-items-center bg-paper text-xs font-bold text-ink/45">图片预览</div>
        )}
        {block.caption ? <figcaption className="border-t border-line px-3 py-2 text-xs font-bold text-ink/55">{block.caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "video") {
    return (
      <figure className="overflow-hidden rounded-lg border border-line bg-ink text-white">
        {block.content.trim() ? (
          <video className="max-h-56 w-full bg-black" controls src={block.content} />
        ) : (
          <div className="grid h-32 place-items-center text-xs font-bold text-white/60">视频预览</div>
        )}
        {block.caption ? <figcaption className="border-t border-white/10 px-3 py-2 text-xs font-bold text-white/70">{block.caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "file") {
    const fileLabel = block.caption || block.fileName || "附件文件";

    return (
      <a
        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-3 text-sm font-black text-ink transition hover:border-moss hover:text-moss"
        download={block.fileName || undefined}
        href={block.content || "#"}
      >
        <span className="min-w-0">
          <span className="block truncate">{fileLabel}</span>
          {formatUploadedFileSize(block.fileSize) ? <span className="mt-1 block text-xs font-bold text-ink/45">{formatUploadedFileSize(block.fileSize)}</span> : null}
        </span>
        <span className="shrink-0 rounded-md bg-paper px-3 py-2 text-xs">下载</span>
      </a>
    );
  }

  if (block.type === "heading") {
    return <h3 className="text-xl font-black">{block.content || "段落标题"}</h3>;
  }

  if (block.type === "subheading") {
    return <h4 className="text-base font-black text-ink/75">{block.content || "小标题"}</h4>;
  }

  if (block.type === "bullet") {
    return <p className="text-sm leading-7 text-ink/70">{`• ${block.content || "要点内容"}`}</p>;
  }

  if (block.type === "numbered") {
    return <p className="text-sm leading-7 text-ink/70">{`${index + 1}. ${block.content || "步骤内容"}`}</p>;
  }

  if (block.type === "quote") {
    return <blockquote className="border-l-4 border-ink/20 pl-3 text-sm font-semibold leading-7 text-ink/65">{block.content || "引用内容"}</blockquote>;
  }

  if (block.type === "callout") {
    return <p className="rounded-lg border border-lemon/50 bg-lemon/15 px-3 py-2 text-sm font-bold leading-7 text-ink/75">{block.content || "提示内容"}</p>;
  }

  return <p className="text-sm leading-7 text-ink/70">{block.content || "通知正文"}</p>;
}

type AdminNotificationComposeContentProps = {
  title?: string;
  description?: string;
  returnPath?: string;
  returnLabel?: string;
  sendLabel?: string;
  savedChannel?: string;
  deliveryTargets?: DeliveryTarget[];
};

export function AdminNotificationComposeContent({
  title: pageTitle = "发送官方通知",
  description = "编辑平台官方通知，支持标题、图文视频、下载文件、分段排版和精确到秒的定时发送。",
  returnPath = "/admin/notifications",
  returnLabel = "返回通知列表",
  sendLabel = "发送官方通知",
  savedChannel = "官方通知",
  deliveryTargets = defaultDeliveryTargets
}: AdminNotificationComposeContentProps) {
  const navigate = useNavigate();
  const entitySnapshot = useEntityStore();
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<NoticeLevel>("重要");
  const [sendTimingMode, setSendTimingMode] = useState<SendTimingMode>("scheduled");
  const [sendAt, setSendAt] = useState(getDefaultSendAt);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("segment");
  const [targets, setTargets] = useState<DeliveryTarget[]>(["全体用户"]);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [blocks, setBlocks] = useState<OfficialNoticeBlock[]>([
    createOfficialNoticeBlock("paragraph", "输入标题以及正文，可以通过下方功能把内容拆成多个段落、标题、要点、图片、视频和下载文件。")
  ]);
  const [message, setMessage] = useState("");
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);

  const normalizedBlocks = useMemo(
    () =>
      blocks
        .filter((block) => block.type === "divider" || block.content.trim())
        .map((block) => ({
          ...block,
          content: block.content.trim(),
          caption: block.caption?.trim()
      })),
    [blocks]
  );
  const accountOptions = useMemo<AccountTargetOption[]>(() => {
    const customerOptions = entitySnapshot.customers.map((customer) => ({
      id: `user:${customer.id}`,
      type: "user" as const,
      label: customer.nickname || customer.name,
      systemId: customer.systemId,
      caption: [customer.phone, customer.accountUsername ? `账号 ${customer.accountUsername}` : "", customer.memberLevel].filter(Boolean).join(" / "),
      avatar: customer.avatar
    }));
    const technicianOptions = entitySnapshot.technicians.map((technician) => ({
      id: `technician:${technician.id}`,
      type: "technician" as const,
      label: technician.nickname || technician.name,
      systemId: technician.systemId,
      caption: [technician.skills.slice(0, 2).join("、"), technician.accountUsername ? `账号 ${technician.accountUsername}` : "", technician.storeId].filter(Boolean).join(" / "),
      avatar: technician.avatar
    }));
    const storeOptions = entitySnapshot.stores.map((store) => ({
      id: `store:${store.id}`,
      type: "store" as const,
      label: store.name,
      systemId: store.systemId,
      caption: [store.area, store.accountUsername ? `账号 ${store.accountUsername}` : "", store.openStatus].filter(Boolean).join(" / "),
      avatar: store.cover
    }));

    return [...customerOptions, ...technicianOptions, ...storeOptions];
  }, [entitySnapshot.customers, entitySnapshot.stores, entitySnapshot.technicians]);
  const filteredAccountOptions = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase();
    const source = keyword
      ? accountOptions.filter((account) => `${account.label} ${account.systemId} ${account.caption} ${getAccountTypeLabel(account.type)}`.toLowerCase().includes(keyword))
      : accountOptions;

    return source.slice(0, 18);
  }, [accountOptions, accountSearch]);
  const selectedAccount = accountOptions.find((account) => account.id === selectedAccountId) ?? null;
  const hasContent = normalizedBlocks.some((block) => block.type !== "divider" && block.content.trim());
  const hasTarget = deliveryMode === "account" ? Boolean(selectedAccount) : targets.length > 0;
  const hasSendTime = sendTimingMode === "now" || Boolean(sendAt);
  const canSend = Boolean(title.trim() && hasSendTime && hasTarget && hasContent);
  const scheduledLabel = sendTimingMode === "now" ? "立即发送" : sendAt ? formatOfficialNoticeDateTime(sendAt) : "未设置";
  const targetSummary = deliveryMode === "account" && selectedAccount
    ? `${getAccountTypeLabel(selectedAccount.type)}｜${selectedAccount.label}（${selectedAccount.systemId}）`
    : targets.join(" / ");

  const updateBlock = (id: string, patch: Partial<OfficialNoticeBlock>) => {
    setBlocks((current) => current.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  };

  const addBlock = (type: OfficialNoticeBlockType) => {
    setBlocks((current) => [...current, createOfficialNoticeBlock(type)]);
  };

  const duplicateBlock = (block: OfficialNoticeBlock) => {
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === block.id);
      const nextBlock = {
        ...block,
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      };

      if (index < 0) {
        return [...current, nextBlock];
      }

      return [...current.slice(0, index + 1), nextBlock, ...current.slice(index + 1)];
    });
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [target] = next.splice(index, 1);
      next.splice(nextIndex, 0, target);

      return next;
    });
  };

  const removeBlock = (id: string) => {
    setBlocks((current) => {
      const next = current.filter((block) => block.id !== id);

      return next.length ? next : [createOfficialNoticeBlock("paragraph")];
    });
  };

  const toggleTarget = (target: DeliveryTarget) => {
    if (target === "全体用户") {
      setTargets(["全体用户"]);
      return;
    }

    setTargets((current) => {
      const withoutAll = current.filter((item) => item !== "全体用户");
      if (withoutAll.includes(target)) {
        return withoutAll.filter((item) => item !== target);
      }

      return [...withoutAll, target];
    });
  };

  const sendNotice = () => {
    if (!canSend) {
      setMessage("请先补齐标题、正文内容、发送对象和发送时间。");
      return;
    }

    const actualSendAt = sendTimingMode === "now" ? formatOfficialNoticeDateTime(formatDateTimeLocal(new Date())) : formatOfficialNoticeDateTime(sendAt);
    const saved = saveStoredOfficialNotice({
      id: `notice-official-${Date.now()}`,
      title: title.trim(),
      level,
      status: "未读",
      channel: savedChannel,
      at: actualSendAt,
      summary: `${targetSummary}｜${sendTimingMode === "now" ? "立即发送" : "定时发送"}｜${summarizeOfficialNoticeBlocks(normalizedBlocks)}`,
      detail: buildOfficialNoticeDetail(normalizedBlocks),
      blocks: normalizedBlocks,
      sendMode: sendTimingMode,
      targetMode: deliveryMode,
      targetSummary,
      targetAccount: selectedAccount
        ? {
            id: selectedAccount.id,
            type: selectedAccount.type,
            label: selectedAccount.label,
            systemId: selectedAccount.systemId
          }
        : undefined
    });
    if (!saved) {
      setMessage("当前浏览器无法保存这条通知。请缩小上传文件或视频体积，或稍后接入正式媒体文件接口后再发送。");
      return;
    }

    navigate(returnPath);
  };

  const handleBlockFileUpload = async (block: OfficialNoticeBlock, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";

    if (!file) {
      return;
    }

    const expectsImage = block.type === "image";
    const expectsVideo = block.type === "video";
    const acceptsFile = expectsImage ? file.type.startsWith("image/") : expectsVideo ? file.type.startsWith("video/") : true;
    if (!acceptsFile) {
      setMessage(expectsImage ? "请上传图片文件。" : "请上传视频文件。");
      return;
    }

    setUploadingBlockId(block.id);
    setMessage("");

    try {
      const content = expectsImage
        ? await readImageFileAsDataUrl(file, { maxDimension: 1600, maxStoredBytes: 720_000 })
        : expectsVideo && file.size <= persistentVideoUploadLimitBytes
          ? await readFileAsDataUrl(file)
          : !expectsVideo && file.size <= persistentFileUploadLimitBytes
            ? await readFileAsDataUrl(file)
          : URL.createObjectURL(file);

      updateBlock(block.id, {
        content,
        caption: block.caption || file.name,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        source: "upload"
      });

      if ((expectsVideo && file.size > persistentVideoUploadLimitBytes) || (!expectsImage && !expectsVideo && file.size > persistentFileUploadLimitBytes)) {
        setMessage(expectsVideo ? "视频已上传到本次编辑会话用于预览。大视频需要正式媒体接口保存，当前不会把完整视频塞进本地通知缓存。" : "文件已上传到本次编辑会话用于下载预览。大文件需要正式文件接口保存，当前不会把完整文件塞进本地通知缓存。");
      }
    } catch {
      setMessage(expectsImage ? "图片上传失败，请换一张图片再试。" : expectsVideo ? "视频上传失败，请换一个视频再试。" : "文件上传失败，请换一个文件再试。");
    } finally {
      setUploadingBlockId(null);
    }
  };

  return (
    <>
      <ModuleShell
        title={pageTitle}
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button to={returnPath} variant="secondary">{returnLabel}</Button>
            <Button disabled={!canSend} onClick={sendNotice}>{sendLabel}</Button>
          </div>
        }
      >
        <section className="space-y-5 pb-36">
          <section className="grid items-stretch gap-4 lg:grid-cols-3 xl:grid-cols-[minmax(220px,0.78fr)_minmax(360px,1.42fr)_minmax(300px,1fr)]">
            <section className="h-full rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="先确认通知级别、发送对象和发送时间，再填写正文标题与内容。重要和紧急通知到达发送时间后，会在各端首页自动弹出。"
                  label="发送设置说明"
                  title="发送设置"
                  titleClassName="text-lg font-black"
                />
                <Badge tone={level === "一般" ? "neutral" : "red"}>{level}</Badge>
              </div>
              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/40">通知级别</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {noticeLevels.map((item) => (
                    <button
                      className={cn(
                        "h-10 rounded-lg border px-4 text-sm font-black transition",
                        getNoticeLevelButtonClass(item, level === item)
                      )}
                      key={item}
                      onClick={() => setLevel(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="h-full rounded-lg border border-line bg-white p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info="可以按端口群发，也可以搜索系统 ID、手机号或账号名后只发给一个账号。"
                label="发送对象说明"
                title="发送对象"
                titleClassName="text-lg font-black"
              />
              <div className="mt-5">
                <div className="grid max-w-lg grid-cols-2 gap-2">
                  {[
                    ["segment", "群体发送"],
                    ["account", "单个账号"]
                  ].map(([value, label]) => (
                    <button
                      className={cn(
                        "h-10 rounded-lg border px-3 text-sm font-black transition",
                        deliveryMode === value ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/65 hover:border-moss hover:text-ink"
                      )}
                      key={value}
                      onClick={() => setDeliveryMode(value as DeliveryMode)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {deliveryMode === "segment" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {deliveryTargets.map((target) => (
                      <button
                        className={cn(
                          "h-10 rounded-lg border px-3 text-xs font-black transition",
                          targets.includes(target) ? "border-moss bg-moss text-white" : "border-line bg-paper text-ink/60 hover:border-moss hover:text-ink"
                        )}
                        key={target}
                        onClick={() => toggleTarget(target)}
                        type="button"
                      >
                        {target}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                    <input
                      className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none transition focus:border-moss"
                      onChange={(event) => setAccountSearch(event.target.value)}
                      placeholder="搜索账号名、系统 ID、手机号、账号名"
                      value={accountSearch}
                    />
                    <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 2xl:grid-cols-2">
                      {filteredAccountOptions.map((account) => (
                        <button
                          className={cn(
                            "flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                            selectedAccountId === account.id ? "border-moss bg-moss text-white" : "border-line bg-white text-ink hover:border-moss"
                          )}
                          key={account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                          type="button"
                        >
                          <img alt="" className="avatar-shape h-9 w-9 shrink-0 object-cover" src={account.avatar || "/images/generated/profiles/profile-03.jpg"} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black">{account.label}</span>
                            <span className={cn("mt-1 block truncate text-xs font-bold", selectedAccountId === account.id ? "text-white/72" : "text-ink/45")}>
                              {getAccountTypeLabel(account.type)} / {account.systemId}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="h-full rounded-lg border border-line bg-white p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info="立即发送会在点击发送后推送；定时发送会按输入时间精确到秒保存。"
                label="发送时间说明"
                title="发送时间"
                titleClassName="text-lg font-black"
              />
              <div className="mt-5">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["now", "立即发送"],
                    ["scheduled", "定时发送"]
                  ].map(([value, label]) => (
                    <button
                      className={cn(
                        "h-10 rounded-lg border px-3 text-sm font-black transition",
                        sendTimingMode === value ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/65 hover:border-moss hover:text-ink"
                      )}
                      key={value}
                      onClick={() => setSendTimingMode(value as SendTimingMode)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {sendTimingMode === "scheduled" ? (
                  <input
                    className="mt-3 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-black outline-none transition focus:border-moss focus:bg-white"
                    onChange={(event) => setSendAt(event.target.value)}
                    step={1}
                    type="datetime-local"
                    value={sendAt}
                  />
                ) : (
                  <div className="mt-3 rounded-lg border border-moss/30 bg-moss/10 px-3 py-3 text-sm font-black text-moss">点击发送后立刻推送</div>
                )}
              </div>
            </section>
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
            <section className="official-notice-editor rounded-lg border border-line bg-white shadow-panel">
              <div className="official-notice-editor-heading border-b border-line bg-paper px-4 py-3">
                <TitleWithInfo
                  as="h2"
                  info="使用内容块组织正文：标题、段落、要点、编号、引用、提示、分隔线、图片、视频和下载文件都可以混排。底部工具栏会固定显示，媒体与文件块支持上传或粘贴 URL。"
                  label="编辑器说明"
                  title="通知正文"
                  titleClassName="text-lg font-black"
                  variant="paper"
                />
              </div>
              <div className="official-notice-editor-title-row border-b border-line p-4">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-ink/40">标题</span>
                  <input
                    className="mt-2 h-12 w-full rounded-lg border border-line bg-paper px-4 text-base font-black outline-none transition focus:border-moss focus:bg-white"
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="输入官方通知标题"
                    value={title}
                  />
                </label>
              </div>

              <div className="official-notice-block-stack">
                {blocks.map((block, index) => (
                  <article className="bg-white p-4" key={block.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-9 rounded-lg border border-line bg-paper px-3 text-xs font-black outline-none"
                          onChange={(event) => updateBlock(block.id, { type: event.target.value as OfficialNoticeBlockType })}
                          value={block.type}
                        >
                          {blockOptions.map((item) => (
                            <option key={item.type} value={item.type}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <Badge tone="neutral">Block {index + 1}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="h-8 rounded-md border border-line px-2 text-xs font-black text-ink/55 disabled:opacity-40" disabled={index === 0} onClick={() => moveBlock(block.id, -1)} type="button">↑</button>
                        <button className="h-8 rounded-md border border-line px-2 text-xs font-black text-ink/55 disabled:opacity-40" disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} type="button">↓</button>
                        <button className="h-8 rounded-md border border-line px-3 text-xs font-black text-ink/55" onClick={() => duplicateBlock(block)} type="button">复制</button>
                        <button className="h-8 rounded-md border border-coral/30 px-3 text-xs font-black text-coral" onClick={() => removeBlock(block.id)} type="button">删除</button>
                      </div>
                    </div>

                    {block.type === "divider" ? (
                      <div className="official-notice-divider mt-4" />
                    ) : block.type === "image" || block.type === "video" || block.type === "file" ? (
                      <>
                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                          <label className="block">
                            <span className="text-xs font-black text-ink/40">{blockLabels[block.type]} URL</span>
                            <input
                              className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none transition focus:border-moss focus:bg-white"
                              onChange={(event) =>
                                updateBlock(block.id, {
                                  content: event.target.value,
                                  fileName: undefined,
                                  fileSize: undefined,
                                  mimeType: undefined,
                                  source: "url"
                                })
                              }
                              placeholder={getBlockPlaceholder(block.type)}
                              value={block.source === "upload" ? "" : block.content}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black text-ink/40">说明文字</span>
                            <input
                              className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none transition focus:border-moss focus:bg-white"
                              onChange={(event) => updateBlock(block.id, { caption: event.target.value })}
                              placeholder="可选：图片 / 视频说明"
                              value={block.caption ?? ""}
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <label className="focus-ring inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-paper px-3 text-xs font-black text-ink/65 transition hover:border-moss hover:bg-white hover:text-ink">
                            上传{block.type === "image" ? "图片" : block.type === "video" ? "视频" : "文件"}
                            <input
                              accept={block.type === "image" ? "image/*" : block.type === "video" ? "video/*" : undefined}
                              className="hidden"
                              onChange={(event) => handleBlockFileUpload(block, event)}
                              type="file"
                            />
                          </label>
                          {uploadingBlockId === block.id ? <span className="text-xs font-black text-ink/45">上传中...</span> : null}
                          {block.fileName ? (
                            <Badge tone="neutral">
                              {block.fileName}
                              {formatUploadedFileSize(block.fileSize) ? ` / ${formatUploadedFileSize(block.fileSize)}` : ""}
                            </Badge>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <textarea
                        className="mt-4 min-h-28 w-full resize-y rounded-lg border border-line bg-paper px-4 py-3 text-sm leading-7 outline-none transition focus:border-moss focus:bg-white"
                        onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                        placeholder={getBlockPlaceholder(block.type)}
                        rows={block.type === "heading" || block.type === "subheading" ? 2 : 5}
                        value={block.content}
                      />
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-28">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="这里预览运营人员看到的通知结构。正式发送前，请检查标题、时间、对象和正文块顺序。"
                  label="预览说明"
                  title="发送预览"
                  titleClassName="text-lg font-black"
                />
                <Badge tone={level === "一般" ? "neutral" : "red"}>{level}</Badge>
              </div>
              <div className="mt-4 rounded-lg border border-line bg-paper p-4">
                <p className="text-xs font-black text-ink/40">发送时间</p>
                <p className="mt-1 text-sm font-black text-ink">{scheduledLabel}</p>
                <p className="mt-3 text-xs font-black text-ink/40">发送对象</p>
                <p className="mt-1 text-sm font-black text-ink">{targetSummary || "未选择"}</p>
              </div>
              <div className="mt-4 space-y-3">
                <h3 className="text-xl font-black">{title || "官方通知标题"}</h3>
                {blocks.map((block, index) => (
                  <DraftBlockPreview block={block} index={index} key={block.id} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="text-lg font-black">发送检查</h2>
              <div className="mt-3 space-y-2 text-sm font-bold">
                <p className={title.trim() ? "text-moss" : "text-coral"}>标题：{title.trim() ? "已填写" : "未填写"}</p>
                <p className={hasContent ? "text-moss" : "text-coral"}>正文：{hasContent ? `${normalizedBlocks.length} 个内容块` : "未填写"}</p>
                <p className={hasTarget ? "text-moss" : "text-coral"}>对象：{hasTarget ? targetSummary : "未选择"}</p>
                <p className={hasSendTime ? "text-moss" : "text-coral"}>时间：{sendTimingMode === "now" ? "立即发送" : sendAt ? "精确到秒" : "未设置"}</p>
              </div>
              {message ? <p className="mt-4 rounded-lg border border-coral/25 bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{message}</p> : null}
              <Button className="mt-4 w-full" disabled={!canSend} onClick={sendNotice}>{sendLabel}</Button>
            </section>
          </aside>
        </section>
        </section>
      </ModuleShell>
      <div className="fixed inset-x-0 bottom-0 z-[55] border-t border-[color:var(--admin-line)] bg-[color:color-mix(in_srgb,var(--admin-elevated)_96%,transparent)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_rgba(0,0,0,0.18)] backdrop-blur lg:left-64 md:px-5 2xl:px-6">
        <div className="scrollbar-none flex min-w-0 items-center gap-3 overflow-x-auto">
          {blockOptions.map((item) => (
            <button
              className="focus-ring inline-flex h-11 shrink-0 items-center gap-3 rounded-lg border border-[color:var(--admin-line)] bg-[color:var(--admin-surface)] px-4 text-sm font-black text-[color:var(--admin-muted)] transition hover:border-[color:var(--admin-accent)] hover:text-[color:var(--admin-text)]"
              key={item.type}
              onClick={() => addBlock(item.type)}
              type="button"
            >
              <span className="grid h-7 min-w-7 place-items-center rounded-md bg-[color:var(--admin-muted-surface)] px-1 text-xs text-[color:var(--admin-text)]">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function AdminNotificationComposePage() {
  return (
    <AdminLayout>
      <AdminNotificationComposeContent />
    </AdminLayout>
  );
}
