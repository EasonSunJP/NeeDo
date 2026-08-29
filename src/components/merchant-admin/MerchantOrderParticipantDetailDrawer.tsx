import { useCallback, useEffect, useRef, useState } from "react";
import {
  backofficeRealDataApi,
  type BackofficeCustomerDetailPayload,
  type BackofficeCustomerTimelinePayload,
  type BackofficeOrderPayload,
} from "../../api/backofficeRealData";
import {
  employeeCompensationApi,
  type EmployeeCompensationResult,
} from "../../api/employeeCompensation";
import {
  payrollSchedulePolicyApi,
  type PayrollSchedulePolicyResult,
} from "../../api/payrollSchedulePolicy";
import { ApiClientError } from "../../api/httpClient";
import { merchantEmployeeApi, type MerchantEmployee, type PaginatedEmployeeTimeline } from "../../features/merchant-admin/employeeApi";
import { describeMerchantReadError } from "../../features/merchant-admin/merchantReadError";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { FormalCustomerDetailPanel } from "../admin/FormalProfileDetailPanels";
import type { FormalTimelinePageSize } from "../admin/FormalTimelinePagination";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { EmployeeDetailCard } from "./EmployeeDetailCard";

export type MerchantOrderParticipant = "customer" | "technician" | null;

function participantError(error: unknown, fallback: string, language: Parameters<typeof translateText>[1]) {
  if (error instanceof ApiClientError) {
    if (error.status === 404) return translateText("该资料不存在或不属于当前店铺", language);
    return describeMerchantReadError(error, language);
  }
  return translateText(fallback, language);
}

