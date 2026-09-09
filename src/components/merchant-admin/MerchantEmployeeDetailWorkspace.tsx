import { useCallback, useEffect, useRef, useState } from "react";
import {
  employeeCompensationApi,
  type CompensationProfilePreviewInput,
  type EmployeeCompensationPreviewResult,
  type EmployeeCompensationResult,
  type TechnicianCompensationProfileInput,
} from "../../api/employeeCompensation";
import {
  payrollSchedulePolicyApi,
  type EmployeePayrollSchedulePolicyInput,
  type PayrollSchedulePolicyResult,
} from "../../api/payrollSchedulePolicy";
import type { FormalTimelinePageSize } from "../admin/FormalTimelinePagination";
import {
  merchantEmployeeApi,
  type MerchantEmployee,
  type MerchantEmployeeAffiliationUpdate,
  type MerchantEmployeeProfileUpdate,
  type PaginatedEmployeeTimeline,
} from "../../features/merchant-admin/employeeApi";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { EmployeeDetailCard } from "./EmployeeDetailCard";

type EmployeeSavingSection = "profile" | "affiliation" | null;

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function MerchantEmployeeDetailWorkspace({
  needoId,
  onEmployeeChange,
}: {
  needoId: string;
  onEmployeeChange?: (employee: MerchantEmployee | null) => void;
}) {
  const { language } = useOptionalI18n();
  const generationRef = useRef(0);
  const [employee, setEmployee] = useState<MerchantEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState<EmployeeSavingSection>(null);
  const [compensation, setCompensation] = useState<EmployeeCompensationResult | null>(null);
  const [compensationPreview, setCompensationPreview] = useState<EmployeeCompensationPreviewResult | null>(null);
  const [compensationLoading, setCompensationLoading] = useState(true);
  const [compensationSaving, setCompensationSaving] = useState(false);
  const [compensationPreviewing, setCompensationPreviewing] = useState(false);
  const [compensationError, setCompensationError] = useState("");
  const [payrollPolicy, setPayrollPolicy] = useState<PayrollSchedulePolicyResult | null>(null);
  const [payrollPolicyLoading, setPayrollPolicyLoading] = useState(true);
  const [payrollPolicySaving, setPayrollPolicySaving] = useState(false);
  const [payrollPolicyError, setPayrollPolicyError] = useState("");
  const [timeline, setTimeline] = useState<PaginatedEmployeeTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState("");
  const [timelinePageSize, setTimelinePageSize] = useState<FormalTimelinePageSize>(10);

  const loadDetail = useCallback(async () => {
    const generation = generationRef.current;
    setLoading(true);
    setDetailError("");
    try {
      const result = await merchantEmployeeApi.detail(needoId);
      if (generation === generationRef.current) {
        setEmployee(result);
        onEmployeeChange?.(result);
      }
    } catch (error) {
      if (generation === generationRef.current) {
        setEmployee(null);
        onEmployeeChange?.(null);
        setDetailError(errorMessage(error, translateText("员工详细信息卡读取失败", language)));
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [language, needoId, onEmployeeChange]);

  const loadCompensation = useCallback(async () => {
    const generation = generationRef.current;
    setCompensationLoading(true);
    setCompensationError("");
    try {
      const result = await employeeCompensationApi.get(needoId);
      if (generation === generationRef.current) setCompensation(result);
    } catch (error) {
      if (generation === generationRef.current) {
        setCompensation(null);
        setCompensationError(errorMessage(error, translateText("员工薪酬与工资统计读取失败", language)));
      }
    } finally {
      if (generation === generationRef.current) setCompensationLoading(false);
    }
  }, [language, needoId]);

  const loadPayrollPolicy = useCallback(async () => {
    const generation = generationRef.current;
    setPayrollPolicyLoading(true);
    setPayrollPolicyError("");
    try {
      const result = await payrollSchedulePolicyApi.getEmployee(needoId);
      if (generation === generationRef.current) setPayrollPolicy(result);
    } catch (error) {
      if (generation === generationRef.current) {
        setPayrollPolicy(null);
        setPayrollPolicyError(errorMessage(error, translateText("工资结算周期读取失败", language)));
      }
    } finally {
      if (generation === generationRef.current) setPayrollPolicyLoading(false);
    }
  }, [language, needoId]);

  const loadTimeline = useCallback(async (page: number, pageSize: FormalTimelinePageSize) => {
    const generation = generationRef.current;
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const result = await merchantEmployeeApi.timeline(needoId, page, pageSize);
      if (generation === generationRef.current) setTimeline(result);
    } catch (error) {
      if (generation === generationRef.current) {
        setTimeline(null);
        setTimelineError(errorMessage(error, translateText("员工动态读取失败，请重试", language)));
      }
    } finally {
      if (generation === generationRef.current) setTimelineLoading(false);
    }
  }, [language, needoId]);

  useEffect(() => {
    generationRef.current += 1;
    setEmployee(null);
    onEmployeeChange?.(null);
    setMutationError("");
    setCompensation(null);
    setCompensationPreview(null);
    setPayrollPolicy(null);
    setTimeline(null);
    void loadDetail();
    void loadCompensation();
    void loadPayrollPolicy();
    void loadTimeline(1, 10);
    return () => {
      generationRef.current += 1;
    };
  }, [loadCompensation, loadDetail, loadPayrollPolicy, loadTimeline, onEmployeeChange]);

  const saveProfile = async (input: MerchantEmployeeProfileUpdate) => {
    setSaving("profile");
    setMutationError("");
    try {
      const updated = await merchantEmployeeApi.updateProfile(needoId, input);
      setEmployee(updated);
      onEmployeeChange?.(updated);
    } catch (error) {
      setMutationError(errorMessage(error, translateText("员工资料保存失败，请检查后重试", language)));
      throw error;
    } finally {
      setSaving(null);
    }
  };

  const saveAffiliation = async (input: MerchantEmployeeAffiliationUpdate) => {
    setSaving("affiliation");
    setMutationError("");
    try {
      const updated = await merchantEmployeeApi.updateAffiliation(needoId, input);
      setEmployee(updated);
      onEmployeeChange?.(updated);
    } catch (error) {
      setMutationError(errorMessage(error, translateText("员工资料保存失败，请检查后重试", language)));
      throw error;
    } finally {
      setSaving(null);
    }
  };

  const saveCompensation = async (input: TechnicianCompensationProfileInput) => {
    setCompensationSaving(true);
    setCompensationError("");
    try {
      setCompensation(await employeeCompensationApi.update(needoId, input));
      setCompensationPreview(null);
    } catch (error) {
      setCompensationError(errorMessage(error, translateText("员工薪酬规则保存失败，请重试", language)));
      throw error;
    } finally {
      setCompensationSaving(false);
    }
  };

  const previewCompensation = async (input: CompensationProfilePreviewInput) => {
    setCompensationPreviewing(true);
    setCompensationError("");
    try {
      setCompensationPreview(await employeeCompensationApi.preview(needoId, input));
    } catch (error) {
      setCompensationError(errorMessage(error, translateText("员工薪酬预估失败，请重试", language)));
      throw error;
    } finally {
      setCompensationPreviewing(false);
    }
  };

  const savePayrollPolicy = async (input: EmployeePayrollSchedulePolicyInput) => {
    setPayrollPolicySaving(true);
    setPayrollPolicyError("");
    try {
      setPayrollPolicy(await payrollSchedulePolicyApi.updateEmployee(needoId, input));
    } catch (error) {
      setPayrollPolicyError(errorMessage(error, translateText("工资结算周期保存失败，请重试", language)));
      throw error;
    } finally {
      setPayrollPolicySaving(false);
    }
  };

  const submitTimelineComment = async (message: string) => {
    setTimelineError("");
    try {
      await merchantEmployeeApi.addTimelineComment(needoId, message);
      await loadTimeline(1, timelinePageSize);
    } catch (error) {
      setTimelineError(errorMessage(error, translateText("员工动态备注保存失败，请重试", language)));
      throw error;
    }
  };

  if (loading) {
    return <p className="rounded-[24px] border border-line bg-white p-6 text-sm font-bold text-ink/50" role="status">{translateText("正在读取员工详细信息卡...", language)}</p>;
  }

  if (!employee) {
    return <p className="rounded-[24px] border border-coral/35 bg-coral/10 p-6 text-sm font-bold text-[#9b3f35]" role="alert">{detailError || translateText("员工不存在", language)}</p>;
  }

  return (
    <EmployeeDetailCard
      compensation={compensation}
      compensationError={compensationError}
      compensationLoading={compensationLoading}
      compensationPreview={compensationPreview}
      compensationPreviewing={compensationPreviewing}
      compensationSaving={compensationSaving}
      employee={employee}
      error={mutationError}
      onPreviewCompensation={previewCompensation}
      onRetryCompensation={() => void loadCompensation()}
      onRetryPayrollPolicy={() => void loadPayrollPolicy()}
      onRetryTimeline={() => void loadTimeline(timeline?.page ?? 1, timelinePageSize)}
      onSaveAffiliation={saveAffiliation}
      onSaveCompensation={saveCompensation}
      onSavePayrollPolicy={savePayrollPolicy}
      onSaveProfile={saveProfile}
      onSubmitTimelineComment={submitTimelineComment}
      onTimelinePageChange={(page) => void loadTimeline(page, timelinePageSize)}
      onTimelinePageSizeChange={(pageSize) => {
        setTimelinePageSize(pageSize);
        void loadTimeline(1, pageSize);
      }}
      payrollPolicy={payrollPolicy}
      payrollPolicyError={payrollPolicyError}
      payrollPolicyLoading={payrollPolicyLoading}
      payrollPolicySaving={payrollPolicySaving}
      saving={saving}
      timeline={timeline}
      timelineError={timelineError}
      timelineLoading={timelineLoading}
    />
  );
}
