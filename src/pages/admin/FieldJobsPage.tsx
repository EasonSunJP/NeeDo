import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fieldJobApi,
  fieldJobStatuses,
  type FieldJobDetail,
  type FieldJobListQuery,
  type FieldJobStatus,
  type FieldJobSummary,
} from "../../api/fieldJobs";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import "../../features/field-jobs/registerI18n";

const pageSize = 20;
const inputClassName =
  "h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss";

const statusCopy: Record<FieldJobStatus, string> = {
  pending: "待确认",
  confirmed: "已确认",
  inService: "服务中",
  awaitingCheckout: "待结算",
  awaitingPaymentConfirmation: "待确认收款",
  completed: "已完成",
  cancelled: "已取消",
};

const statusTone: Record<FieldJobStatus, BadgeTone> = {
  pending: "yellow",
  confirmed: "blue",
  inService: "green",
  awaitingCheckout: "yellow",
  awaitingPaymentConfirmation: "yellow",
  completed: "green",
  cancelled: "red",
};

const credentialCopy: Record<FieldJobSummary["credential"]["state"], string> = {
  not_issued: "未签发",
  issued: "已签发",
  verified: "已核验",
};

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("ja-JP") : "—";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "上门工单读取失败";

export function FieldJobsPage() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<FieldJobStatus | "">("");
  const [assignment, setAssignment] = useState<"" | "assigned" | "unassigned">(
    "",
  );
  const [query, setQuery] = useState<FieldJobListQuery>({ page: 1, pageSize });
  const [page, setPage] = useState({
    list: [] as FieldJobSummary[],
    total: 0,
    page: 1,
    page_size: pageSize,
  });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<FieldJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setListError("");
    void fieldJobApi
      .list(query)
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((error: unknown) => {
        if (active) setListError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, revision]);

  const loadDetail = useCallback((id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    void fieldJobApi
      .get(id)
      .then(setDetail)
      .catch((error: unknown) => {
        setDetailError(errorMessage(error));
      })
      .finally(() => setDetailLoading(false));
  }, []);

  const applyFilters = () =>
    setQuery({
      page: 1,
      pageSize,
      keyword: keyword.trim() || undefined,
      status: status || undefined,
      assignment: assignment || undefined,
    });

  const totalPages = Math.max(1, Math.ceil(page.total / page.page_size));
  const exceptionCount = useMemo(
    () =>
      detail
        ? (detail.exceptions.activeSosCount ?? 0) +
          detail.exceptions.activeRefundCaseCount +
          detail.exceptions.openDisputeCount +
          Number(detail.exceptions.hasPerformanceIssue)
        : 0,
    [detail],
  );

  return (
    <AdminLayout>
      <ModuleShell
        title="上门工单中心"
        description="从正式 BookingOrder 中投影上门履约订单；本页只读，派工、状态流转、支付和异常处置继续由已有正式模块完成。"
        actions={<Badge tone="green">正式数据</Badge>}
      >
        <section className="mb-4 rounded-lg border border-line bg-paper p-4 shadow-panel">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
            <input
              aria-label="搜索上门工单"
              className={inputClassName}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="订单号、服务、门店或技师"
              value={keyword}
            />
            <select
              aria-label="工单状态"
              className={inputClassName}
              onChange={(event) =>
                setStatus(event.target.value as FieldJobStatus | "")
              }
              value={status}
            >
              <option value="">全部状态</option>
              {fieldJobStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusCopy[value]}
                </option>
              ))}
            </select>
            <select
              aria-label="技师分配"
              className={inputClassName}
              onChange={(event) =>
                setAssignment(event.target.value as typeof assignment)
              }
              value={assignment}
            >
              <option value="">全部分配状态</option>
              <option value="assigned">已分配</option>
              <option value="unassigned">待分配</option>
            </select>
            <Button onClick={applyFilters}>查询</Button>
          </div>
        </section>

        {loading ? (
          <section
            className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel"
            aria-live="polite"
          >
            <p className="text-sm font-black text-ink">正在读取正式上门工单</p>
          </section>
        ) : null}
        {!loading && listError ? (
          <section
            className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel"
            role="alert"
          >
            <p className="text-sm font-black text-coral">{listError}</p>
            <Button
              className="mt-4"
              onClick={() => setRevision((value) => value + 1)}
            >
              重新加载
            </Button>
          </section>
        ) : null}
        {!loading && !listError && page.list.length === 0 ? (
          <section className="rounded-lg border border-dashed border-line bg-white px-5 py-10 text-center">
            <p className="text-sm font-black text-ink/55">
              当前没有符合条件的正式上门工单
            </p>
          </section>
        ) : null}
        {!loading && !listError && page.list.length > 0 ? (
          <>
            <DataTable<FieldJobSummary>
              columns={[
                {
                  key: "orderNo",
                  title: "订单编号",
                  render: (row) => row.orderNo,
                },
                {
                  key: "service",
                  title: "服务",
                  render: (row) => row.serviceName,
                },
                { key: "shop", title: "门店", render: (row) => row.shop.name },
                {
                  key: "technician",
                  title: "技师",
                  render: (row) => row.technician.name ?? "待分配",
                },
                {
                  key: "appointment",
                  title: "预约时间",
                  render: (row) => formatDateTime(row.startsAt),
                },
                {
                  key: "region",
                  title: "履约区域",
                  render: (row) => row.location.regionLabel,
                },
                {
                  key: "credential",
                  title: "服务凭证",
                  render: (row) => credentialCopy[row.credential.state],
                },
                {
                  key: "status",
                  title: "状态",
                  render: (row) => (
                    <Badge tone={statusTone[row.status]}>
                      {statusCopy[row.status]}
                    </Badge>
                  ),
                },
                {
                  key: "detail",
                  title: "详情",
                  render: (row) => (
                    <Button
                      onClick={() => loadDetail(row.id)}
                      size="sm"
                      variant="secondary"
                    >
                      查看
                    </Button>
                  ),
                },
              ]}
              paginationMode="server"
              rows={page.list}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
              <span className="text-sm font-bold text-ink/55">
                服务器共 {page.total} 条，第 {page.page} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page.page <= 1}
                  onClick={() =>
                    setQuery((value) => ({ ...value, page: page.page - 1 }))
                  }
                  size="sm"
                  variant="secondary"
                >
                  上一页
                </Button>
                <Button
                  disabled={page.page >= totalPages}
                  onClick={() =>
                    setQuery((value) => ({ ...value, page: page.page + 1 }))
                  }
                  size="sm"
                  variant="secondary"
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </ModuleShell>

      <Drawer
        open={selectedId !== null}
        title="正式上门工单详情"
        onClose={() => {
          setSelectedId(null);
          setDetail(null);
          setDetailError("");
        }}
      >
        {detailLoading ? (
          <p className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm font-black text-ink/55">
            正在读取最新工单详情
          </p>
        ) : null}
        {detailError ? (
          <p
            className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-5 text-sm font-black text-coral"
            role="alert"
          >
            {detailError}
          </p>
        ) : null}
        {detail ? (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "订单编号", value: detail.orderNo },
                { label: "用户 ID", value: detail.customerPublicId },
                { label: "服务", value: detail.serviceName },
                { label: "门店", value: detail.shop.name },
                { label: "技师", value: detail.technician.name ?? "待分配" },
                { label: "状态", value: statusCopy[detail.status] },
                {
                  label: "服务凭证",
                  value: credentialCopy[detail.credential.state],
                },
                { label: "支付状态", value: detail.evidence.paymentStatus },
                {
                  label: "开始证据",
                  value: formatDateTime(detail.evidence.startedAt),
                },
                {
                  label: "结束证据",
                  value: formatDateTime(detail.evidence.endedAt),
                },
                {
                  label: "收据确认",
                  value: formatDateTime(detail.evidence.receiptConfirmedAt),
                },
                { label: "异常计数", value: exceptionCount },
              ]}
            />

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="text-sm font-black text-ink">履约地址</h3>
              <p className="mt-2 text-sm font-bold text-ink/65">
                {detail.location.regionLabel}
              </p>
              {detail.location.lines ? (
                detail.location.lines.map((line) => (
                  <p className="mt-1 text-sm font-bold text-ink" key={line}>
                    {line}
                  </p>
                ))
              ) : (
                <p className="mt-2 text-xs font-bold text-ink/45">
                  当前权限仅允许查看行政区域。
                </p>
              )}
            </section>

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="text-sm font-black text-ink">状态时间线</h3>
              {detail.timeline.length ? (
                <ol className="mt-3 space-y-3">
                  {detail.timeline.map((event) => (
                    <li className="rounded-lg bg-paper p-3" key={event.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-black text-ink">
                          {event.fromStatus
                            ? statusCopy[event.fromStatus]
                            : "创建"}{" "}
                          → {statusCopy[event.toStatus]}
                        </span>
                        <time className="text-xs font-bold text-ink/45">
                          {formatDateTime(event.createdAt)}
                        </time>
                      </div>
                      {event.reason ? (
                        <p className="mt-2 text-sm font-bold text-ink/60">
                          {event.reason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm font-bold text-ink/50">
                  暂无状态记录
                </p>
              )}
            </section>

            <div className="flex flex-wrap gap-2">
              <Button
                to={`/admin/orders?orderId=${detail.id}`}
                variant="secondary"
              >
                前往正式订单中心
              </Button>
              {detail.technician.profileId ? (
                <Button
                  to={`/admin/technicians?detailTechnicianId=${detail.technician.profileId}`}
                  variant="secondary"
                >
                  查看正式技师
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
