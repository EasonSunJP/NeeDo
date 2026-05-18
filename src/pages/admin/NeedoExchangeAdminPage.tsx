import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { HorizontalScrollArea } from "../../components/ui/HorizontalScrollArea";
import { TableColumnHeader, type TableColumnHeaderApplyPayload, type TableSortDirection } from "../../components/ui/TableColumnHeader";
import { Tabs } from "../../components/ui/Tabs";
import { customers, stores, technicians } from "../../data/mock";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { cn, yen } from "../../lib/utils";
import type { Customer, Store, Technician } from "../../types/domain";
import {
  getDemandDetail,
  getExchangeServiceLabel,
  getNeedoFeedPosts,
  getPostLikeCount,
  getPostReplyCount,
  type ExchangePost
} from "../mobile/NeedoExchangePage";

type NeedoExchangeAdminMode = "demand" | "info";

type NeedoAdminStatus = "待审核" | "审核中" | "已发布" | "已过期" | "已驳回";
type NeedoDetailTab = "前台内容" | "支付与履约" | "发布主体" | "互动评论" | "管理设置";
type NeedoActorKind = "customer" | "store" | "technician";
type NeedoTableColumnKey =
  | "id"
  | "postNo"
  | "serviceName"
  | "quantity"
  | "price"
  | "serviceDate"
  | "serviceTime"
  | "acceptsTravelFee"
  | "contactName"
  | "contactMethod"
  | "address"
  | "status"
  | "publishedAt";
type NeedoSortDirection = TableSortDirection;
type NeedoSortState = {
  key: NeedoTableColumnKey;
  direction: NeedoSortDirection;
};
type NeedoColumnFilters = Partial<Record<NeedoTableColumnKey, string[]>>;
type NeedoColumnSearch = Partial<Record<NeedoTableColumnKey, string>>;

type NeedoTableColumn = {
  key: NeedoTableColumnKey;
  title: string;
  className: string;
  align?: "left" | "center";
  popoverAlign?: "left" | "right";
  getFilterLabel: (row: NeedoAdminRow) => string;
  getSortValue: (row: NeedoAdminRow) => string | number;
};

type NeedoAdminActor = {
  kind: NeedoActorKind;
  id: string;
  systemId: string;
  displayName: string;
  legalName?: string;
  avatar: string;
  roleLabel: string;
  subtitle: string;
  contactMethod: string;
  area: string;
  ratingLabel: string;
  tags: string[];
  note: string;
};

type NeedoAdminRow = {
  rowKey: string;
  id: number;
  post: ExchangePost;
  actor: NeedoAdminActor;
  postNo: string;
  sourceContext: MessageCenterContext;
  sourceLabel: string;
  type: ExchangePost["type"];
  title: string;
  serviceName: string;
  quantity: string;
  price: number;
  serviceDate: string;
  serviceTime: string;
  acceptsTravelFee: boolean;
  contactName: string;
  contactMethod: string;
  address: string;
  status: NeedoAdminStatus;
  publishedAt: string;
  expiresAt: string;
  detail: string;
  tags: string[];
  frontPath: string;
};

type RowDraft = {
  title: string;
  serviceName: string;
  quantity: string;
  price: string;
  serviceDate: string;
  serviceTime: string;
  acceptsTravelFee: boolean;
  contactName: string;
  contactMethod: string;
  address: string;
  status: NeedoAdminStatus;
  detail: string;
};

const statusOptions: NeedoAdminStatus[] = ["待审核", "审核中", "已发布", "已过期", "已驳回"];
const detailTabs: NeedoDetailTab[] = ["前台内容", "支付与履约", "发布主体", "互动评论", "管理设置"];

const modeCopy = {
  demand: {
    pageTitle: "需求中心",
    hallTitle: "需求大厅",
    keywordPlaceholder: "需求编号、服务名、联系人...",
    addLabel: "新增需求",
    codeTitle: "需求编号",
    quantityTitle: "数量",
    priceTitle: "出价",
    dateTitle: "服务日期",
    timeTitle: "服务时间",
    travelTitle: "接受车费",
    contactTitle: "联系人",
    methodTitle: "联系方式",
    addressTitle: "服务地址",
    emptyTitle: "暂无匹配的需求",
    csvName: "needo-demand-center.csv"
  },
  info: {
    pageTitle: "情报中心",
    hallTitle: "情报大厅",
    keywordPlaceholder: "情报编号、服务名、发布方...",
    addLabel: "新增情报",
    codeTitle: "情报编号",
    quantityTitle: "可预约数",
    priceTitle: "报价",
    dateTitle: "可预约日期",
    timeTitle: "可预约时间",
    travelTitle: "支持移动",
    contactTitle: "发布方",
    methodTitle: "联系方式",
    addressTitle: "服务区域",
    emptyTitle: "暂无匹配的情报",
    csvName: "needo-info-center.csv"
  }
} satisfies Record<NeedoExchangeAdminMode, Record<string, string>>;

