import { TestAccountService } from "../src/services/test-account.service";
import type {
  TestAccountClassificationUpdate,
  TestAccountRepositoryPort,
  TestAccountTransactionPort
} from "../src/repositories/test-account.repository";
import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";

const UPDATED_AT = new Date("2026-08-30T01:02:03.000Z");

const createFixture = (overrides?: {
  isTestAccount?: boolean;
  updatedAt?: Date;
  activeFinancialState?: boolean;
}) => {
  const transaction: jest.Mocked<TestAccountTransactionPort> = {
    lockUser: jest.fn(async (userId: number) => {
      void userId;
      return {
        id: 41,
        isTestAccount: overrides?.isTestAccount ?? false,
        updatedAt: overrides?.updatedAt ?? UPDATED_AT
      };
    }),
    hasActiveFinancialState: jest.fn(async (userId: number, currency: "NDP" | "TEST_NDP") => {
      void userId;
      void currency;
      return overrides?.activeFinancialState ?? false;
    }),
    updateClassification: jest.fn(async (input: TestAccountClassificationUpdate) => {
      void input;
      return true;
    }),
    ensureFormalWallet: jest.fn(async (userId: number) => {
      void userId;
    }),
    calibrateTestNdp: jest.fn(async (userId: number) => {
      void userId;
    }),
    createAudit: jest.fn(async (input: AuditLogCreateInput) => {
      void input;
    })
  };
  const repository: TestAccountRepositoryPort = {
    runInTransaction: async <T>(handler: (tx: TestAccountTransactionPort) => Promise<T>) =>
      handler(transaction)
  };
  const payload = { id: 41, isTestAccount: true };
  const users = { get: jest.fn(async () => payload as never) };
  const service = new TestAccountService(repository, users);

  return { transaction, users, service };
};

describe("TestAccountService", () => {
  it("switches a formal account to Test NDP inside the locked transaction", async () => {
    const { transaction, users, service } = createFixture();

    await expect(
      service.updateClassification(
        41,
        { isTestAccount: true, expectedUpdatedAt: UPDATED_AT },
        { userId: 7 } as never,
        { ip: "127.0.0.1", userAgent: "classification-test" }
      )
    ).resolves.toEqual({ id: 41, isTestAccount: true });

    expect(transaction.hasActiveFinancialState).toHaveBeenCalledWith(41, "NDP");
    expect(transaction.updateClassification).toHaveBeenCalledWith({
      userId: 41,
      fromTestAccount: false,
      toTestAccount: true,
      expectedUpdatedAt: UPDATED_AT
    });
    expect(transaction.calibrateTestNdp).toHaveBeenCalledWith(41);
    expect(transaction.ensureFormalWallet).not.toHaveBeenCalled();
    expect(transaction.createAudit).toHaveBeenCalledWith({
      actorId: 7,
      action: "user.test_account.update",
      targetType: "User",
      targetId: 41,
      ip: "127.0.0.1",
      userAgent: "classification-test",
      metadata: {
        fromTestAccount: false,
        toTestAccount: true,
        activeCurrency: "NDP",
        expectedUpdatedAt: UPDATED_AT.toISOString()
      }
    });
    expect(users.get).toHaveBeenCalledWith(41);
  });

  it("preserves the retired Test NDP wallet and prepares a zero formal wallet on exit", async () => {
    const { transaction, service } = createFixture({ isTestAccount: true });

    await service.updateClassification(
      41,
      { isTestAccount: false, expectedUpdatedAt: UPDATED_AT },
      { userId: 7 } as never,
      { ip: "127.0.0.1" }
    );

    expect(transaction.hasActiveFinancialState).toHaveBeenCalledWith(41, "TEST_NDP");
    expect(transaction.ensureFormalWallet).toHaveBeenCalledWith(41);
    expect(transaction.calibrateTestNdp).not.toHaveBeenCalled();
  });

  it("is idempotent when the requested classification already matches", async () => {
    const { transaction, service } = createFixture({ isTestAccount: true });

    await service.updateClassification(
      41,
      { isTestAccount: true, expectedUpdatedAt: new Date(0) },
      { userId: 7 } as never,
      { ip: "127.0.0.1" }
    );

    expect(transaction.hasActiveFinancialState).not.toHaveBeenCalled();
    expect(transaction.updateClassification).not.toHaveBeenCalled();
    expect(transaction.createAudit).not.toHaveBeenCalled();
  });

  it("fails closed on stale state or active financial work", async () => {
    const stale = createFixture();
    await expect(
      stale.service.updateClassification(
        41,
        { isTestAccount: true, expectedUpdatedAt: new Date(0) },
        { userId: 7 } as never,
        { ip: "127.0.0.1" }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.account_classification.stale"
    });
    expect(stale.transaction.updateClassification).not.toHaveBeenCalled();

    const active = createFixture({ activeFinancialState: true });
    await expect(
      active.service.updateClassification(
        41,
        { isTestAccount: true, expectedUpdatedAt: UPDATED_AT },
        { userId: 7 } as never,
        { ip: "127.0.0.1" }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.account_classification.active_financial_state"
    });
    expect(active.transaction.updateClassification).not.toHaveBeenCalled();
  });
});