export function MerchantOrderParticipantDetailDrawer({
  onClose,
  order,
  participant,
}: {
  onClose: () => void;
  order: BackofficeOrderPayload | null;
  participant: MerchantOrderParticipant;
}) {
  const { language } = useOptionalI18n();
  const [revision, setRevision] = useState(0);
  const [customerDetail, setCustomerDetail] = useState<BackofficeCustomerDetailPayload | null>(null);
  const [customerError, setCustomerError] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerTimeline, setCustomerTimeline] = useState<BackofficeCustomerTimelinePayload | null>(null);
  const [customerTimelineError, setCustomerTimelineError] = useState("");
  const [customerTimelineLoading, setCustomerTimelineLoading] = useState(false);
  const [customerTimelinePage, setCustomerTimelinePage] = useState(1);
  const [customerTimelinePageSize, setCustomerTimelinePageSize] = useState<FormalTimelinePageSize>(10);
  const [employee, setEmployee] = useState<MerchantEmployee | null>(null);
  const [employeeError, setEmployeeError] = useState("");
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [compensation, setCompensation] = useState<EmployeeCompensationResult | null>(null);
  const [compensationError, setCompensationError] = useState("");
  const [compensationLoading, setCompensationLoading] = useState(false);
  const [payrollPolicy, setPayrollPolicy] = useState<PayrollSchedulePolicyResult | null>(null);
  const [payrollError, setPayrollError] = useState("");
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [employeeTimeline, setEmployeeTimeline] = useState<PaginatedEmployeeTimeline | null>(null);
  const [employeeTimelineError, setEmployeeTimelineError] = useState("");
  const [employeeTimelineLoading, setEmployeeTimelineLoading] = useState(false);
  const [employeeTimelinePage, setEmployeeTimelinePage] = useState(1);
  const [employeeTimelinePageSize, setEmployeeTimelinePageSize] = useState<FormalTimelinePageSize>(10);
  const customerGeneration = useRef(0);
  const employeeGeneration = useRef(0);

  const customerProfileId = participant === "customer" ? order?.customerProfileId ?? null : null;
  const technicianNeedoId = participant === "technician" ? order?.technicianNeedoId ?? null : null;
  const open = Boolean(order && participant);

  useEffect(() => {
    setCustomerTimelinePage(1);
    setEmployeeTimelinePage(1);
  }, [customerProfileId, technicianNeedoId]);

  useEffect(() => {
    const generation = ++customerGeneration.current;
    setCustomerDetail(null);
    setCustomerError("");
    if (participant !== "customer" || !order) return;
    if (!customerProfileId) {
      setCustomerError(translateText("该订单没有可查看的用户资料", language));
      return;
    }
    setCustomerLoading(true);
    void backofficeRealDataApi.customer("merchant-admin", customerProfileId)
      .then((detail) => {
        if (generation === customerGeneration.current) setCustomerDetail(detail);
      })
      .catch((error: unknown) => {
        if (generation === customerGeneration.current) {
          setCustomerError(participantError(error, "用户详细信息读取失败", language));
        }
      })
      .finally(() => {
        if (generation === customerGeneration.current) setCustomerLoading(false);
      });
  }, [customerProfileId, language, order, participant, revision]);

  useEffect(() => {
    const generation = ++employeeGeneration.current;
    setEmployee(null);
    setEmployeeError("");
    setCompensation(null);
    setCompensationError("");
    setPayrollPolicy(null);
    setPayrollError("");
    if (participant !== "technician" || !order) return;
    if (!technicianNeedoId) {
      setEmployeeError(translateText("该订单尚未安排可查看的员工", language));
      return;
    }
    setEmployeeLoading(true);
    setCompensationLoading(true);
    setPayrollLoading(true);
    void Promise.allSettled([
      merchantEmployeeApi.detail(technicianNeedoId),
      employeeCompensationApi.get(technicianNeedoId),
      payrollSchedulePolicyApi.getEmployee(technicianNeedoId),
    ]).then(([detailResult, compensationResult, payrollResult]) => {
      if (generation !== employeeGeneration.current) return;
      if (detailResult.status === "fulfilled") setEmployee(detailResult.value);
      else setEmployeeError(participantError(detailResult.reason, "员工详细信息卡读取失败", language));
      if (compensationResult.status === "fulfilled") setCompensation(compensationResult.value);
      else setCompensationError(participantError(compensationResult.reason, "员工薪酬与工资统计读取失败", language));
      if (payrollResult.status === "fulfilled") setPayrollPolicy(payrollResult.value);
      else setPayrollError(participantError(payrollResult.reason, "工资结算周期读取失败", language));
    }).finally(() => {
      if (generation === employeeGeneration.current) {
        setEmployeeLoading(false);
        setCompensationLoading(false);
        setPayrollLoading(false);
      }
    });
  }, [language, order, participant, revision, technicianNeedoId]);

  useEffect(() => {
    let current = true;
    setCustomerTimeline(null);
    setCustomerTimelineError("");
    if (participant !== "customer" || !customerProfileId) return () => { current = false; };
    setCustomerTimelineLoading(true);
    void backofficeRealDataApi.customerTimeline(
      "merchant-admin",
      customerProfileId,
      customerTimelinePage,
      customerTimelinePageSize,
    ).then((timeline) => {
      if (current) setCustomerTimeline(timeline);
    }).catch((error: unknown) => {
      if (current) setCustomerTimelineError(participantError(error, "用户动态读取失败，请重试", language));
    }).finally(() => {
      if (current) setCustomerTimelineLoading(false);
    });
    return () => { current = false; };
  }, [customerProfileId, customerTimelinePage, customerTimelinePageSize, language, participant, revision]);

  useEffect(() => {
    let current = true;
    setEmployeeTimeline(null);
    setEmployeeTimelineError("");
    if (participant !== "technician" || !technicianNeedoId) return () => { current = false; };
    setEmployeeTimelineLoading(true);
    void merchantEmployeeApi.timeline(
      technicianNeedoId,
      employeeTimelinePage,
      employeeTimelinePageSize,
    ).then((timeline) => {
      if (current) setEmployeeTimeline(timeline);
    }).catch((error: unknown) => {
      if (current) setEmployeeTimelineError(participantError(error, "员工动态读取失败，请重试", language));
    }).finally(() => {
      if (current) setEmployeeTimelineLoading(false);
    });
    return () => { current = false; };
  }, [employeeTimelinePage, employeeTimelinePageSize, language, participant, revision, technicianNeedoId]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return (
    <Drawer
      defaultWidth={900}
      layer="overlay"
      maxWidth={1160}
      onClose={onClose}
      open={open}
      title={translateText(participant === "technician" ? "员工详细信息" : "用户详细信息", language)}
      widthStorageKey="needo.ui.drawer.order-participant.width"
    >
      {participant === "customer" ? (
        customerLoading ? (
          <p className="rounded-2xl border border-line bg-paper px-5 py-8 text-center text-sm font-black text-ink/55">{translateText("正在读取用户详细信息...", language)}</p>
        ) : customerError ? (
          <div className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center" role="alert">
            <p className="text-sm font-black text-coral">{customerError}</p>
            <Button className="mt-4" onClick={reload} size="sm" variant="secondary">{translateText("重新加载", language)}</Button>
          </div>
        ) : customerDetail ? (
          <FormalCustomerDetailPanel
            detail={customerDetail}
            onRetryTimeline={reload}
            onTimelinePageChange={setCustomerTimelinePage}
            onTimelinePageSizeChange={(pageSize) => {
              setCustomerTimelinePage(1);
              setCustomerTimelinePageSize(pageSize);
            }}
            timeline={customerTimeline}
            timelineError={customerTimelineError}
            timelineLoading={customerTimelineLoading}
          />
        ) : null
      ) : employeeLoading && !employee ? (
        <p className="rounded-2xl border border-line bg-paper px-5 py-8 text-center text-sm font-black text-ink/55">{translateText("正在读取员工详细信息卡...", language)}</p>
      ) : employeeError && !employee ? (
        <div className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center" role="alert">
          <p className="text-sm font-black text-coral">{employeeError}</p>
          <Button className="mt-4" onClick={reload} size="sm" variant="secondary">{translateText("重新加载", language)}</Button>
        </div>
      ) : employee ? (
        <EmployeeDetailCard
          compensation={compensation}
          compensationError={compensationError}
          compensationLoading={compensationLoading}
          compensationPreview={null}
          compensationPreviewing={false}
          compensationSaving={false}
          employee={employee}
          error={employeeError}
          onPreviewCompensation={async () => undefined}
          onRetryCompensation={reload}
          onRetryPayrollPolicy={reload}
          onRetryTimeline={reload}
          onSaveAffiliation={async () => undefined}
          onSaveCompensation={async () => undefined}
          onSavePayrollPolicy={async () => undefined}
          onSaveProfile={async () => undefined}
          onSubmitTimelineComment={async () => undefined}
          onTimelinePageChange={setEmployeeTimelinePage}
          onTimelinePageSizeChange={(pageSize) => {
            setEmployeeTimelinePage(1);
            setEmployeeTimelinePageSize(pageSize);
          }}
          payrollPolicy={payrollPolicy}
          payrollPolicyError={payrollError}
          payrollPolicyLoading={payrollLoading}
          payrollPolicySaving={false}
          readOnly
          saving={null}
          timeline={employeeTimeline}
          timelineError={employeeTimelineError}
          timelineLoading={employeeTimelineLoading}
        />
      ) : null}
    </Drawer>
  );
}
