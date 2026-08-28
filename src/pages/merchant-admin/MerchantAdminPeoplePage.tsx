import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeCustomerDetailPayload,
  type BackofficeCustomerPayload,
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { FormalCustomerDetailPanel } from "../../components/admin/FormalProfileDetailPanels";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { EmployeeDetailCard } from "../../components/merchant-admin/EmployeeDetailCard";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { loadCoreReadWithTransientRetry } from "../../features/core-read/transientRetry";
import {
  merchantEmployeeApi,
  type EmployeeRelationshipType,
  type EmployeeWorkStatus,
  type MerchantEmployee,
  type MerchantEmployeeAffiliationUpdate,
  type MerchantEmployeeProfileUpdate,
} from "../../features/merchant-admin/employeeApi";
import { describeMerchantReadError } from "../../features/merchant-admin/merchantReadError";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import {
  createFormalDetailRequestCoordinator,
  hasFormalDetailRefreshFailure,
  runFormalDetailMutationSequence,
} from "../admin/formalDetailRequest";

type PeopleModule = "staff" | "customers" | "reviews";
type EmployeeSavingSection = "profile" | "affiliation" | null;

const pageSize = 20;

function normalizeModule(value: string | null): PeopleModule {
  return value === "customers" || value === "reviews" ? value : "staff";
}

function relationshipLabel(value: EmployeeRelationshipType) {
  return value === "exclusive" ? "专属技师" : "合作技师";
}

function workStatusLabel(value: EmployeeWorkStatus) {
  if (value === "active") return "在职";
  if (value === "on_leave") return "休假";
  if (value === "suspended") return "停职";
  return "已离职";
}

function workStatusTone(value: EmployeeWorkStatus): BadgeTone {
  if (value === "active") return "green";
  if (value === "on_leave") return "yellow";
  return "red";
}

function describeDetailError(
  error: unknown,
  language: Language,
  fallback: string,
) {
  if (error instanceof ApiClientError) {
    return describeMerchantReadError(error, language);
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return message.trim() || translateText(fallback, language);
}

function describeEmployeeMutationError(error: unknown, language: Language) {
  let message = "员工资料保存失败，请检查后重试";

  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      message = "登录状态已失效，请重新登录";
    } else if (error.status === 403) {
      message = "当前身份没有维护本店员工资料的权限";
    } else if (error.status === 404) {
      message = "该员工已不属于当前店铺，请刷新列表";
    } else if (
      error.status === 409 ||
      error.message === "error.technician_affiliation.exclusive_conflict"
    ) {
      message = "该员工与其他店铺的专属从属关系冲突";
    } else if (error.status >= 500) {
      message = "员工资料服务暂时不可用，请稍后重试";
    }
  }

  return translateText(message, language);
}

