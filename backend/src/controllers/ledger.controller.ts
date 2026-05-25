import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { LedgerService } from "../services/ledger.service";
import { successResponse } from "../utils/api-response";
import {
  financeReconciliationListQuerySchema,
  ledgerTransactionListQuerySchema,
  walletIdParamSchema,
  walletLedgerQuerySchema
} from "../validators/ledger.validator";

export class LedgerController {
  public constructor(private readonly ledgerService: LedgerService) {}

  public getMyWallet = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(await this.ledgerService.getMyWallet(this.getActor(response).userId))
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
      response.status(200).json(
        successResponse(
          await this.ledgerService.listWalletLedger({
            walletId: walletIdParamSchema.parse(request.params).id,
            ...walletLedgerQuerySchema.parse(request.query)
          })
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
            await this.ledgerService.listLedgerTransactions(
              ledgerTransactionListQuerySchema.parse(request.query)
            )
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