function hashText(value: string) {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function formatDateOnly(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replace(/\//g, "-");
}

function formatDateTime(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(/\//g, "-");
}

function buildPostNo(mode: NeedoExchangeAdminMode, post: ExchangePost, index: number) {
  const prefix = mode === "demand" ? "D" : "I";
  const seed = `${post.id}-${post.publishedAt}-${index}`;
  const numeric = String(hashText(seed)).padStart(10, "0").slice(0, 10);

  return `${prefix}${numeric}`;
}

function buildPhone(seed: string) {
  const hash = hashText(seed);
  const middle = String((hash % 9000) + 1000).padStart(4, "0");
  const last = String((Math.floor(hash / 256) % 9000) + 1000).padStart(4, "0");

  return `090-${middle}-${last}`;
}

function getDisplayNameWithNickname(entity: Pick<Customer | Technician, "name" | "nickname">) {
  return entity.nickname ? `${entity.nickname} / ${entity.name}` : entity.name;
}

function buildCustomerActor(post: ExchangePost): NeedoAdminActor {
  const detail = getDemandDetail(post);
  const matchedCustomer = customers.find(
    (customer) =>
      customer.systemId === detail.customer.systemId ||
      customer.name === post.author ||
      customer.name === detail.customer.name ||
      customer.nickname === post.author
  );
  const displayName = matchedCustomer ? getDisplayNameWithNickname(matchedCustomer) : detail.customer.name;

  return {
    kind: "customer",
    id: matchedCustomer?.id ?? `${post.id}-customer`,
    systemId: matchedCustomer?.systemId ?? detail.customer.systemId,
    displayName,
    legalName: matchedCustomer?.name,
    avatar: matchedCustomer?.avatar ?? detail.customer.avatar,
    roleLabel: "需求发出人",
    subtitle: `完成 ${detail.customer.completedOrders} 单 · 爽约率 ${detail.customer.noShowRate}`,
    contactMethod: matchedCustomer?.phone ?? buildPhone(`${post.id}-${post.author}-customer`),
    area: post.area,
    ratingLabel: `信用度 ${detail.customer.rating}/5 · ${detail.customer.reviewCount} 条评价`,
    tags: matchedCustomer?.tags.slice(0, 4) ?? detail.customer.tags,
    note: matchedCustomer?.bio ?? detail.customer.note
  };
}

function buildStoreActor(store: Store): NeedoAdminActor {
  return {
    kind: "store",
    id: store.id,
    systemId: store.systemId,
    displayName: store.name,
    avatar: store.cover,
    roleLabel: "商户发布方",
    subtitle: `${store.area} · ${store.openStatus}`,
    contactMethod: buildPhone(`${store.id}-${store.systemId}`),
    area: store.address,
    ratingLabel: `★ ${store.rating.toFixed(1)} · ${store.reviewCount} 条评价`,
    tags: store.tags.slice(0, 4),
    note: store.description
  };
}

function buildTechnicianActor(technician: Technician): NeedoAdminActor {
  return {
    kind: "technician",
    id: technician.id,
    systemId: technician.systemId,
    displayName: getDisplayNameWithNickname(technician),
    legalName: technician.name,
    avatar: technician.avatar,
    roleLabel: "技师发布方",
    subtitle: `${technician.identityLabel ?? "个人技师"} · ${technician.serviceAreas.join(" / ")}`,
    contactMethod: buildPhone(`${technician.id}-${technician.systemId}`),
    area: technician.serviceAreas.join(" / "),
    ratingLabel: `★ ${technician.rating.toFixed(2)} · 接单率 ${technician.acceptRate}%`,
    tags: (technician.profileTags ?? technician.skills).slice(0, 4),
    note: technician.bio ?? `${technician.languages.join(" / ")} 可沟通，主要服务：${technician.skills.join("、")}`
  };
}

function buildFallbackActor(post: ExchangePost, context: MessageCenterContext): NeedoAdminActor {
  return {
    kind: context === "technician" ? "technician" : "store",
    id: `${context}-${post.author}`,
    systemId: hashText(`${context}-${post.author}`).toString(36).toUpperCase(),
    displayName: post.author,
    avatar: post.image,
    roleLabel: context === "technician" ? "技师发布方" : "商户发布方",
    subtitle: post.area,
    contactMethod: buildPhone(`${context}-${post.author}-${post.id}`),
    area: post.area,
    ratingLabel: `${getPostReplyCount(post)} 条互动`,
    tags: post.tags.slice(0, 4),
    note: post.detail
  };
}

function buildActor(post: ExchangePost, context: MessageCenterContext): NeedoAdminActor {
  if (post.type === "demand") {
    return buildCustomerActor(post);
  }

  const matchedStore = stores.find((store) => store.name === post.author);

  if (matchedStore) {
    return buildStoreActor(matchedStore);
  }

  const matchedTechnician = technicians.find((technician) => technician.name === post.author || technician.nickname === post.author);

  if (matchedTechnician) {
    return buildTechnicianActor(matchedTechnician);
  }

  return buildFallbackActor(post, context);
}

function resolveSourceLabel(post: ExchangePost, context: MessageCenterContext) {
  if (post.type === "demand") {
    return "用户需求";
  }

  if (stores.some((store) => store.name === post.author)) {
    return "商户情报";
  }

  if (technicians.some((technician) => technician.name === post.author || technician.nickname === post.author)) {
    return "技师情报";
  }

  return context === "merchant" ? "商户情报" : "技师情报";
}

function resolveQuantity(post: ExchangePost) {
  const match = post.title.match(/(\d+)\s*(位|人|个|枠|席)/);

  if (match?.[1]) {
    return `x${match[1]}`;
  }

  return post.type === "demand" ? "x1" : `x${Math.max(1, Math.min(5, Math.ceil(post.offers / 12)))}`;
}

function resolveStatus(post: ExchangePost, index: number): NeedoAdminStatus {
  if (new Date(post.expiresAt).getTime() <= Date.now()) {
    return "已过期";
  }

  if (post.id.startsWith("exchange-") || index % 7 === 0) {
    return "待审核";
  }

  if (index % 11 === 0) {
    return "审核中";
  }

  return "已发布";
}

function getStatusTone(status: NeedoAdminStatus): BadgeTone {
  if (status === "已发布") {
    return "green";
  }

  if (status === "已过期" || status === "已驳回") {
    return "red";
  }

  if (status === "审核中") {
    return "blue";
  }

  return "yellow";
}

function getFrontPath(row: Pick<NeedoAdminRow, "sourceContext" | "id" | "rowKey">, postId?: string) {
  const id = postId ?? row.rowKey;
  const prefix = row.sourceContext === "user" ? "/needo" : `/${row.sourceContext}/needo`;

  return `${prefix}/posts/${id}`;
}

function buildRowsForContext(mode: NeedoExchangeAdminMode, context: MessageCenterContext) {
  return getNeedoFeedPosts(context)
    .filter((post) => (mode === "demand" ? post.type === "demand" : post.type === "reverse"))
    .map((post) => ({ context, post }));
}

function buildAdminRows(mode: NeedoExchangeAdminMode): NeedoAdminRow[] {
  const rows =
    mode === "demand"
      ? buildRowsForContext(mode, "user")
      : [...buildRowsForContext(mode, "merchant"), ...buildRowsForContext(mode, "technician")];
  const seen = new Set<string>();
  const deduped = rows.filter(({ context, post }) => {
    const dedupeKey = post.id.startsWith("exchange-") ? `${context}:${post.id}` : post.id;

    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });

  return deduped.map(({ context, post }, index) => {
    const actor = buildActor(post, context);

    return {
      rowKey: `${context}:${post.id}`,
      id: index + 1,
      post,
      actor,
      postNo: buildPostNo(mode, post, index),
      sourceContext: context,
      sourceLabel: resolveSourceLabel(post, context),
      type: post.type,
      title: post.title,
      serviceName: getExchangeServiceLabel(post),
      quantity: resolveQuantity(post),
      price: post.budget,
      serviceDate: formatDateOnly(post.expiresAt),
      serviceTime: post.time,
      acceptsTravelFee: post.type === "demand" ? index % 3 !== 1 : /移动|上门|附近|区域/.test(`${post.title}${post.detail}${post.tags.join("")}`),
      contactName: actor.displayName,
      contactMethod: actor.contactMethod,
      address: post.area,
      status: resolveStatus(post, index),
      publishedAt: formatDateTime(post.publishedAt),
      expiresAt: formatDateTime(post.expiresAt),
      detail: post.detail,
      tags: post.tags,
      frontPath: `${context === "user" ? "/needo" : `/${context}/needo`}/posts/${post.id}`
    };
  });
}

function resolveDraftExpiresAt(draft: RowDraft) {
  const normalizedDate = draft.serviceDate.trim().replace(/\//g, "-");
  const dateMatch = normalizedDate.match(/\d{4}-\d{2}-\d{2}/);

  if (dateMatch?.[0]) {
    const parsed = new Date(`${dateMatch[0]}T23:59:59+09:00`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
}

function buildPostFromDraft(mode: NeedoExchangeAdminMode, rowKey: string, draft: RowDraft, sourceContext: MessageCenterContext): ExchangePost {
  const tags = [draft.serviceName, mode === "demand" ? "新需求" : "新情报"].filter((tag): tag is string => Boolean(tag));

  return {
    id: rowKey,
    type: mode === "demand" ? "demand" : "reverse",
    author: draft.contactName,
    role: mode === "demand" ? "需求" : "情报",
    title: draft.title,
    time: draft.serviceTime,
    area: draft.address,
    budget: normalizeDraftPrice(draft.price),
    detail: draft.detail,
    tags: Array.from(new Set(tags)),
    offers: 0,
    image: mode === "demand" ? customers[0]?.avatar ?? "" : sourceContext === "merchant" ? stores[0]?.cover ?? "" : technicians[0]?.avatar ?? "",
    publishedAt: new Date().toISOString(),
    expiresAt: resolveDraftExpiresAt(draft)
  };
}

function buildActorFromDraftPost(post: ExchangePost, context: MessageCenterContext, draft: RowDraft): NeedoAdminActor {
  const actor = buildActor(post, context);

  return {
    ...actor,
    displayName: draft.contactName || actor.displayName,
    contactMethod: draft.contactMethod || actor.contactMethod,
    area: draft.address || actor.area,
    note: draft.detail || actor.note
  };
}

function updateRowFromDraft(row: NeedoAdminRow, draft: RowDraft): NeedoAdminRow {
  const post: ExchangePost = {
    ...row.post,
    author: draft.contactName,
    title: draft.title,
    time: draft.serviceTime,
    area: draft.address,
    budget: normalizeDraftPrice(draft.price),
    detail: draft.detail,
    tags: row.tags.length > 0 ? row.tags : [draft.serviceName],
    expiresAt: resolveDraftExpiresAt(draft)
  };
  const actor = buildActorFromDraftPost(post, row.sourceContext, draft);

  return {
    ...row,
    post,
    actor,
    title: draft.title,
    serviceName: draft.serviceName,
    quantity: draft.quantity,
    price: normalizeDraftPrice(draft.price),
    serviceDate: draft.serviceDate,
    serviceTime: draft.serviceTime,
    acceptsTravelFee: draft.acceptsTravelFee,
    contactName: actor.displayName,
    contactMethod: actor.contactMethod,
    address: draft.address,
    status: draft.status,
    expiresAt: formatDateTime(post.expiresAt),
    detail: draft.detail
  };
}

function createDraftFromRow(row: NeedoAdminRow): RowDraft {
  return {
    title: row.title,
    serviceName: row.serviceName,
    quantity: row.quantity,
    price: String(row.price),
    serviceDate: row.serviceDate,
    serviceTime: row.serviceTime,
    acceptsTravelFee: row.acceptsTravelFee,
    contactName: row.contactName,
    contactMethod: row.contactMethod,
    address: row.address,
    status: row.status,
    detail: row.detail
  };
}

function createEmptyDraft(mode: NeedoExchangeAdminMode): RowDraft {
  return {
    title: mode === "demand" ? "新用户预约需求" : "新空档情报",
    serviceName: mode === "demand" ? "预约需求" : "店铺服务",
    quantity: "x1",
    price: mode === "demand" ? "18000" : "9800",
    serviceDate: "2026-05-15",
    serviceTime: mode === "demand" ? "19:00 - 21:00" : "20:00 - 23:00",
    acceptsTravelFee: mode === "demand",
    contactName: mode === "demand" ? customers[0]?.name ?? "新用户" : stores[0]?.name ?? "新发布方",
    contactMethod: buildPhone(`manual-${mode}-${Date.now()}`),
    address: mode === "demand" ? "东京都港区" : "新宿 / 六本木 / 银座",
    status: "待审核",
    detail: mode === "demand" ? "用户提交的新需求，等待平台审核后进入需求流。" : "商户或技师提交的新情报，等待平台审核后进入情报流。"
  };
}

function normalizeDraftPrice(value: string) {
  const numeric = Number(value.replace(/[^\d.]/g, ""));

  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function escapeCsvCell(value: string | number | boolean) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCsv(filename: string, rows: NeedoAdminRow[]) {
  if (typeof window === "undefined") {
    return;
  }

  const headers = ["ID", "编号", "来源", "服务名", "数量", "价格", "日期", "时间", "联系人", "联系方式", "地址", "状态", "发布时间"];
  const csvRows = rows.map((row) =>
    [
      row.id,
      row.postNo,
      row.sourceLabel,
      row.serviceName,
      row.quantity,
      row.price,
      row.serviceDate,
      row.serviceTime,
      row.contactName,
      row.contactMethod,
      row.address,
      row.status,
      row.publishedAt
    ]
      .map(escapeCsvCell)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

const needoTableCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});

function sortFilterLabels(values: string[]) {
  return [...values].sort((left, right) => needoTableCollator.compare(left, right));
}

function getUniqueFilterLabels(rows: NeedoAdminRow[], column: NeedoTableColumn) {
  return sortFilterLabels(Array.from(new Set(rows.map((row) => column.getFilterLabel(row)).filter(Boolean))));
}

function compareSortValues(left: string | number, right: string | number, direction: NeedoSortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * multiplier;
  }

  return needoTableCollator.compare(String(left), String(right)) * multiplier;
}

function isRowDetailOpenTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? !target.closest("button,a,input,textarea,select,label,[role='button'],[data-no-row-detail='true']")
    : false;
}

function IconButton({
  label,
  children,
  onClick
}: {
  label: string;
  children: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-label={label}
      className="focus-ring grid h-8 w-8 place-items-center rounded-md text-sm font-bold text-ink/60 transition hover:bg-paper hover:text-moss"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function PanelSection({
  title,
  caption,
  children
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="mb-4">
        <h3 className="font-black text-ink">{title}</h3>
        {caption ? <p className="mt-1 text-sm leading-6 text-ink/55">{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ActorSummaryCard({
  actor,
  actionSlot
}: {
  actor: NeedoAdminActor;
  actionSlot?: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-ink p-4 text-white">
      <div className="flex gap-4">
        <AvatarImage alt={actor.displayName} className="h-20 w-20 ring-2 ring-white/10" src={actor.avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={actor.kind === "customer" ? "blue" : actor.kind === "store" ? "green" : "yellow"}>{actor.roleLabel}</Badge>
            <Badge tone="neutral">{actor.systemId}</Badge>
          </div>
          <h3 className="mt-3 truncate text-xl font-black">{actor.displayName}</h3>
          <p className="mt-2 text-sm leading-6 text-white/65">{actor.subtitle}</p>
          <p className="mt-1 text-xs font-bold text-[#f5d26b]">{actor.ratingLabel}</p>
        </div>
        {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
      </div>
    </section>
  );
}

function ActorNameButton({
  actor,
  onOpen
}: {
  actor: NeedoAdminActor;
  onOpen: (actor: NeedoAdminActor) => void;
}) {
  return (
    <button
      className="focus-ring line-clamp-1 text-left text-sm font-bold text-moss hover:underline"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(actor);
      }}
      type="button"
    >
      {actor.displayName}
    </button>
  );
}

function getActorRelatedRows(actor: NeedoAdminActor, rows: NeedoAdminRow[]) {
  return rows.filter(
    (row) =>
      row.actor.kind === actor.kind &&
      (row.actor.id === actor.id || row.actor.systemId === actor.systemId || row.actor.displayName === actor.displayName)
  );
}

function RelatedPostCard({
  row,
  onOpen
}: {
  row: NeedoAdminRow;
  onOpen: (row: NeedoAdminRow) => void;
}) {
  return (
    <button
      className="focus-ring w-full rounded-lg border border-line bg-paper p-3 text-left transition hover:border-moss"
      onClick={() => onOpen(row)}
      type="button"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={row.type === "demand" ? "yellow" : "green"}>{row.type === "demand" ? "需求" : "情报"}</Badge>
          <Badge tone={getStatusTone(row.status)}>{row.status}</Badge>
        </div>
        <span className="text-xs font-bold text-ink/45">{row.publishedAt}</span>
      </div>
      <h4 className="mt-2 line-clamp-2 text-sm font-black text-ink">{row.title}</h4>
      <p className="mt-1 text-xs leading-5 text-ink/55">{row.serviceTime} · {row.address} · {yen(row.price)}</p>
    </button>
  );
}

function NeedoActorProfilePanel({
  actor,
  rows,
  onOpenRow
}: {
  actor: NeedoAdminActor;
  rows: NeedoAdminRow[];
  onOpenRow: (row: NeedoAdminRow) => void;
}) {
  const relatedRows = getActorRelatedRows(actor, rows);
  const totalBudget = relatedRows.reduce((sum, row) => sum + row.price, 0);

  return (
    <div className="space-y-5">
      <ActorSummaryCard actor={actor} />
      <DetailGrid
        items={[
          { label: "主体类型", value: actor.roleLabel },
          { label: "系统ID", value: actor.systemId },
          ...(actor.legalName ? [{ label: "真实姓名", value: actor.legalName }] : []),
          { label: "联系方式", value: actor.contactMethod },
          { label: "关联区域", value: actor.area },
          { label: "关联发布", value: `${relatedRows.length} 条` },
          { label: "关联预算 / 报价", value: yen(totalBudget) },
          { label: "标签", value: actor.tags.join(" / ") || "未设置" }
        ]}
      />
      <PanelSection title="关联需求 / 情报" caption="点击任一信息条可继续查看该条前台内容与后台管理设置。">
        <div className="space-y-3">
          {relatedRows.map((row) => (
            <RelatedPostCard key={row.rowKey} onOpen={onOpenRow} row={row} />
          ))}
          {relatedRows.length === 0 ? <div className="rounded-lg bg-paper p-4 text-sm font-bold text-ink/45">暂无关联发布。</div> : null}
        </div>
      </PanelSection>
      <PanelSection title="主体备注">
        <p className="text-sm leading-6 text-ink/65">{actor.note}</p>
      </PanelSection>
    </div>
  );
}

function NeedoAdminPostDetailPanel({
  row,
  rows,
  onOpenActor,
  onOpenRow,
  onEdit,
  onApprove
}: {
  row: NeedoAdminRow;
  rows: NeedoAdminRow[];
  onOpenActor: (actor: NeedoAdminActor) => void;
  onOpenRow: (row: NeedoAdminRow) => void;
  onEdit: (row: NeedoAdminRow) => void;
  onApprove: (row: NeedoAdminRow) => void;
}) {
  const [activeTab, setActiveTab] = useState<NeedoDetailTab>("前台内容");
  const detail = getDemandDetail(row.post);
  const remainingMs = new Date(row.post.expiresAt).getTime() - Date.now();
  const relatedRows = getActorRelatedRows(row.actor, rows).filter((relatedRow) => relatedRow.rowKey !== row.rowKey);
  const paymentRows = [
    { label: row.type === "demand" ? "预算" : "价格", value: yen(row.price), highlight: true },
    { label: row.type === "demand" ? "已预付" : "需预付", value: yen(detail.prepaidAmount), highlight: false },
    { label: "到场支付", value: yen(detail.cashAmount), highlight: false }
  ];
  const serviceFlow = row.type === "demand"
    ? ["需求发布", "平台审核", "商户 / 技师抢单", "用户判断", "生成订单", "履约结算"]
    : ["情报发布", "平台审核", "用户预约", "发布方确认", "到店 / 上门履约", "评价归档"];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg bg-ink text-white shadow-panel">
        <div className="relative min-h-52">
          <img alt={row.title} className="absolute inset-0 h-full w-full object-cover opacity-35" src={row.post.image} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-ink" />
          <div className="relative flex min-h-52 flex-col justify-between p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={row.type === "demand" ? "yellow" : "green"}>{row.type === "demand" ? "需求" : "情报"}</Badge>
              <Badge tone={getStatusTone(row.status)}>{row.status}</Badge>
              <Badge tone="neutral">{row.postNo}</Badge>
            </div>
            <div>
              <h3 className="line-clamp-2 text-2xl font-black">{row.title}</h3>
              <p className="mt-2 text-sm font-bold text-white/70">{row.serviceTime} · {row.address} · {yen(row.price)}</p>
            </div>
          </div>
        </div>
      </section>

      <Tabs active={activeTab} items={detailTabs} onChange={(item) => setActiveTab(item as NeedoDetailTab)} />

      {activeTab === "前台内容" ? (
        <div className="space-y-5">
          <PanelSection title="介绍" caption="与前台详情页的介绍内容保持一致。">
            <p className="text-sm leading-6 text-ink/70">{row.detail}</p>
          </PanelSection>
          <PanelSection title="期限与服务要求">
            <DetailGrid
              items={[
                { label: "有效状态", value: remainingMs > 0 ? "有效中" : "已过期" },
                { label: "有效截止", value: row.expiresAt },
                { label: "服务名称", value: row.serviceName },
                { label: "服务时间", value: row.serviceTime },
                { label: "服务地址 / 区域", value: row.address },
                { label: "服务标签", value: row.tags.join(" / ") }
              ]}
            />
            <div className="mt-3 rounded-lg bg-paper p-3 text-xs leading-5 text-ink/55">
              <strong className="text-ink">安全提示：</strong>
              抢单或预约前需要确认人数、到达方式、酒店登记、现金尾款和特殊要求，平台内沟通会自动归档。
            </div>
          </PanelSection>
          <PanelSection title="服务流程">
            <div className="grid gap-2 sm:grid-cols-3">
              {serviceFlow.map((step, index) => (
                <div className="rounded-lg border border-line bg-paper p-3" key={step}>
                  <span className="text-xs font-black text-moss">STEP {index + 1}</span>
                  <p className="mt-1 text-sm font-black text-ink">{step}</p>
                </div>
              ))}
            </div>
          </PanelSection>
        </div>
      ) : null}

      {activeTab === "支付与履约" ? (
        <div className="space-y-5">
          <PanelSection title="支付信息" caption={detail.paymentStatus}>
            <div className="grid gap-3 sm:grid-cols-3">
              {paymentRows.map((item) => (
                <div className="rounded-lg border border-line bg-paper p-3" key={item.label}>
                  <p className="text-xs font-semibold text-ink/50">{item.label}</p>
                  <strong className={cn("mt-1 block text-lg font-black", item.highlight ? "text-moss" : "text-ink")}>{item.value}</strong>
                </div>
              ))}
            </div>
          </PanelSection>
          <DetailGrid
            items={[
              { label: "是否接受车费 / 移动", value: row.acceptsTravelFee ? "是" : "否" },
              { label: "报价 / 预算", value: yen(row.price) },
              { label: "发布来源", value: row.sourceLabel },
              { label: "应募 / 预约热度", value: `${row.post.offers} 次` },
              { label: "点赞", value: `${getPostLikeCount(row.post)} 次` },
              { label: "评论", value: `${getPostReplyCount(row.post)} 条` }
            ]}
          />
        </div>
      ) : null}

      {activeTab === "发布主体" ? (
        <div className="space-y-5">
          <ActorSummaryCard
            actor={row.actor}
            actionSlot={
              <Button onClick={() => onOpenActor(row.actor)} size="sm" variant="secondary">
                查看关联
              </Button>
            }
          />
          <DetailGrid
            items={[
              { label: "联系人", value: row.actor.displayName },
              { label: "联系方式", value: row.actor.contactMethod },
              { label: "系统ID", value: row.actor.systemId },
              { label: "主体评分", value: row.actor.ratingLabel },
              { label: "发布区域", value: row.actor.area },
              { label: "关联发布数", value: `${relatedRows.length + 1} 条` }
            ]}
          />
          <PanelSection title="同主体其他发布">
            <div className="space-y-3">
              {relatedRows.map((relatedRow) => (
                <RelatedPostCard key={relatedRow.rowKey} onOpen={onOpenRow} row={relatedRow} />
              ))}
              {relatedRows.length === 0 ? <div className="rounded-lg bg-paper p-4 text-sm font-bold text-ink/45">暂无其他关联发布。</div> : null}
            </div>
          </PanelSection>
        </div>
      ) : null}

      {activeTab === "互动评论" ? (
        <div className="space-y-5">
          <PanelSection title="评论">
            <div className="space-y-3">
              {detail.reviews.map((review) => (
                <article className="rounded-lg border border-line bg-paper p-3" key={review.id}>
                  <div className="flex gap-3">
                    <AvatarImage alt={review.commenterName} className="h-10 w-10" src={review.commenterAvatar} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-ink">{review.commenterName}</strong>
                        <span className="text-xs font-bold text-ink/45">{review.date} · ★ {review.rating}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink/65">{review.content}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </PanelSection>
          <PanelSection title={row.type === "demand" ? "需求发出人动态" : "关联动态"}>
            <div className="space-y-3">
              {detail.moments.map((moment) => (
                <article className="rounded-lg bg-paper p-3" key={moment.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm text-ink">{moment.title}</strong>
                    <span className="text-xs text-ink/45">{moment.date}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-ink/60">{moment.content}</p>
                </article>
              ))}
            </div>
          </PanelSection>
        </div>
      ) : null}

      {activeTab === "管理设置" ? (
        <div className="space-y-5">
          <DetailGrid
            items={[
              { label: "审核状态", value: <Badge tone={getStatusTone(row.status)}>{row.status}</Badge> },
              { label: "展示范围", value: row.type === "demand" ? "需求流 / 可抢单列表" : "情报流 / 可预约列表" },
              { label: "优先级", value: row.price >= 30000 || row.post.offers >= 20 ? "高优先" : "普通" },
              { label: "风控", value: row.detail.includes("现金") ? "需关注现金尾款" : "未命中高风险词" },
              { label: "发布端口", value: row.sourceContext === "user" ? "用户端" : row.sourceContext === "merchant" ? "商户端" : "技师端" },
              { label: "前台路径", value: row.frontPath },
              { label: "发布时间", value: row.publishedAt },
              { label: "自动下架", value: row.expiresAt }
            ]}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={() => onEdit(row)} variant="secondary">编辑</Button>
            <Button onClick={() => onApprove(row)}>核准发布</Button>
            <Button to={row.frontPath} variant="secondary">前台详情</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NeedoExchangeAdminPage({ mode }: { mode: NeedoExchangeAdminMode }) {
  const copy = modeCopy[mode];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<NeedoAdminRow[]>(() => buildAdminRows(mode));
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [detailRow, setDetailRow] = useState<NeedoAdminRow | null>(null);
  const [actorProfile, setActorProfile] = useState<NeedoAdminActor | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft | null>(null);
  const [sortState, setSortState] = useState<NeedoSortState | null>(null);
  const [columnFilters, setColumnFilters] = useState<NeedoColumnFilters>({});
  const [columnSearch, setColumnSearch] = useState<NeedoColumnSearch>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<NeedoTableColumnKey | null>(null);

  const selectedRowKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
  const tableColumns = useMemo<NeedoTableColumn[]>(
    () => [
      { key: "id", title: "ID", className: "w-20 border-b border-line px-4 py-3", getFilterLabel: (row) => String(row.id), getSortValue: (row) => row.id },
      { key: "postNo", title: copy.codeTitle, className: "w-36 border-b border-line px-4 py-3", getFilterLabel: (row) => row.postNo, getSortValue: (row) => row.postNo },
      { key: "serviceName", title: "服务名称", className: "w-56 border-b border-line px-4 py-3", getFilterLabel: (row) => row.serviceName, getSortValue: (row) => `${row.serviceName} ${row.title}` },
      { key: "quantity", title: copy.quantityTitle, className: "w-24 border-b border-line px-4 py-3", getFilterLabel: (row) => row.quantity, getSortValue: (row) => Number(row.quantity.replace(/[^\d.]/g, "")) || row.quantity },
      { key: "price", title: copy.priceTitle, className: "w-28 border-b border-line px-4 py-3", getFilterLabel: (row) => yen(row.price), getSortValue: (row) => row.price },
      { key: "serviceDate", title: copy.dateTitle, className: "w-32 border-b border-line px-4 py-3", getFilterLabel: (row) => row.serviceDate, getSortValue: (row) => new Date(row.serviceDate).getTime() || row.serviceDate },
      { key: "serviceTime", title: copy.timeTitle, className: "w-36 border-b border-line px-4 py-3", getFilterLabel: (row) => row.serviceTime, getSortValue: (row) => row.serviceTime },
      {
        key: "acceptsTravelFee",
        title: copy.travelTitle,
        className: "w-32 border-b border-line px-4 py-3 text-center",
        align: "center",
        getFilterLabel: (row) => (row.acceptsTravelFee ? copy.travelTitle : `不${copy.travelTitle}`),
        getSortValue: (row) => (row.acceptsTravelFee ? 1 : 0)
      },
      { key: "contactName", title: copy.contactTitle, className: "w-52 border-b border-line px-4 py-3", getFilterLabel: (row) => row.contactName, getSortValue: (row) => row.contactName },
      { key: "contactMethod", title: copy.methodTitle, className: "w-40 border-b border-line px-4 py-3", getFilterLabel: (row) => row.contactMethod, getSortValue: (row) => row.contactMethod },
      { key: "address", title: copy.addressTitle, className: "w-40 border-b border-line px-4 py-3", getFilterLabel: (row) => row.address, getSortValue: (row) => row.address },
      { key: "status", title: "状态", className: "w-32 border-b border-line px-4 py-3", popoverAlign: "right", getFilterLabel: (row) => row.status, getSortValue: (row) => row.status },
      { key: "publishedAt", title: "发布时间", className: "w-44 border-b border-line px-4 py-3", popoverAlign: "right", getFilterLabel: (row) => row.publishedAt, getSortValue: (row) => new Date(row.publishedAt).getTime() || row.publishedAt }
    ],
    [copy.addressTitle, copy.codeTitle, copy.contactTitle, copy.dateTitle, copy.methodTitle, copy.priceTitle, copy.quantityTitle, copy.timeTitle, copy.travelTitle]
  );
  const keywordRows = useMemo(() => {
    const normalized = appliedKeyword.trim().toLowerCase();

    if (!normalized) {
      return rows;
    }

    return rows.filter((row) =>
      [
        row.postNo,
        row.sourceLabel,
        row.title,
        row.serviceName,
        row.quantity,
        row.contactName,
        row.contactMethod,
        row.actor.systemId,
        row.actor.roleLabel,
        row.actor.subtitle,
        row.address,
        row.status,
        row.publishedAt
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [appliedKeyword, rows]);
  const columnFilterOptions = useMemo(
    () =>
      tableColumns.reduce(
        (options, column) => ({
          ...options,
          [column.key]: getUniqueFilterLabels(keywordRows, column)
        }),
        {} as Record<NeedoTableColumnKey, string[]>
      ),
    [keywordRows, tableColumns]
  );
  const visibleRows = useMemo(() => {
    const filteredRows = keywordRows.filter((row) =>
      tableColumns.every((column) => {
        const selectedValues = columnFilters[column.key];

        return !selectedValues || selectedValues.includes(column.getFilterLabel(row));
      })
    );

    if (!sortState) {
      return filteredRows;
    }

    const sortColumn = tableColumns.find((column) => column.key === sortState.key);

    if (!sortColumn) {
      return filteredRows;
    }

    return filteredRows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const result = compareSortValues(sortColumn.getSortValue(left.row), sortColumn.getSortValue(right.row), sortState.direction);

        return result || left.index - right.index;
      })
      .map(({ row }) => row);
  }, [columnFilters, keywordRows, sortState, tableColumns]);
  const selectedVisibleRows = visibleRows.filter((row) => selectedRowKeySet.has(row.rowKey));
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleRows.length === visibleRows.length;

  const resetRows = () => {
    setRows(buildAdminRows(mode));
    setKeyword("");
    setAppliedKeyword("");
    setSelectedRowKeys([]);
    setSortState(null);
    setColumnFilters({});
    setColumnSearch({});
    setOpenFilterColumn(null);
  };

  const openCreateDrawer = () => {
    setEditingRowKey(null);
    setDraft(createEmptyDraft(mode));
  };

  const openEditDrawer = (row: NeedoAdminRow) => {
    setEditingRowKey(row.rowKey);
    setDraft(createDraftFromRow(row));
  };

  const openDetailRow = (row: NeedoAdminRow) => {
    setActorProfile(null);
    setDetailRow(row);
  };

  const openActorProfile = (actor: NeedoAdminActor) => {
    setDetailRow(null);
    setActorProfile(actor);
  };

  const closeEditor = () => {
    setEditingRowKey(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) {
      return;
    }

    if (editingRowKey) {
      setRows((current) =>
        current.map((row) => (row.rowKey === editingRowKey ? updateRowFromDraft(row, draft) : row))
      );
      setDetailRow((current) => (current?.rowKey === editingRowKey ? updateRowFromDraft(current, draft) : current));
      setActorProfile(null);
      closeEditor();
      return;
    }

    const id = Math.max(0, ...rows.map((row) => row.id)) + 1;
    const rowKey = `manual:${mode}:${Date.now()}`;
    const sourceContext: MessageCenterContext = mode === "demand" ? "user" : "merchant";
    const post = buildPostFromDraft(mode, rowKey, draft, sourceContext);
    const actor = buildActorFromDraftPost(post, sourceContext, draft);
    const nextRow: NeedoAdminRow = {
      rowKey,
      id,
      post,
      actor,
      postNo: `${mode === "demand" ? "D" : "I"}${String(Date.now()).slice(-10)}`,
      sourceContext,
      sourceLabel: mode === "demand" ? "用户需求" : "商户情报",
      type: post.type,
      title: draft.title,
      serviceName: draft.serviceName,
      quantity: draft.quantity,
      price: normalizeDraftPrice(draft.price),
      serviceDate: draft.serviceDate,
      serviceTime: draft.serviceTime,
      acceptsTravelFee: draft.acceptsTravelFee,
      contactName: actor.displayName,
      contactMethod: actor.contactMethod,
      address: draft.address,
      status: draft.status,
      publishedAt: formatDateTime(post.publishedAt),
      expiresAt: formatDateTime(post.expiresAt),
      detail: draft.detail,
      tags: post.tags,
      frontPath: getFrontPath({ id, rowKey, sourceContext }, post.id)
    };

    setRows((current) => [nextRow, ...current.map((row, index) => ({ ...row, id: index + 2 }))]);
    closeEditor();
  };

  const deleteRows = (rowKeys: string[]) => {
    if (rowKeys.length === 0) {
      return;
    }

    setRows((current) => current.filter((row) => !rowKeys.includes(row.rowKey)).map((row, index) => ({ ...row, id: index + 1 })));
    setSelectedRowKeys((current) => current.filter((rowKey) => !rowKeys.includes(rowKey)));
    if (detailRow && rowKeys.includes(detailRow.rowKey)) {
      setDetailRow(null);
    }
    if (actorProfile && rows.every((row) => rowKeys.includes(row.rowKey) || row.actor.systemId !== actorProfile.systemId)) {
      setActorProfile(null);
    }
  };

  const updateRowsStatus = (rowKeys: string[], status: NeedoAdminStatus) => {
    if (rowKeys.length === 0) {
      return;
    }

    setRows((current) => current.map((row) => (rowKeys.includes(row.rowKey) ? { ...row, status } : row)));
    setDetailRow((current) => (current && rowKeys.includes(current.rowKey) ? { ...current, status } : current));
  };

  const updateSelectedStatus = (status: NeedoAdminStatus) => {
    updateRowsStatus(selectedRowKeys, status);
  };

  const toggleRowSelection = (rowKey: string) => {
    setSelectedRowKeys((current) => (current.includes(rowKey) ? current.filter((item) => item !== rowKey) : [...current, rowKey]));
  };

  const toggleVisibleSelection = () => {
    if (allVisibleSelected) {
      setSelectedRowKeys((current) => current.filter((rowKey) => !visibleRows.some((row) => row.rowKey === rowKey)));
      return;
    }

    setSelectedRowKeys((current) => Array.from(new Set([...current, ...visibleRows.map((row) => row.rowKey)])));
  };

  const getSelectedColumnValues = (columnKey: NeedoTableColumnKey) => columnFilters[columnKey] ?? columnFilterOptions[columnKey] ?? [];

  const applyColumnFilter = (columnKey: NeedoTableColumnKey, values: string[]) => {
    const options = columnFilterOptions[columnKey] ?? [];
    const normalizedValues = sortFilterLabels(Array.from(new Set(values.filter((value) => options.includes(value)))));

    setColumnFilters((current) => {
      const next = { ...current };

      if (options.length === 0 || normalizedValues.length === options.length) {
        delete next[columnKey];
      } else {
        next[columnKey] = normalizedValues;
      }

      return next;
    });
    setSelectedRowKeys([]);
  };

  const toggleColumnFilterValue = (columnKey: NeedoTableColumnKey, value: string) => {
    const selectedValues = getSelectedColumnValues(columnKey);
    const nextValues = selectedValues.includes(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];

    applyColumnFilter(columnKey, nextValues);
  };

  const toggleColumnFilterOptions = (columnKey: NeedoTableColumnKey, visibleOptions: string[]) => {
    if (visibleOptions.length === 0) {
      return;
    }

    const selectedValues = getSelectedColumnValues(columnKey);
    const selectedSet = new Set(selectedValues);
    const allVisibleSelected = visibleOptions.every((option) => selectedSet.has(option));
    const nextValues = allVisibleSelected
      ? selectedValues.filter((value) => !visibleOptions.includes(value))
      : Array.from(new Set([...selectedValues, ...visibleOptions]));

    applyColumnFilter(columnKey, nextValues);
  };

  const clearColumnFilter = (columnKey: NeedoTableColumnKey) => {
    setColumnFilters((current) => {
      const next = { ...current };

      delete next[columnKey];

      return next;
    });
    setColumnSearch((current) => ({ ...current, [columnKey]: "" }));
  };

  const applyColumnState = (columnKey: NeedoTableColumnKey, payload: TableColumnHeaderApplyPayload) => {
    setColumnSearch((current) => ({ ...current, [columnKey]: payload.searchValue }));
    applyColumnFilter(columnKey, payload.selectedValues);

    if (payload.sortDirection) {
      setSortState({ key: columnKey, direction: payload.sortDirection });
    }
  };

  useEffect(() => {
    if (!openFilterColumn) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenFilterColumn(null);
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        !target.closest(".needo-table-filter-popover") &&
        !target.closest(".needo-table-filter-trigger")
      ) {
        setOpenFilterColumn(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openFilterColumn]);

  const importCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const text = String(reader.result ?? "");
      const importedRows = text
        .split(/\r?\n/)
        .slice(1)
        .map((line, index) => line.split(","))
        .filter((cells) => cells.length >= 4 && cells.some((cell) => cell.trim()))
        .map((cells, index): NeedoAdminRow => {
          const id = rows.length + index + 1;
          const rowKey = `import:${mode}:${Date.now()}:${index}`;
          const sourceContext: MessageCenterContext = mode === "demand" ? "user" : "merchant";
          const draftFromCsv: RowDraft = {
            title: cells[3]?.trim() || "导入项目",
            serviceName: cells[3]?.trim() || "导入项目",
            quantity: cells[4]?.trim() || "x1",
            price: cells[5]?.trim() || "0",
            serviceDate: cells[6]?.trim() || "2026-05-15",
            serviceTime: cells[7]?.trim() || "19:00 - 21:00",
            acceptsTravelFee: true,
            contactName: cells[8]?.trim() || "导入联系人",
            contactMethod: cells[9]?.trim() || buildPhone(rowKey),
            address: cells[10]?.trim() || "未设置",
            status: statusOptions.includes(cells[11]?.trim() as NeedoAdminStatus) ? (cells[11].trim() as NeedoAdminStatus) : "待审核",
            detail: "由 CSV 导入的管理项目。"
          };
          const post = buildPostFromDraft(mode, rowKey, draftFromCsv, sourceContext);
          const actor = buildActorFromDraftPost(post, sourceContext, draftFromCsv);

          return {
            rowKey,
            id,
            post,
            actor,
            postNo: cells[1]?.trim() || `${mode === "demand" ? "D" : "I"}${String(Date.now() + index).slice(-10)}`,
            sourceContext,
            sourceLabel: cells[2]?.trim() || (mode === "demand" ? "用户需求" : "商户情报"),
            type: post.type,
            title: draftFromCsv.title,
            serviceName: draftFromCsv.serviceName,
            quantity: draftFromCsv.quantity,
            price: normalizeDraftPrice(draftFromCsv.price),
            serviceDate: draftFromCsv.serviceDate,
            serviceTime: draftFromCsv.serviceTime,
            acceptsTravelFee: draftFromCsv.acceptsTravelFee,
            contactName: actor.displayName,
            contactMethod: actor.contactMethod,
            address: draftFromCsv.address,
            status: draftFromCsv.status,
            publishedAt: cells[12]?.trim() || formatDateTime(new Date().toISOString()),
            expiresAt: formatDateTime(post.expiresAt),
            detail: draftFromCsv.detail,
            tags: ["导入", ...post.tags],
            frontPath: getFrontPath({ id, rowKey, sourceContext }, post.id)
          };
        });

      if (importedRows.length > 0) {
        setRows((current) => [...importedRows, ...current].map((row, index) => ({ ...row, id: index + 1 })));
      }
    });
    reader.readAsText(file);
  };

  return (
    <AdminLayout>
      <div className="space-y-5 pb-28">
        <section className="rounded-lg bg-white px-4 py-3 shadow-panel md:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-[180px] items-center gap-3">
              <span className="h-6 w-1.5 rounded-full bg-coral" />
              <h1 className="text-lg font-black text-ink">{copy.hallTitle}</h1>
            </div>
            <label className="text-sm font-black text-ink/60 xl:ml-6" htmlFor={`${mode}-keyword`}>
              关键词
            </label>
            <input
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink outline-none placeholder:text-ink/35 focus:border-moss xl:max-w-72"
              id={`${mode}-keyword`}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedKeyword(keyword.trim());
                }
              }}
              placeholder={copy.keywordPlaceholder}
              value={keyword}
            />
            <Button className="h-10 rounded-md px-6 text-sm" onClick={() => setAppliedKeyword(keyword.trim())} variant="secondary">
              查询
            </Button>
            <div className="flex-1" />
            <Button className="h-10 rounded-md px-6 text-sm" onClick={openCreateDrawer}>
              新增
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <HorizontalScrollArea ariaLabel={`${copy.hallTitle}表格横向滚动区域`}>
            <table className="w-full min-w-[1860px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-paper text-xs font-semibold text-ink/55">
                <tr>
                  <th className="w-12 border-b border-line px-3 py-3 text-center">
                    <input
                      aria-label="选择当前列表"
                      checked={allVisibleSelected}
                      className="h-4 w-4"
                      onClick={(event) => event.stopPropagation()}
                      onChange={toggleVisibleSelection}
                      type="checkbox"
                    />
                  </th>
                  {tableColumns.map((column) => (
                    <TableColumnHeader
                      align={column.align}
                      className={column.className}
                      filterOptions={columnFilterOptions[column.key] ?? []}
                      isOpen={openFilterColumn === column.key}
                      key={column.key}
                      popoverAlign={column.popoverAlign}
                      searchValue={columnSearch[column.key] ?? ""}
                      selectedValues={getSelectedColumnValues(column.key)}
                      sortDirection={sortState?.key === column.key ? sortState.direction : undefined}
                      title={column.title}
                      onApply={(payload) => applyColumnState(column.key, payload)}
                      onClearFilter={() => clearColumnFilter(column.key)}
                      onOpenChange={() => setOpenFilterColumn((current) => (current === column.key ? null : column.key))}
                      onSearchChange={(value) => setColumnSearch((current) => ({ ...current, [column.key]: value }))}
                      onSort={(direction) => setSortState({ key: column.key, direction })}
                      onToggleAll={(visibleOptions) => toggleColumnFilterOptions(column.key, visibleOptions)}
                      onToggleValue={(value) => toggleColumnFilterValue(column.key, value)}
                    />
                  ))}
                  <th className="w-20 border-b border-line px-4 py-3 text-center">编辑</th>
                  <th className="w-20 border-b border-line px-4 py-3 text-center">删除</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-paper/55"
                    key={row.rowKey}
                    onClickCapture={(event) => {
                      if (isRowDetailOpenTarget(event.target)) {
                        openDetailRow(row);
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                        event.preventDefault();
                        openDetailRow(row);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        aria-label={`选择 ${row.postNo}`}
                        checked={selectedRowKeySet.has(row.rowKey)}
                        className="h-4 w-4"
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleRowSelection(row.rowKey)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink/80">{row.id}</td>
                    <td className="px-4 py-3 font-semibold leading-5 text-ink/80">{row.postNo}</td>
                    <td className="px-4 py-3">
                      <button
                        className="w-full text-left transition hover:text-moss"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetailRow(row);
                        }}
                        type="button"
                      >
                        <span className="line-clamp-1 font-black leading-5 text-ink">{row.serviceName}</span>
                        <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-4 text-ink/55">{row.title}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink/80">{row.quantity}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{yen(row.price)}</td>
                    <td className="px-4 py-3 font-medium leading-5 text-ink/65">{row.serviceDate}</td>
                    <td className="px-4 py-3 font-medium leading-5 text-ink/65">{row.serviceTime}</td>
                    <td className="px-4 py-3 text-center">
                      <AdminToggleSwitch ariaLabel={row.acceptsTravelFee ? "接受车费" : "不接受车费"} checked={row.acceptsTravelFee} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarImage alt={row.actor.displayName} className="h-9 w-9 shrink-0" src={row.actor.avatar} />
                        <div className="min-w-0">
                          <ActorNameButton actor={row.actor} onOpen={openActorProfile} />
                          <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-ink/50">{row.actor.roleLabel}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium leading-5 text-ink/65">{row.contactMethod}</td>
                    <td className="px-4 py-3 font-medium leading-5 text-ink/80">{row.address}</td>
                    <td className="px-4 py-3">
                      <Badge tone={getStatusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium leading-5 text-ink/65">{row.publishedAt}</td>
                    <td className="px-4 py-3 text-center">
                      <IconButton
                        label={`编辑 ${row.postNo}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDrawer(row);
                        }}
                      >
                        ✎
                      </IconButton>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <IconButton
                        label={`删除 ${row.postNo}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteRows([row.rowKey]);
                        }}
                      >
                        ×
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length === 0 ? (
              <div className="grid min-h-48 place-items-center border-b border-line text-sm font-black text-ink/45">{copy.emptyTitle}</div>
            ) : null}
          </HorizontalScrollArea>
        </section>

        <section className="needo-admin-action-dock rounded-lg bg-white px-4 py-3 shadow-panel md:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="needo-admin-action-buttons grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9 xl:flex xl:flex-wrap">
              <Button className="rounded-md" onClick={resetRows} variant="secondary">
                刷新
              </Button>
              <Button className="rounded-md" onClick={openCreateDrawer} variant="secondary">
                新增
              </Button>
              <Button className="rounded-md" onClick={() => deleteRows(selectedRowKeys)} variant="secondary">
                删除
              </Button>
              <Button className="rounded-md" onClick={() => fileInputRef.current?.click()} variant="secondary">
                导入
              </Button>
              <Button className="rounded-md" onClick={() => downloadCsv(copy.csvName, visibleRows)} variant="secondary">
                导出
              </Button>
              <Button className="rounded-md" onClick={() => window.print()} variant="secondary">
                打印
              </Button>
              <Button className="rounded-md" onClick={() => updateSelectedStatus("审核中")} variant="secondary">
                审核
              </Button>
              <Button className="rounded-md" onClick={() => updateSelectedStatus("已发布")} variant="secondary">
                核准
              </Button>
              <Button className="rounded-md" onClick={resetRows} variant="secondary">
                初始化
              </Button>
              <Button className="rounded-md" onClick={() => setRows([])} variant="secondary">
                清空
              </Button>
              <Button className="rounded-md" to="/admin/orders" variant="secondary">
                返回
              </Button>
            </div>
            <div className="flex-1" />
            <div className="flex items-center justify-end gap-3 text-sm font-bold text-ink/65">
              <span>共 {visibleRows.length} 条</span>
              <button className="grid h-10 w-10 place-items-center rounded-md bg-paper text-ink/35" disabled type="button">
                ‹
              </button>
              <span className="grid h-10 min-w-10 place-items-center rounded-md bg-moss px-3 text-white">1</span>
              <button className="grid h-10 w-10 place-items-center rounded-md bg-paper text-ink/35" disabled type="button">
                ›
              </button>
            </div>
          </div>
          <input accept=".csv,text/csv" className="hidden" onChange={importCsv} ref={fileInputRef} type="file" />
        </section>
      </div>

      <Drawer
        defaultWidth={900}
        maxWidth={1120}
        open={Boolean(detailRow)}
        title={detailRow ? `${detailRow.type === "demand" ? "需求" : "情报"}详细信息` : copy.pageTitle}
        widthStorageKey={`needo.admin.${mode}.detail-drawer.width`}
        onClose={() => setDetailRow(null)}
      >
        {detailRow ? (
          <NeedoAdminPostDetailPanel
            row={detailRow}
            rows={rows}
            onApprove={(row) => updateRowsStatus([row.rowKey], "已发布")}
            onEdit={openEditDrawer}
            onOpenActor={openActorProfile}
            onOpenRow={openDetailRow}
          />
        ) : null}
      </Drawer>

      <Drawer
        defaultWidth={760}
        maxWidth={1040}
        open={Boolean(actorProfile)}
        title={actorProfile ? `${actorProfile.displayName} 的关联资料` : "关联资料"}
        widthStorageKey={`needo.admin.${mode}.actor-drawer.width`}
        onClose={() => setActorProfile(null)}
      >
        {actorProfile ? <NeedoActorProfilePanel actor={actorProfile} rows={rows} onOpenRow={openDetailRow} /> : null}
      </Drawer>

      <Drawer open={Boolean(draft)} title={editingRowKey ? "编辑" : copy.addLabel} onClose={closeEditor}>
        {draft ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-black text-ink/45">标题</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                value={draft.title}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black text-ink/45">服务名称</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, serviceName: event.target.value })}
                  value={draft.serviceName}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">{copy.quantityTitle}</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                  value={draft.quantity}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">{copy.priceTitle}</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  inputMode="numeric"
                  onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                  value={draft.price}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">状态</span>
                <select
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as NeedoAdminStatus })}
                  value={draft.status}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">{copy.dateTitle}</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, serviceDate: event.target.value })}
                  value={draft.serviceDate}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">{copy.timeTitle}</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, serviceTime: event.target.value })}
                  value={draft.serviceTime}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">{copy.contactTitle}</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, contactName: event.target.value })}
                  value={draft.contactName}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-ink/45">{copy.methodTitle}</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setDraft({ ...draft, contactMethod: event.target.value })}
                  value={draft.contactMethod}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-black text-ink/45">{copy.addressTitle}</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                value={draft.address}
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-line bg-paper p-3 text-sm font-black text-ink/65">
              <span>{copy.travelTitle}</span>
              <AdminToggleSwitch
                ariaLabel={`${copy.travelTitle}${draft.acceptsTravelFee ? "开启" : "关闭"}`}
                checked={draft.acceptsTravelFee}
                onChange={(checked) => setDraft({ ...draft, acceptsTravelFee: checked })}
              />
            </div>
            <label className="block">
              <span className="text-xs font-black text-ink/45">内容</span>
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border border-line bg-white px-3 py-3 text-sm font-bold outline-none focus:border-moss"
                onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
                value={draft.detail}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={saveDraft}>保存</Button>
              <Button onClick={closeEditor} variant="secondary">
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}

export function NeedoDemandAdminPage() {
  return <NeedoExchangeAdminPage mode="demand" />;
}

export function NeedoInfoAdminPage() {
  return <NeedoExchangeAdminPage mode="info" />;
}
