import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeCustomerDetailPayload,
  type BackofficeCustomerPayload,
  type BackofficeCustomerTimelinePayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { FormalCustomerDetailPanel } from "../../components/admin/FormalProfileDetailPanels";
import type { FormalTimelinePageSize } from "../../components/admin/FormalTimelinePagination";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import { loadCoreReadWithTransientRetry } from "../../features/core-read/transientRetry";
import {
  createFormalDetailRequestCoordinator,
  hasFormalDetailRefreshFailure,
  runFormalDetailMutationSequence
} from "./formalDetailRequest";
import { UserManagementWorkspace } from "./UserManagementWorkspace";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

const toLocalDateTimeInput = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

function describeBackofficeReadError(error: unknown, language: Language) {
  let message = "用户正式资料加载失败，请稍后重试";

  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      message = "登录状态已失效，请重新登录";
    } else if (error.status === 403) {
      message = "当前身份没有查看用户资料的权限";
    } else if (error.status === 408 || error.message === "error.network.timeout") {
      message = "网络响应超时，请稍后重试。";
    } else if (error.status >= 500) {
      message = "用户资料服务暂时不可用，请稍后重试";
    }
  } else if (error instanceof Error && error.message === "error.network.timeout") {
    message = "网络响应超时，请稍后重试。";
  }

  return translateText(message, language);
}

