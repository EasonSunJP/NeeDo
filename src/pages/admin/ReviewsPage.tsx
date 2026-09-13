import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { ReviewAmendmentDialog } from "../../features/platform-user-management/ReviewAmendmentDialog";
import { platformUserManagementApi } from "../../features/platform-user-management/api";
import type {
  OperationsReview,
  OperationsReviewQuery,
  OperationsReviewStatus
} from "../../features/platform-user-management/types";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { languageLocales } from "../../i18n/translations";

const pageSize = 20;
const dateInputClass = "h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none";

function statusLabel(status: OperationsReviewStatus) {
  if (status === "amended") return "已修订";
  if (status === "system") return "系统生成";
  return "原始记录";
}

function statusTone(status: OperationsReviewStatus): BadgeTone {
  if (status === "amended") return "yellow";
  if (status === "system") return "blue";
  return "green";
}

function targetLabel(targetType: OperationsReview["targetType"]) {
  return targetType === "technician" ? "技师服务评价" : "客户评价";
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看正式评价的权限";
    if (error.status === 404) return "该正式评价不存在或已不可用";
  }

  return fallback;
}

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function ReviewsPage() {
  const { hasPermission } = useAuth();
  const { language } = useOptionalI18n();
  const canAmend = hasPermission("backoffice:customers:write");
  const [rows, setRows] = useState<OperationsReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [rating, setRating] = useState<OperationsReviewQuery["rating"]>();
  const [reviewStatus, setReviewStatus] = useState<OperationsReviewStatus>();
  const [targetType, setTargetType] = useState<OperationsReview["targetType"]>();
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateError, setDateError] = useState("");
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedReview, setSelectedReview] = useState<OperationsReview | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detailError, setDetailError] = useState("");
  const detailRequestId = useRef(0);

  useEffect(() => {
    let current = true;
    setLoadStatus("loading");
    setLoadError("");
    void platformUserManagementApi.listOperationsReviews({
      page,
      page_size: pageSize,
      keyword: keyword || undefined,
      rating,
      status: reviewStatus,
      targetType,
      from: from || undefined,
      to: to || undefined
    }).then((result) => {
      if (!current) return;
      setRows(result.list);
      setTotal(result.total);
      setLoadStatus("success");
    }).catch((error: unknown) => {
      if (!current) return;
      setRows([]);
      setTotal(0);
      setLoadError(describeError(error, "正式评价读取失败，请稍后重试"));
      setLoadStatus("error");
    });

    return () => {
      current = false;
    };
  }, [from, keyword, page, rating, reviewStatus, revision, targetType, to]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(languageLocales[language], {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }),
    [language]
  );
  const formatDate = (value: string) => dateFormatter.format(new Date(value));

  const applyKeyword = () => {
    setPage(1);
    setKeyword(keywordDraft.trim());
  };

  const applyDates = () => {
    if (fromDraft && toDraft && fromDraft > toDraft) {
      setDateError("开始日期不能晚于结束日期");
      return;
    }

    setDateError("");
    setPage(1);
    setFrom(fromDraft);
    setTo(toDraft);
  };

  const openReview = async (review: OperationsReview) => {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    setSelectedReview(review);
    setDetailStatus("loading");
    setDetailError("");

    try {
      const detail = await platformUserManagementApi.getOperationsReview(review.reviewId);
      if (detailRequestId.current !== requestId) return;
      setSelectedReview(detail);
      setDetailStatus("success");
    } catch (error: unknown) {
      if (detailRequestId.current !== requestId) return;
      setDetailError(describeError(error, "正式评价详情读取失败，请稍后重试"));
      setDetailStatus("error");
    }
  };

  const closeReview = () => {
    detailRequestId.current += 1;
    setSelectedReview(null);
    setDetailStatus("idle");
    setDetailError("");
  };

  const refreshReviewAfterAmendment = () => {
    setRevision((value) => value + 1);
    if (selectedReview) void openReview(selectedReview);
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="评价中心"
        description="读取正式订单评价、关联用户、店铺与技师，并保留不可变修订历史。"
        actions={<Badge tone="green">正式数据</Badge>}
      >
        <div className="space-y-4">
          <FilterBar
            filters={[
              {
                label: "评分",
                options: [1, 2, 3, 4, 5].map((value) => ({ label: `${value} 星`, value: String(value) })),
                value: rating ? String(rating) : "",
                onChange: (value) => {
                  setPage(1);
                  setRating(value ? Number(value) as OperationsReviewQuery["rating"] : undefined);
                }
              },
              {
                label: "状态",
                options: [
                  { label: "原始记录", value: "original" },
                  { label: "已修订", value: "amended" },
                  { label: "系统生成", value: "system" }
                ],
                value: reviewStatus ?? "",
                onChange: (value) => {
                  setPage(1);
                  setReviewStatus(value ? value as OperationsReviewStatus : undefined);
                }
              },
              {
                label: "评价对象",
                options: [
                  { label: "技师", value: "technician" },
                  { label: "客户", value: "customer" }
                ],
                value: targetType ?? "",
                onChange: (value) => {
                  setPage(1);
                  setTargetType(value ? value as OperationsReview["targetType"] : undefined);
                }
              }
            ]}
            onSearchChange={setKeywordDraft}
            onSearchSubmit={applyKeyword}
            searchLabel="搜索评价"
            searchPlaceholder="搜索评价、订单、用户、店铺或技师"
            searchValue={keywordDraft}
          />

          <section className="rounded-lg border border-line bg-white p-3 shadow-panel">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-bold text-ink/55">
                开始日期
                <input aria-label="开始日期" className={dateInputClass} onChange={(event) => setFromDraft(event.target.value)} type="date" value={fromDraft} />
              </label>
              <label className="grid gap-1 text-xs font-bold text-ink/55">
                结束日期
                <input aria-label="结束日期" className={dateInputClass} onChange={(event) => setToDraft(event.target.value)} type="date" value={toDraft} />
              </label>
              <Button aria-label="应用评价日期" onClick={applyDates} size="sm" variant="secondary">应用日期</Button>
              {dateError ? <p className="text-sm font-bold text-coral" role="alert">{dateError}</p> : null}
            </div>
          </section>

          {loadStatus === "loading" ? (
            <section aria-live="polite" className="rounded-lg border border-line bg-white px-5 py-12 text-center shadow-panel">
              <p className="text-sm font-black text-ink/55">正在读取正式评价...</p>
            </section>
          ) : null}

          {loadStatus === "error" ? (
            <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-10 text-center shadow-panel" role="alert">
              <h2 className="font-black text-ink">正式评价读取失败</h2>
              <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
              <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>重试</Button>
            </section>
          ) : null}

          {loadStatus === "success" && rows.length === 0 ? (
            <section className="rounded-lg border border-dashed border-line bg-white px-5 py-12 text-center shadow-panel">
              <p className="text-sm font-black text-ink/55">当前筛选条件下没有正式评价</p>
            </section>
          ) : null}

          {loadStatus === "success" && rows.length > 0 ? (
            <>
              <DataTable<OperationsReview>
                columns={[
                  { key: "createdAt", title: "评价时间", width: "170px", render: (row) => formatDate(row.createdAt) },
                  { key: "reviewer", title: "评价人", render: (row) => <div><strong className="block text-ink">{row.reviewer.displayName}</strong><span className="text-xs text-ink/45">{row.reviewer.needoId}</span></div> },
                  { key: "customer", title: "客户", render: (row) => <div><strong className="block text-ink">{row.customer.displayName}</strong><span className="text-xs text-ink/45">{row.customer.needoId}</span></div> },
                  { key: "order", title: "订单 / 服务", width: "250px", render: (row) => <div><strong className="block text-ink">{row.order.serviceName}</strong><span className="text-xs text-ink/45">{row.order.orderNo}</span></div> },
                  { key: "shop", title: "店铺", render: (row) => row.shop.name },
                  { key: "technician", title: "技师", render: (row) => row.technician?.displayName ?? "—" },
                  { key: "rating", title: "评分", render: (row) => `${row.rating.toFixed(1)} / 5` },
                  { key: "status", title: "状态", render: (row) => <div className="flex flex-col items-start gap-1"><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge><span className="text-xs text-ink/45">{targetLabel(row.targetType)}</span></div> }
                ]}
                frozenDetailLabel="详情"
                onView={(row) => void openReview(row)}
                pageSize={pageSize}
                paginationMode="server"
                rows={rows}
                showFooter={false}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                <span className="text-sm font-bold text-ink/55">服务器共 {total} 条，第 {page} / {totalPages} 页</span>
                <div className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" variant="secondary">上一页</Button>
                  <Button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} size="sm" variant="secondary">下一页</Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </ModuleShell>

      <Drawer onClose={closeReview} open={Boolean(selectedReview)} title="正式评价详情" widthStorageKey="needo.admin.reviews.drawer.width">
        {detailStatus === "loading" ? <p className="rounded-lg border border-line bg-white p-5 text-sm font-bold text-ink/55">正在读取正式评价详情...</p> : null}
        {detailStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 p-5" role="alert">
            <h3 className="font-black text-ink">正式评价详情读取失败</h3>
            <p className="mt-2 text-sm font-bold text-ink/55">{detailError}</p>
            {selectedReview ? <Button className="mt-4" onClick={() => void openReview(selectedReview)}>重试</Button> : null}
          </section>
        ) : null}
        {selectedReview && detailStatus === "success" ? (
          <div className="space-y-5">
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-moss">评价 #{selectedReview.reviewId}</p>
                  <h3 className="mt-1 text-xl font-black text-ink">{selectedReview.rating.toFixed(1)} / 5</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canAmend && selectedReview.status !== "system" ? (
                    <ReviewAmendmentDialog
                      onSaved={refreshReviewAfterAmendment}
                      review={selectedReview}
                    />
                  ) : null}
                  <Badge tone={statusTone(selectedReview.status)}>{statusLabel(selectedReview.status)}</Badge>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-ink/75">{selectedReview.comment ?? "无文字评价"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedReview.tags.length ? selectedReview.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-xs font-bold text-ink/40">无评价标签</span>}
              </div>
            </section>

            <section className="rounded-xl border border-line bg-paper p-5">
              <h3 className="font-black text-ink">关联正式记录</h3>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  ["评价对象", targetLabel(selectedReview.targetType)],
                  ["评价时间", formatDate(selectedReview.createdAt)],
                  ["订单", `${selectedReview.order.orderNo} · ${selectedReview.order.serviceName}`],
                  ["服务时间", formatDate(selectedReview.order.startsAt)],
                  ["评价人", `${selectedReview.reviewer.displayName} · ${selectedReview.reviewer.needoId}`],
                  ["客户", `${selectedReview.customer.displayName} · ${selectedReview.customer.needoId}`],
                  ["店铺", `${selectedReview.shop.name} · ${displayValue(selectedReview.shop.publicId ?? selectedReview.shop.id)}`],
                  ["技师", selectedReview.technician ? `${selectedReview.technician.displayName} · ${selectedReview.technician.publicId}` : "—"],
                  ["支付", `${selectedReview.order.paymentMethod} · ${selectedReview.order.paymentStatus}`],
                  ["时长", selectedReview.order.durationMinutes === null ? "—" : `${selectedReview.order.durationMinutes} 分钟`]
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-bold text-ink/45">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-black text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-black text-ink">不可变修订历史</h3>
                <Badge tone="neutral">当前版本 {selectedReview.amendmentVersion}</Badge>
              </div>
              {selectedReview.amendmentHistory.length === 0 ? (
                <p className="mt-4 text-sm font-bold text-ink/50">尚无修订记录，当前显示原始正式评价</p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {[...selectedReview.amendmentHistory].sort((left, right) => right.version - left.version).map((amendment) => (
                    <li className="rounded-lg border border-line bg-paper p-4" key={amendment.version}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-ink">版本 {amendment.version}</strong>
                        <span className="text-xs font-bold text-ink/45">{formatDate(amendment.revisedAt)}</span>
                      </div>
                      <p className="mt-2 text-sm font-black text-ink">修订原因：{amendment.reason}</p>
                      <p className="mt-1 text-xs font-bold text-ink/50">操作人：{amendment.revisedBy}</p>
                      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink/70">{amendment.comment ?? "文字评价未变更"}</p>
                      <p className="mt-2 text-xs font-bold text-ink/50">评分：{amendment.rating === null ? "未变更" : `${amendment.rating.toFixed(1)} / 5`} · 标签：{amendment.tags.length ? amendment.tags.join("、") : "无"}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
