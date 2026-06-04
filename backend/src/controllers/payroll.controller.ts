import type { NextFunction, Request, Response } from "express";
import type { PayrollCsvExportPayload, PayrollService } from "../services/payroll.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  payrollAdjustmentBodySchema,
  payrollAdjustmentIdParamSchema,
  payrollAdjustmentListQuerySchema,
  payrollAdjustmentRejectBodySchema,
  payRunCreateBodySchema,
  payRunIdParamSchema,
  payrollListQuerySchema,
  payoutRecordConfirmParamSchema,
  payoutRecordBodySchema,
  payslipDisputeBodySchema,
  payslipDisputeResolveBodySchema,
  payslipIdParamSchema
} from "../validators/payroll.validator";

export class PayrollController {
  public constructor(private readonly service: PayrollService) {}

  public listMerchantPayRuns = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listMerchantPayRuns(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payrollListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createMerchantPayRun = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.generateMerchantPayRun(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payRunCreateBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public exportMerchantPayRuns = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.sendCsvExport(
        response,
        await this.service.exportMerchantPayRuns(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          payrollListQuerySchema.parse(request.query)
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public getMerchantPayRun = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payRunIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getMerchantPayRun(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public recalculateMerchantPayRun = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payRunIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.recalculateMerchantPayRun(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public publishMerchantPayRun = this.payRunAction((service, actor, context, id) =>
    service.publishMerchantPayRun(actor, context, id)
  );

  public approveMerchantPayRun = this.payRunAction((service, actor, context, id) =>
    service.approveMerchantPayRun(actor, context, id)
  );

  public lockMerchantPayRun = this.payRunAction((service, actor, context, id) =>
    service.lockMerchantPayRun(actor, context, id)
  );

  public recordMerchantPayout = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payslipIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.recordMerchantPayout(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id,
              payoutRecordBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public resolveMerchantPayslipDispute = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payslipIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.resolveMerchantPayslipDispute(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id,
              payslipDisputeResolveBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listTechnicianPayslips = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listTechnicianPayslips(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payrollListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public exportTechnicianPayslips = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.sendCsvExport(
        response,
        await this.service.exportTechnicianPayslips(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          payrollListQuerySchema.parse(request.query)
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public getTechnicianPayslip = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payslipIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getTechnicianPayslip(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public confirmTechnicianPayslip = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payslipIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.confirmTechnicianPayslip(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public disputeTechnicianPayslip = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payslipIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.disputeTechnicianPayslip(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id,
              payslipDisputeBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public confirmTechnicianPayoutRecord = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { payslipId, payoutRecordId } = payoutRecordConfirmParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.confirmTechnicianPayoutRecord(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payslipId,
              payoutRecordId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listBackofficePayRuns = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listBackofficePayRuns(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payrollListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public exportBackofficePayRuns = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.sendCsvExport(
        response,
        await this.service.exportBackofficePayRuns(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          payrollListQuerySchema.parse(request.query)
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public listMerchantPayrollAdjustments = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listMerchantPayrollAdjustments(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payrollAdjustmentListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createMerchantPayrollAdjustment = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.createMerchantPayrollAdjustment(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              payrollAdjustmentBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public submitMerchantPayrollAdjustment = this.payrollAdjustmentAction(
    (service, actor, context, id) => service.submitMerchantPayrollAdjustment(actor, context, id)
  );

  public approveMerchantPayrollAdjustment = this.payrollAdjustmentAction(
    (service, actor, context, id) => service.approveMerchantPayrollAdjustment(actor, context, id)
  );

  public rejectMerchantPayrollAdjustment = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = payrollAdjustmentIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.rejectMerchantPayrollAdjustment(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              id,
              payrollAdjustmentRejectBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private sendCsvExport(response: Response, payload: PayrollCsvExportPayload): void {
    const filename = payload.filename.replace(/["\r\n]/g, "_");

    response
      .status(200)
      .setHeader("Content-Type", payload.contentType)
      .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      .send(payload.csv);
  }

  private payRunAction(
    handler: (
      service: PayrollService,
      actor: ReturnType<typeof getAuthenticatedAccess>,
      context: ReturnType<typeof getRequestContext>,
      id: number
    ) => Promise<unknown>
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = payRunIdParamSchema.parse(request.params);
        response
          .status(200)
          .json(
            successResponse(
              await handler(
                this.service,
                getAuthenticatedAccess(response),
                getRequestContext(request),
                id
              )
            )
          );
      } catch (error) {
        next(error);
      }
    };
  }

  private payrollAdjustmentAction(
    handler: (
      service: PayrollService,
      actor: ReturnType<typeof getAuthenticatedAccess>,
      context: ReturnType<typeof getRequestContext>,
      id: number
    ) => Promise<unknown>
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = payrollAdjustmentIdParamSchema.parse(request.params);
        response
          .status(200)
          .json(
            successResponse(
              await handler(
                this.service,
                getAuthenticatedAccess(response),
                getRequestContext(request),
                id
              )
            )
          );
      } catch (error) {
        next(error);
      }
    };
  }
}