function CustomerProfilesWorkspace() {
  const { language } = useOptionalI18n();
  const languageRef = useRef(language);
  languageRef.current = language;
  const [customers, setCustomers] = useState<BackofficeCustomerPayload[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerDetail, setCustomerDetail] = useState<BackofficeCustomerDetailPayload | null>(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [customerDetailError, setCustomerDetailError] = useState("");
  const [draft, setDraft] = useState({ displayName: "", city: "", isPublic: true });
  const [membershipDraft, setMembershipDraft] = useState<{
    membershipLevel: string;
    durationUnit: "forever" | "day" | "month";
    durationValue: string;
    startsAt: string;
  }>({ membershipLevel: "standard", durationUnit: "forever", durationValue: "", startsAt: "" });
  const [customerTimeline, setCustomerTimeline] = useState<BackofficeCustomerTimelinePayload | null>(null);
  const [customerTimelineLoading, setCustomerTimelineLoading] = useState(false);
  const [customerTimelineError, setCustomerTimelineError] = useState("");
  const [customerTimelinePage, setCustomerTimelinePage] = useState(1);
  const [customerTimelinePageSize, setCustomerTimelinePageSize] = useState<FormalTimelinePageSize>(10);
  const customerTimelinePageSizeRef = useRef<FormalTimelinePageSize>(10);
  const customerTimelineGenerationRef = useRef(0);
  const selectedCustomerIdRef = useRef<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (rejectOnError = false) => {
    setLoading(true);
    setError("");
    try {
      const query = { keyword: keyword || undefined, page: 1, pageSize: 100 };
      const page = await loadCoreReadWithTransientRetry(
        () => backofficeRealDataApi.customers("backoffice", query)
      );
      setCustomers(page.list);
    } catch (loadError) {
      setError(describeBackofficeReadError(loadError, languageRef.current));
      if (rejectOnError) throw loadError;
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const loadCustomerTimeline = useCallback(
    async (customerId: number, nextPage: number, nextPageSize: FormalTimelinePageSize) => {
      const generation = ++customerTimelineGenerationRef.current;
      setCustomerTimelineLoading(true);
      setCustomerTimelineError("");
      try {
        const timeline = await backofficeRealDataApi.customerTimeline(
          "backoffice",
          customerId,
          nextPage,
          nextPageSize
        );
        if (
          generation === customerTimelineGenerationRef.current &&
          selectedCustomerIdRef.current === customerId
        ) {
          setCustomerTimeline(timeline);
          setCustomerTimelinePage(timeline.page);
        }
      } catch (timelineError) {
        if (
          generation === customerTimelineGenerationRef.current &&
          selectedCustomerIdRef.current === customerId
        ) {
          setCustomerTimelineError(describeBackofficeReadError(timelineError, languageRef.current));
        }
      } finally {
        if (
          generation === customerTimelineGenerationRef.current &&
          selectedCustomerIdRef.current === customerId
        ) {
          setCustomerTimelineLoading(false);
        }
      }
    },
    []
  );

  const customerDetailRequest = useMemo(() => createFormalDetailRequestCoordinator<BackofficeCustomerDetailPayload>({
    onError: (detailError) => {
      const message = detailError instanceof Error ? detailError.message : typeof detailError === "string" ? detailError : "";
      setCustomerDetailError(message.trim() || translateText("客户正式详情读取失败", languageRef.current));
    },
    onFinally: () => setCustomerDetailLoading(false),
    onStart: () => {
      setCustomerDetail(null);
      setCustomerDetailLoading(true);
      setCustomerDetailError("");
    },
    onSuccess: (detail) => {
      setCustomerDetail(detail);
      setDraft({
        displayName: detail.displayName,
        city: detail.city ?? "",
        isPublic: detail.isPublic
      });
      setMembershipDraft({
        membershipLevel: detail.membershipLevel,
        durationUnit: detail.membershipDurationUnit ?? "forever",
        durationValue: detail.membershipDurationValue?.toString() ?? "",
        startsAt: toLocalDateTimeInput(detail.membershipStartsAt ?? new Date())
      });
      setCustomerTimelinePage(1);
      void loadCustomerTimeline(detail.id, 1, customerTimelinePageSizeRef.current);
    },
    request: (customerId) => backofficeRealDataApi.customer("backoffice", customerId)
  }), [loadCustomerTimeline]);

  useEffect(() => {
    customerDetailRequest.activate();
    return () => customerDetailRequest.dispose();
  }, [customerDetailRequest]);

  const closeCustomer = useCallback(() => {
    customerDetailRequest.invalidate();
    customerTimelineGenerationRef.current += 1;
    selectedCustomerIdRef.current = null;
    setSelectedCustomerId(null);
    setCustomerDetail(null);
    setCustomerDetailLoading(false);
    setCustomerDetailError("");
    setCustomerTimeline(null);
    setCustomerTimelineLoading(false);
    setCustomerTimelineError("");
    setCustomerTimelinePage(1);
  }, [customerDetailRequest]);

  useEffect(() => { void load(); }, [load]);

  const openCustomer = (customer: BackofficeCustomerPayload) => {
    selectedCustomerIdRef.current = customer.id;
    setSelectedCustomerId(customer.id);
    setDraft({ displayName: "", city: "", isPublic: true });
    setMembershipDraft({
      membershipLevel: customer.membershipLevel,
      durationUnit: "forever",
      durationValue: "",
      startsAt: toLocalDateTimeInput(new Date())
    });
    void customerDetailRequest.load(customer.id);
  };

  const changeCustomerTimelinePage = (nextPage: number) => {
    if (!selectedCustomerId) return;
    setCustomerTimelinePage(nextPage);
    void loadCustomerTimeline(selectedCustomerId, nextPage, customerTimelinePageSize);
  };

  const changeCustomerTimelinePageSize = (nextPageSize: FormalTimelinePageSize) => {
    if (!selectedCustomerId) return;
    setCustomerTimelinePage(1);
    setCustomerTimelinePageSize(nextPageSize);
    customerTimelinePageSizeRef.current = nextPageSize;
    void loadCustomerTimeline(selectedCustomerId, 1, nextPageSize);
  };

  const mutate = async (customerId: number, action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () => customerDetailRequest.getSelectedId() === customerId,
        mutate: action,
        refreshDetail: () => customerDetailRequest.loadOrThrow(customerId),
        refreshList: () => load(true)
      });
      if (hasFormalDetailRefreshFailure(result)) {
        setError(translateText("资料已保存，但刷新失败，请重试", language));
      }
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setSaving(false);
    }
  };

  const assignMembership = async (customerId: number) => {
    const durationValue = membershipDraft.durationUnit === "forever"
      ? null
      : Number(membershipDraft.durationValue);
    if (
      !membershipDraft.membershipLevel.trim() ||
      !membershipDraft.startsAt ||
      (durationValue !== null && (!Number.isInteger(durationValue) || durationValue <= 0 || durationValue > 1200))
    ) {
      setError(translateText("请填写有效的会员等级、期限和生效时间", language));
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () => customerDetailRequest.getSelectedId() === customerId,
        mutate: () => backofficeRealDataApi.assignCustomerMembership(customerId, {
          membershipLevel: membershipDraft.membershipLevel.trim(),
          grantMode: "operator_complimentary",
          durationUnit: membershipDraft.durationUnit,
          durationValue,
          startsAt: new Date(membershipDraft.startsAt).toISOString()
        }),
        refreshDetail: () => customerDetailRequest.loadOrThrow(customerId),
        refreshList: () => load(true)
      });
      if (hasFormalDetailRefreshFailure(result)) {
        setError(translateText("会员等级已保存，但刷新失败，请重试", language));
      }
      if (selectedCustomerIdRef.current === customerId) {
        setCustomerTimelinePage(1);
        void loadCustomerTimeline(customerId, 1, customerTimelinePageSizeRef.current);
      }
    } catch (membershipError) {
      setError(membershipError instanceof Error ? membershipError.message : String(membershipError));
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (customerId: number) => {
    setSaving(true);
    setError("");
    try {
      await backofficeRealDataApi.deleteCustomer(customerId);
      if (customerDetailRequest.getSelectedId() === customerId) {
        closeCustomer();
      }
      await load();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <ModuleShell title="用户资料" description="运营人员查看和维护正式用户档案；账号、角色及权限仍在账号管理中维护。" actions={<Button onClick={() => void load()} variant="secondary">刷新</Button>}>
        <div className="mb-4 flex gap-2 rounded-lg border border-line bg-white p-2 shadow-panel"><input className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-bold outline-none" onChange={(event) => setKeyword(event.target.value)} placeholder="按姓名、城市或邮箱搜索" value={keyword} /><Button onClick={() => void load()} size="sm" variant="dark">搜索</Button></div>
        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <span>{error}</span>
            <Button onClick={() => void load()} size="sm" variant="secondary">{translateText("重试", language)}</Button>
          </div>
        ) : null}
        {loading ? <p className="mb-4 text-sm font-bold text-ink/50">正在读取正式用户资料...</p> : null}
        {!loading && !error ? <DataTable columns={[
          { key: "name", title: "用户", render: (row: BackofficeCustomerPayload) => row.displayName },
          { key: "email", title: "邮箱", render: (row: BackofficeCustomerPayload) => row.email },
          { key: "city", title: "城市", render: (row: BackofficeCustomerPayload) => row.city ?? "未设置" },
          { key: "level", title: "会员等级", render: (row: BackofficeCustomerPayload) => row.membershipLevel },
          { key: "orders", title: "预约数", render: (row: BackofficeCustomerPayload) => row.bookingCount },
          { key: "public", title: "公开资料", render: (row: BackofficeCustomerPayload) => <Badge tone={row.isPublic ? "green" : "neutral"}>{row.isPublic ? "公开" : "不公开"}</Badge> }
        ]} footerPlacement="inline" onView={openCustomer} rows={customers} /> : null}
      </ModuleShell>

      <Drawer onClose={closeCustomer} open={selectedCustomerId !== null} title="用户详细信息">
        {customerDetailLoading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">{translateText("正在读取用户详细信息...", language)}</p> : null}
        {!customerDetailLoading && customerDetailError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{customerDetailError}</span>
            <Button onClick={() => void customerDetailRequest.retry()} size="sm" variant="secondary">{translateText("重试", language)}</Button>
          </div>
        ) : null}
        {!customerDetailLoading && !customerDetailError && customerDetail ? (
          <FormalCustomerDetailPanel
            actionContent={<Button disabled={saving} onClick={() => void deleteCustomer(customerDetail.id)} variant="danger">软删除用户</Button>}
            detail={customerDetail}
            editContent={<div className="space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-black">显示名称</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} value={draft.displayName} /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">城市</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} value={draft.city} /></label>
              <label className="flex items-center gap-3 text-sm font-black"><input checked={draft.isPublic} onChange={(event) => setDraft((current) => ({ ...current, isPublic: event.target.checked }))} type="checkbox" />允许公开用户资料</label>
              <Button disabled={saving} onClick={() => void mutate(customerDetail.id, () => backofficeRealDataApi.updateCustomer(customerDetail.id, { ...draft, city: draft.city || null }))}>保存资料</Button>
            </div>}
            membershipEditContent={<div className="grid gap-4 sm:grid-cols-2" aria-label="运营会员赋予表单">
              <label className="block"><span className="mb-2 block text-sm font-black">会员等级</span><input className={inputClassName} maxLength={50} onChange={(event) => setMembershipDraft((current) => ({ ...current, membershipLevel: event.target.value }))} value={membershipDraft.membershipLevel} /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">免费期限</span><select className={inputClassName} onChange={(event) => setMembershipDraft((current) => ({ ...current, durationUnit: event.target.value as "forever" | "day" | "month", durationValue: event.target.value === "forever" ? "" : current.durationValue }))} value={membershipDraft.durationUnit}><option value="forever">永久免费</option><option value="day">免费几天</option><option value="month">免费几个月</option></select></label>
              {membershipDraft.durationUnit !== "forever" ? <label className="block"><span className="mb-2 block text-sm font-black">{membershipDraft.durationUnit === "day" ? "免费天数" : "免费月数"}</span><input className={inputClassName} inputMode="numeric" max={1200} min={1} onChange={(event) => setMembershipDraft((current) => ({ ...current, durationValue: event.target.value }))} type="number" value={membershipDraft.durationValue} /></label> : null}
              <label className="block"><span className="mb-2 block text-sm font-black">生效时间</span><input className={inputClassName} onChange={(event) => setMembershipDraft((current) => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={membershipDraft.startsAt} /></label>
              <div className="sm:col-span-2"><Button disabled={saving} onClick={() => void assignMembership(customerDetail.id)}>确认免费赋予</Button></div>
            </div>}
            onRetryTimeline={() => void loadCustomerTimeline(customerDetail.id, customerTimelinePage, customerTimelinePageSize)}
            onTimelinePageChange={changeCustomerTimelinePage}
            onTimelinePageSizeChange={changeCustomerTimelinePageSize}
            timeline={customerTimeline}
            timelineError={customerTimelineError}
            timelineLoading={customerTimelineLoading}
          />
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}

export function UsersPage() {
  const [searchParams] = useSearchParams();
  return searchParams.get("view") === "customers" ? <CustomerProfilesWorkspace /> : <UserManagementWorkspace mode="users" />;
}