export function MerchantAdminPeoplePage() {
  const [searchParams] = useSearchParams();
  const { language } = useOptionalI18n();
  const languageRef = useRef(language);
  languageRef.current = language;
  const module = normalizeModule(searchParams.get("module"));
  const [employees, setEmployees] = useState<MerchantEmployee[]>([]);
  const [customers, setCustomers] = useState<BackofficeCustomerPayload[]>([]);
  const [selectedEmployeeNeedoId, setSelectedEmployeeNeedoId] = useState<
    string | null
  >(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );
  const [employeeDetail, setEmployeeDetail] = useState<MerchantEmployee | null>(
    null,
  );
  const [customerDetail, setCustomerDetail] =
    useState<BackofficeCustomerDetailPayload | null>(null);
  const [employeeDetailLoading, setEmployeeDetailLoading] = useState(false);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [employeeDetailError, setEmployeeDetailError] = useState("");
  const [customerDetailError, setCustomerDetailError] = useState("");
  const [employeeMutationError, setEmployeeMutationError] = useState("");
  const [employeeSaving, setEmployeeSaving] =
    useState<EmployeeSavingSection>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (rejectOnError = false) => {
      if (module === "reviews") {
        setEmployees([]);
        setCustomers([]);
        setTotal(0);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");
      try {
        const query = { page, pageSize, keyword: keyword || undefined };
        if (module === "staff") {
          const result = await loadCoreReadWithTransientRetry(() =>
            merchantEmployeeApi.list(query),
          );
          setEmployees(result.list);
          setCustomers([]);
          setTotal(result.total);
        } else {
          const result = await loadCoreReadWithTransientRetry(() =>
            backofficeRealDataApi.customers("merchant-admin", query),
          );
          setCustomers(result.list);
          setEmployees([]);
          setTotal(result.total);
        }
      } catch (loadError) {
        setError(describeMerchantReadError(loadError, languageRef.current));
        if (rejectOnError) throw loadError;
      } finally {
        setLoading(false);
      }
    },
    [keyword, module, page],
  );

  const employeeDetailRequest = useMemo(
    () =>
      createFormalDetailRequestCoordinator<MerchantEmployee, string>({
        onError: (detailError) => {
          setEmployeeDetailError(
            describeDetailError(
              detailError,
              languageRef.current,
              "员工详细信息卡读取失败",
            ),
          );
        },
        onFinally: () => setEmployeeDetailLoading(false),
        onStart: () => {
          setEmployeeDetail(null);
          setEmployeeDetailLoading(true);
          setEmployeeDetailError("");
          setEmployeeMutationError("");
        },
        onSuccess: setEmployeeDetail,
        request: (needoId) => merchantEmployeeApi.detail(needoId),
      }),
    [],
  );

  const customerDetailRequest = useMemo(
    () =>
      createFormalDetailRequestCoordinator<BackofficeCustomerDetailPayload>({
        onError: (detailError) => {
          setCustomerDetailError(
            describeDetailError(
              detailError,
              languageRef.current,
              "客户正式详情读取失败",
            ),
          );
        },
        onFinally: () => setCustomerDetailLoading(false),
        onStart: () => {
          setCustomerDetail(null);
          setCustomerDetailLoading(true);
          setCustomerDetailError("");
        },
        onSuccess: setCustomerDetail,
        request: (customerId) =>
          backofficeRealDataApi.customer("merchant-admin", customerId),
      }),
    [],
  );

  useEffect(() => {
    employeeDetailRequest.activate();
    customerDetailRequest.activate();
    return () => {
      employeeDetailRequest.dispose();
      customerDetailRequest.dispose();
    };
  }, [customerDetailRequest, employeeDetailRequest]);

  const closeEmployee = useCallback(() => {
    employeeDetailRequest.invalidate();
    setSelectedEmployeeNeedoId(null);
    setEmployeeDetail(null);
    setEmployeeDetailLoading(false);
    setEmployeeDetailError("");
    setEmployeeMutationError("");
    setEmployeeSaving(null);
  }, [employeeDetailRequest]);

  const closeCustomer = useCallback(() => {
    customerDetailRequest.invalidate();
    setSelectedCustomerId(null);
    setCustomerDetail(null);
    setCustomerDetailLoading(false);
    setCustomerDetailError("");
  }, [customerDetailRequest]);

  useEffect(() => {
    setPage(1);
    closeEmployee();
    closeCustomer();
  }, [closeCustomer, closeEmployee, module]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  const openEmployee = (employee: MerchantEmployee) => {
    closeCustomer();
    setSelectedEmployeeNeedoId(employee.needoId);
    setEmployeeMutationError("");
    void employeeDetailRequest.load(employee.needoId);
  };

  const openCustomer = (customer: BackofficeCustomerPayload) => {
    closeEmployee();
    setSelectedCustomerId(customer.id);
    void customerDetailRequest.load(customer.id);
  };

  const runEmployeeMutation = async (
    needoId: string,
    section: Exclude<EmployeeSavingSection, null>,
    mutation: () => Promise<MerchantEmployee>,
  ) => {
    if (section === "profile") setEmployeeSaving("profile");
    if (section === "affiliation") setEmployeeSaving("affiliation");
    setEmployeeMutationError("");

    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () =>
          employeeDetailRequest.getSelectedId() === needoId,
        mutate: mutation,
        refreshDetail: () => employeeDetailRequest.loadOrThrow(needoId),
        refreshList: () => load(true),
      });
      if (hasFormalDetailRefreshFailure(result)) {
        setEmployeeMutationError(
          translateText("资料已保存，但刷新失败，请重试", language),
        );
      }
    } catch (mutationError) {
      setEmployeeMutationError(
        describeEmployeeMutationError(mutationError, language),
      );
      throw mutationError;
    } finally {
      setEmployeeSaving(null);
    }
  };

  const saveEmployeeProfile = (
    input: MerchantEmployeeProfileUpdate,
  ): Promise<void> => {
    if (!selectedEmployeeNeedoId) return Promise.resolve();
    const needoId = selectedEmployeeNeedoId;
    return runEmployeeMutation(needoId, "profile", () =>
      merchantEmployeeApi.updateProfile(needoId, input),
    );
  };

  const saveEmployeeAffiliation = (
    input: MerchantEmployeeAffiliationUpdate,
  ): Promise<void> => {
    if (!selectedEmployeeNeedoId) return Promise.resolve();
    const needoId = selectedEmployeeNeedoId;
    return runEmployeeMutation(needoId, "affiliation", () =>
      merchantEmployeeApi.updateAffiliation(needoId, input),
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const description =
    module === "staff"
      ? "按当前活动店铺读取员工与店铺的正式从属关系，并维护员工基础资料。"
      : module === "customers"
        ? "只读取与当前店铺存在真实预约关系的客户档案。"
        : "Review 数据表、回复与审核 API 完成前不展示模拟评价。";

  return (
    <MerchantAdminLayout>
      <ModuleShell
        actions={
          module !== "reviews" ? (
            <Button onClick={() => void load()} variant="secondary">
              刷新正式数据
            </Button>
          ) : undefined
        }
        description={description}
        title={
          module === "staff"
            ? "员工列表"
            : module === "customers"
              ? "用户管理"
              : "评价中心"
        }
      >
        {module !== "reviews" ? (
          <form
            className="mb-4 flex gap-2 rounded-lg border border-line bg-white p-2 shadow-panel"
            onSubmit={submitSearch}
          >
            <input
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-bold outline-none"
              maxLength={100}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="按姓名、NeeDoID、城市、邮箱或手机号码搜索"
              value={keywordInput}
            />
            <Button size="sm" type="submit" variant="dark">
              搜索
            </Button>
          </form>
        ) : null}

        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <span>{error}</span>
            <Button onClick={() => void load()} size="sm" variant="secondary">
              重新加载本店人员数据
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">
            正在读取当前店铺正式人员数据...
          </p>
        ) : null}

        {!loading && !error && module === "staff" ? (
          employees.length ? (
            <DataTable<MerchantEmployee>
              columns={[
                {
                  key: "name",
                  title: "员工",
                  render: (row) => row.displayName,
                },
                {
                  key: "needoId",
                  title: "NeeDoID",
                  render: (row) => (
                    <span className="font-mono text-xs font-black">
                      {row.needoId}
                    </span>
                  ),
                },
                {
                  key: "relationship",
                  title: "技师分类",
                  render: (row) => (
                    <Badge tone="blue">
                      {translateText(
                        relationshipLabel(row.affiliation.relationshipType),
                        language,
                      )}
                    </Badge>
                  ),
                },
                {
                  key: "workStatus",
                  title: "工作状态",
                  render: (row) => (
                    <Badge tone={workStatusTone(row.affiliation.workStatus)}>
                      {translateText(
                        workStatusLabel(row.affiliation.workStatus),
                        language,
                      )}
                    </Badge>
                  ),
                },
                {
                  key: "contact",
                  title: "联系方式",
                  render: (row) => (
                    <div className="max-w-[230px]">
                      <p className="truncate text-sm font-bold">{row.email}</p>
                      <p className="truncate text-xs text-ink/45">
                        {row.phone || translateText("未填写", language)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "verification",
                  title: "档案验证",
                  render: (row) => (
                    <Badge
                      tone={
                        row.verifiedAt || row.profileStatus === "verified"
                          ? "green"
                          : "yellow"
                      }
                    >
                      {translateText(
                        row.verifiedAt || row.profileStatus === "verified"
                          ? "已验证"
                          : "未验证",
                        language,
                      )}
                    </Badge>
                  ),
                },
              ]}
              footerPlacement="inline"
              onView={openEmployee}
              pageSize={pageSize}
              rows={employees}
              showFooterActions={false}
            />
          ) : (
            <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">
              本店当前没有符合条件的员工
            </p>
          )
        ) : null}

        {!loading && !error && module === "customers" ? (
          customers.length ? (
            <DataTable<BackofficeCustomerPayload>
              columns={[
                {
                  key: "name",
                  title: "客户",
                  render: (row) => row.displayName,
                },
                {
                  key: "email",
                  title: "邮箱",
                  render: (row) => row.email,
                },
                {
                  key: "city",
                  title: "城市",
                  render: (row) => row.city ?? "未设置",
                },
                {
                  key: "membership",
                  title: "会员等级",
                  render: (row) => row.membershipLevel,
                },
                {
                  key: "bookings",
                  title: "预约数",
                  render: (row) => row.bookingCount,
                },
                {
                  key: "visibility",
                  title: "公开资料",
                  render: (row) => (
                    <Badge tone={row.isPublic ? "green" : "neutral"}>
                      {row.isPublic ? "公开" : "不公开"}
                    </Badge>
                  ),
                },
              ]}
              footerPlacement="inline"
              onView={openCustomer}
              pageSize={pageSize}
              rows={customers}
              showFooterActions={false}
            />
          ) : (
            <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">
              本店当前没有符合条件的正式客户
            </p>
          )
        ) : null}

        {!loading && !error && module !== "reviews" && total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 text-sm font-bold shadow-panel">
            <span>
              共 {total} 条 · 第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                size="sm"
                variant="secondary"
              >
                上一页
              </Button>
              <Button
                disabled={page >= totalPages || loading}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                size="sm"
                variant="secondary"
              >
                下一页
              </Button>
            </div>
          </div>
        ) : null}

        {module === "reviews" ? (
          <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
            <Badge tone="yellow">未启用</Badge>
            <h2 className="mt-4 text-xl font-black text-ink">
              正式评价功能尚未启用
            </h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/55">
              当前不会展示模拟评价、评分或回复操作。上线前需要 Review 表与
              migration、店铺范围分页 API、回复权限和风险审计。
            </p>
          </section>
        ) : null}

        <Drawer
          defaultWidth={860}
          maxWidth={1080}
          onClose={closeEmployee}
          open={selectedEmployeeNeedoId !== null}
          title={translateText("员工详细信息卡", language)}
          widthStorageKey="needo.ui.drawer.employee-detail-card.width"
        >
          {employeeDetailLoading ? (
            <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">
              {translateText("正在读取员工详细信息卡...", language)}
            </p>
          ) : null}
          {!employeeDetailLoading && employeeDetailError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <span>{employeeDetailError}</span>
              <Button
                onClick={() => void employeeDetailRequest.retry()}
                size="sm"
                variant="secondary"
              >
                {translateText("重试", language)}
              </Button>
            </div>
          ) : null}
          {!employeeDetailLoading && !employeeDetailError && employeeDetail ? (
            <EmployeeDetailCard
              employee={employeeDetail}
              error={employeeMutationError}
              onSaveAffiliation={saveEmployeeAffiliation}
              onSaveProfile={saveEmployeeProfile}
              saving={employeeSaving}
            />
          ) : null}
        </Drawer>

        <Drawer
          onClose={closeCustomer}
          open={selectedCustomerId !== null}
          title="客户正式档案"
        >
          {customerDetailLoading ? (
            <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">
              {translateText("正在读取客户正式详情...", language)}
            </p>
          ) : null}
          {!customerDetailLoading && customerDetailError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <span>{customerDetailError}</span>
              <Button
                onClick={() => void customerDetailRequest.retry()}
                size="sm"
                variant="secondary"
              >
                {translateText("重试", language)}
              </Button>
            </div>
          ) : null}
          {!customerDetailLoading && !customerDetailError && customerDetail ? (
            <FormalCustomerDetailPanel detail={customerDetail} />
          ) : null}
        </Drawer>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
