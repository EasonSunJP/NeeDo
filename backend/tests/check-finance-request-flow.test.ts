import {
  parseFinanceRequestFlowArgs,
  runFinanceRequestFlow,
  type FinanceRequestFlowApi,
  type FinanceRequestFlowDatabase
} from "../scripts/check-finance-request-flow";

const baseAccounts = {
  customer: {
    email: "customer@example.com",
    token: "customer-token",
    userId: 5
  },
  merchant: {
    email: "merchant@example.com",
    token: "merchant-token",
    userId: 6
  },
  operator: {
    email: "operator@example.com",
    token: "operator-token",
    userId: 7
  }
};
const testPassword = "request-flow-test-password";

type MutableFinanceRequestFlowDatabase = jest.Mocked<FinanceRequestFlowDatabase> & {
  setUserWallet: (userId: number, wallet: { availableBalance: number; frozenBalance: number }) => void;
};

const createApi = (database: MutableFinanceRequestFlowDatabase): jest.Mocked<FinanceRequestFlowApi> => {
  const details = new Map<number, unknown>([
    [
      101,
      {
        id: 101,
        orderType: "request",
        cRequestFeeHoldNdp: 500,
        cRequestFeeActualNdp: 0,
        requestFeeNdpRevenue: 0,
        moneyTimeline: [{ type: "request_fee_hold" }]
      }
    ],
    [
      102,
      {
        id: 102,
        orderType: "request",
        cRequestFeeHoldNdp: 500,
        cRequestFeeActualNdp: 0,
        requestFeeNdpRevenue: 0,
        moneyTimeline: [{ type: "request_fee_hold" }]
      }
    ]
  ]);

  return {
    login: jest.fn(async (email: string, _password: string) => {
      void _password;
      const account = Object.values(baseAccounts).find((item) => item.email === email);

      if (!account) {
        throw new Error(`Unexpected login ${email}`);
      }

      return account.token;
    }),
    getMe: jest.fn(async (token: string) => {
      const account = Object.values(baseAccounts).find((item) => item.token === token);

      if (!account) {
        throw new Error(`Unexpected token ${token}`);
      }

      return { id: account.userId };
    }),
    createRequestBooking: jest.fn(async (_token, input) => ({
      id: input.scheduleSlotId === 11 ? 101 : 102,
      orderType: input.orderType,
      status: "pending"
    })),
    confirmOrder: jest.fn(async (_token, id) => {
      database.setUserWallet(5, {
        availableBalance: id === 101 ? 500 : 0,
        frozenBalance: 500
      });
      return { id, status: "confirmed" };
    }),
    completeOrder: jest.fn(async (_token, id) => {
      database.setUserWallet(5, { availableBalance: 500, frozenBalance: 0 });
      details.set(id, {
        id,
        orderType: "request",
        cRequestFeeHoldNdp: 500,
        cRequestFeeActualNdp: 500,
        requestFeeNdpRevenue: 500,
        moneyTimeline: [{ type: "request_fee_captured" }]
      });
      return { id, status: "completed" };
    }),
    cancelOrder: jest.fn(async (_token, id, _reason) => {
      void _reason;
      database.setUserWallet(5, { availableBalance: 500, frozenBalance: 0 });
      details.set(id, {
        id,
        orderType: "request",
        cRequestFeeHoldNdp: 500,
        cRequestFeeActualNdp: 0,
        requestFeeNdpRevenue: 0,
        releasedNdp: 500,
        moneyTimeline: [{ type: "request_fee_hold" }]
      });
      return { id, status: "cancelled" };
    }),
    getMerchantOrderFinance: jest.fn(async (_token, id) => details.get(id) as never),
    getBackofficeOrderFinance: jest.fn(async (_token, id) => details.get(id) as never)
  };
};

const createDatabase = (): MutableFinanceRequestFlowDatabase => {
  const wallets = new Map<number, { availableBalance: number; frozenBalance: number }>([
    [5, { availableBalance: 1000, frozenBalance: 0 }]
  ]);

  return {
    findAvailableSeedSlots: jest.fn(async () => [
      { id: 11, serviceId: 21, startsAt: "2026-05-26T01:00:00.000Z" },
      { id: 12, serviceId: 21, startsAt: "2026-05-26T02:30:00.000Z" }
    ]),
    getUserWallet: jest.fn(async (userId) => wallets.get(userId) ?? null),
    setUserWallet: (userId: number, wallet: { availableBalance: number; frozenBalance: number }) => {
      wallets.set(userId, wallet);
    }
  } as MutableFinanceRequestFlowDatabase;
};

describe("check-finance-request-flow", () => {
  it("parses base-url and env-file arguments without leaking secrets", () => {
    expect(
      parseFinanceRequestFlowArgs([
        "--base-url",
        "http://127.0.0.1:3000/api/v1/",
        "--env-file",
        ".env.dev"
      ])
    ).toEqual({
      baseUrl: "http://127.0.0.1:3000/api/v1",
      envFile: ".env.dev"
    });
  });

  it("runs complete and cancellation Request dispatch-fee smoke flows", async () => {
    const database = createDatabase();
    const api = createApi(database);
    const logs: string[] = [];

    const result = await runFinanceRequestFlow({
      api,
      database,
      log: (line: string) => logs.push(line),
      password: testPassword
    });

    expect(result).toEqual({
      completedOrderId: 101,
      cancelledOrderId: 102
    });
    expect(api.login).toHaveBeenCalledWith("customer@example.com", testPassword);
    expect(api.login).toHaveBeenCalledWith("merchant@example.com", testPassword);
    expect(api.login).toHaveBeenCalledWith("operator@example.com", testPassword);
    expect(api.createRequestBooking).toHaveBeenNthCalledWith(
      1,
      "customer-token",
      expect.objectContaining({ orderType: "request", scheduleSlotId: 11, serviceId: 21 })
    );
    expect(api.createRequestBooking).toHaveBeenNthCalledWith(
      2,
      "customer-token",
      expect.objectContaining({ orderType: "request", scheduleSlotId: 12, serviceId: 21 })
    );
    expect(logs.join("\n")).toContain("completed request order 101");
    expect(logs.join("\n")).toContain("cancelled request order 102");
  });

  it("stops before creating orders when the customer wallet cannot cover both smoke flows", async () => {
    const database = createDatabase();
    const api = createApi(database);
    database.setUserWallet(5, { availableBalance: 500, frozenBalance: 0 });

    await expect(
      runFinanceRequestFlow({
        api,
        database,
        log: jest.fn(),
        password: testPassword
      })
    ).rejects.toThrow("customer wallet must have at least 1000 available NDP");
    expect(api.createRequestBooking).not.toHaveBeenCalled();
  });
});
