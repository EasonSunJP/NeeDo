import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { LedgerController } from "../controllers/ledger.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { LedgerRepository } from "../repositories/ledger.repository";
import { LedgerService } from "../services/ledger.service";
import {
  financeReconciliationListQuerySchema,
  ledgerTransactionListQuerySchema,
  walletIdParamSchema,
  walletLedgerQuerySchema
} from "../validators/ledger.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const LEDGER_ROUTE_PERMISSIONS = {
  walletRead: "wallet:read",
  walletLedgerList: "wallet:ledger:list",
  ledgerList: "finance:ledger:list",
  reconciliationList: "finance:reconciliation:list",
  reconciliationExport: "finance:reconciliation:export"
} as const;

export const createLedgerRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const ledgerService = new LedgerService(dependencies.ledgerRepository ?? new LedgerRepository());
  const controller = new LedgerController(ledgerService);

  router.get(
    "/wallets/me",
    authenticate(),
    authorize(LEDGER_ROUTE_PERMISSIONS.walletRead),
    controller.getMyWallet
  );
  router.get(
    "/wallets/:id/ledger",
    authenticate(),
    authorize(LEDGER_ROUTE_PERMISSIONS.walletLedgerList),
    validateRequest({ params: walletIdParamSchema, query: walletLedgerQuerySchema }),
    controller.listWalletLedger
  );
  router.get(
    "/finance/ledger/transactions",
    authenticate(),
    authorize(LEDGER_ROUTE_PERMISSIONS.ledgerList),
    validateRequest({ query: ledgerTransactionListQuerySchema }),
    controller.listLedgerTransactions
  );
  router.get(
    "/finance/reconciliation",
    authenticate(),
    authorize(LEDGER_ROUTE_PERMISSIONS.reconciliationList),
    validateRequest({ query: financeReconciliationListQuerySchema }),
    controller.listFinanceReconciliation
  );
  router.get(
    "/finance/reconciliation/export",
    authenticate(),
    authorize(LEDGER_ROUTE_PERMISSIONS.reconciliationExport),
    validateRequest({ query: financeReconciliationListQuerySchema }),
    controller.exportFinanceReconciliation
  );

  return router;
};
