import { httpClient } from "./httpClient";
import type {
  PayrollCsvExportPayload,
  PayrollListPayload,
  PayslipPayload
} from "./merchantPayrollCenter";

export const technicianPayrollCenterApi = {
  listPayslips(params = "") {
    return httpClient.request<PayrollListPayload<PayslipPayload>>(`/technician/payslips${params}`);
  },
  exportPayslips(params = "") {
    return httpClient.request<PayrollCsvExportPayload>(`/technician/payslips/export${params}`);
  },
  getPayslip(id: number) {
    return httpClient.request<PayslipPayload>(`/technician/payslips/${id}`);
  },
  confirmPayslip(id: number) {
    return httpClient.request<PayslipPayload>(`/technician/payslips/${id}/confirm`, {
      method: "POST"
    });
  },
  disputePayslip(id: number, reason: string) {
    return httpClient.request<PayslipPayload>(`/technician/payslips/${id}/dispute`, {
      method: "POST",
      body: { reason }
    });
  },
  confirmPayoutRecord(payslipId: number, payoutRecordId: number) {
    return httpClient.request<PayslipPayload>(
      `/technician/payslips/${payslipId}/payout-records/${payoutRecordId}/confirm`,
      {
        method: "POST"
      }
    );
  }
};
