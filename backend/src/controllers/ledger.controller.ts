import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { LedgerService } from "../services/ledger.service";
import type { BackofficePreferenceService } from "../services/backoffice-preference.service";
import { successResponse } from "../utils/api-response";
import {
  createWalletAdjustmentRequestBodySchema,
  financeReconciliationListQuerySchema,
  ledgerTransactionListQuerySchema,
  reviewWalletAdjustmentRequestBodySchema,
  walletAdjustmentIdParamSchema,
  walletAdjustmentListQuerySchema,
  walletAdjustmentMineQuerySchema,
  walletIdParamSchema,
  walletLedgerQuerySchema,
  testNdpManualCreditBodySchema,
  backofficeWalletTopupRequestBodySchema
} from "../validators/ledger.validator";

export class LedgerController {
  public constructor(
    private readonly ledgerService: LedgerService,
    private readonly backofficePreferenceService?: Pick<BackofficePreferenceService, "getEffective">
  ) {}

  public getMyWallet = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.ledgerService.getMyWallet(this.getActor(response))));
    } catch (error) {
      next(error);
    }
  };

  public getMyWalletSummary = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(await this.ledgerService.getMyWalletSummary(this.getActor(response)))
        );
    } catch (error) {
      next(error);
    }
  };

  public createWalletAdjustmentRequest = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(201)
        .json(
          successResponse(
            await this.ledgerService.createWalletAdjustmentRequest(
              this.getActor(response),
              createWalletAdjustmentRequestBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public creditTestNdp = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.ledgerService.creditTestNdp(
        this.getActor(response),
        testNdpManualCreditBodySchema.parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };

  public createBackofficeWalletTopupRequest = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(201).json(successResponse(
        await this.ledgerService.createBackofficeWalletTopupRequest(
          this.getActor(response),
          backofficeWalletTopupRequestBodySchema.parse(request.body)
        )
      ));
    } catch (error) {
      next(error);
    }
  };

  public listMyWalletAdjustmentRequests = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.ledgerService.listMyWalletAdjustmentRequests(
              this.getActor(response),
              walletAdjustmentMineQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listWalletAdjustmentRequests = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.ledgerService.listWalletAdjustmentRequests(
              this.getActor(response),
              walletAdjustmentListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public reviewWalletAdjustmentRequest = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.ledgerService.reviewWalletAdjustmentRequest(
              this.getActor(response),
              walletAdjustmentIdParamSchema.parse(request.params).id,
              reviewWalletAdjustmentRequestBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listWalletLedger = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const actor = this.getActor(response);
      const showTestNdpData = (await this.backofficePreferenceService?.getEffective(actor.userId))?.showTestNdpData ?? true;
      response.status(200).json(
        successResponse(
          await this.ledgerService.listWalletLedger(actor, {
            walletId: walletIdParamSchema.parse(request.params).id,
            ...walletLedgerQuerySchema.parse(request.query)
          }, showTestNdpData)
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public listLedgerTransactions = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.ledgerService.listLedgerTransactions({
              ...ledgerTransactionListQuerySchema.parse(request.query),
              ...((await this.backofficePreferenceService?.getEffective(this.getActor(response).userId))?.showTestNdpData === false
                ? { currency: "NDP" as const }
                : {})
            })
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listFinanceReconciliation = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.ledgerService.listFinanceReconciliation(
              financeReconciliationListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public exportFinanceReconciliation = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.ledgerService.exportFinanceReconciliation(
              financeReconciliationListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private getActor(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }
}
