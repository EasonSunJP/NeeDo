import { config as loadDotenv } from "dotenv";
import { existsSync } from "fs";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../src/config/env";

const REQUEST_FEE_NDP = 500;
const CUSTOMER_EMAIL = "customer@example.com";
const MERCHANT_EMAIL = "merchant@example.com";
const OPERATOR_EMAIL = "operator@example.com";

export interface FinanceRequestFlowCliOptions {
  baseUrl: string;
  envFile: string;
}

export interface FinanceRequestFlowAccount {
  id: number;
}

export interface FinanceRequestFlowBookingInput {
  orderType: "request";
  scheduleSlotId: number;
  serviceId: number;
  fulfillmentMode: "store";
  note: string;
}

export interface FinanceRequestFlowOrder {
  id: number;
  orderType?: string;
  status?: string;
}

export interface FinanceRequestFlowWallet {
  availableBalance: number;
  frozenBalance: number;
}

export interface FinanceRequestFlowSlot {
  id: number;
  serviceId: number;
  startsAt: string;
}

export interface FinanceRequestFlowTimelineEvent {
  type?: string;
}

export interface FinanceRequestFlowOrderFinance {
  orderType?: string;
  cRequestFeeHoldNdp?: number;
  cRequestFeeActualNdp?: number;
  requestFeeNdpRevenue?: number;
  releasedNdp?: number;
  moneyTimeline?: FinanceRequestFlowTimelineEvent[];
}

export interface FinanceRequestFlowApi {
  login(email: string, password: string): Promise<string>;
  getMe(token: string): Promise<FinanceRequestFlowAccount>;
  createRequestBooking(
    token: string,
    input: FinanceRequestFlowBookingInput
  ): Promise<FinanceRequestFlowOrder>;
  confirmOrder(token: string, id: number): Promise<FinanceRequestFlowOrder>;
  completeOrder(token: string, id: number): Promise<FinanceRequestFlowOrder>;
  cancelOrder(token: string, id: number, reason: string): Promise<FinanceRequestFlowOrder>;
  getMerchantOrderFinance(token: string, id: number): Promise<FinanceRequestFlowOrderFinance>;
  getBackofficeOrderFinance(token: string, id: number): Promise<FinanceRequestFlowOrderFinance>;
}

export interface FinanceRequestFlowDatabase {
  findAvailableSeedSlots(): Promise<FinanceRequestFlowSlot[]>;
  getUserWallet(userId: number): Promise<FinanceRequestFlowWallet | null>;
}

export interface RunFinanceRequestFlowInput {
  api: FinanceRequestFlowApi;
  database: FinanceRequestFlowDatabase;
  log?: (line: string) => void;
  password: string;
}

export interface RunFinanceRequestFlowResult {
  completedOrderId: number;
  cancelledOrderId: number;
}

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type LoginPayload = {
  accessToken?: string;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const joinUrl = (baseUrl: string, path: string): string =>
  `${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;

const assertEqual = (actual: number | string | undefined, expected: number | string, label: string): void => {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${String(actual)}`);
  }
};

const assertTimelineIncludes = (
  detail: FinanceRequestFlowOrderFinance,
  eventType: string
): void => {
  if (!detail.moneyTimeline?.some((event) => event.type === eventType)) {
    throw new Error(`money timeline must include ${eventType}`);
  }
};

const assertWallet = (
  wallet: FinanceRequestFlowWallet | null,
  expected: FinanceRequestFlowWallet,
  label: string
): FinanceRequestFlowWallet => {
  if (!wallet) {
    throw new Error(`${label} wallet was not found`);
  }
  assertEqual(wallet.availableBalance, expected.availableBalance, `${label} available NDP`);
  assertEqual(wallet.frozenBalance, expected.frozenBalance, `${label} frozen NDP`);

  return wallet;
};

export const parseFinanceRequestFlowArgs = (args: string[]): FinanceRequestFlowCliOptions => {
  const options: FinanceRequestFlowCliOptions = {
    baseUrl: trimTrailingSlash(process.env.API_BASE_URL || "http://127.0.0.1:3000/api/v1"),
    envFile: process.env.ENV_FILE || ".env.dev"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--base-url") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--base-url requires a value");
      }
      options.baseUrl = trimTrailingSlash(value);
      index += 1;
    } else if (arg === "--env-file") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--env-file requires a value");
      }
      options.envFile = value;
      index += 1;
    }
  }

  return options;
};

export const runFinanceRequestFlow = async (
  input: RunFinanceRequestFlowInput
): Promise<RunFinanceRequestFlowResult> => {
  const log = input.log ?? console.log;
  const customerToken = await input.api.login(CUSTOMER_EMAIL, input.password);
  const merchantToken = await input.api.login(MERCHANT_EMAIL, input.password);
  const operatorToken = await input.api.login(OPERATOR_EMAIL, input.password);
  const customer = await input.api.getMe(customerToken);
  const initialWallet = await input.database.getUserWallet(customer.id);

  if (!initialWallet) {
    throw new Error("customer wallet was not found; run seed");
  }
  if (initialWallet.availableBalance < REQUEST_FEE_NDP * 2) {
    throw new Error("customer wallet must have at least 1000 available NDP");
  }

  const slots = await input.database.findAvailableSeedSlots();
  if (slots.length < 2) {
    throw new Error("at least two available seeded ScheduleSlot rows are required");
  }

  log(`customer wallet before flow: available=${initialWallet.availableBalance}, frozen=${initialWallet.frozenBalance}`);

  const completedOrder = await input.api.createRequestBooking(customerToken, {
    orderType: "request",
    scheduleSlotId: slots[0].id,
    serviceId: slots[0].serviceId,
    fulfillmentMode: "store",
    note: "Step 12E request finance completed smoke flow"
  });
  assertEqual(completedOrder.orderType, "request", "created completed-flow orderType");

  await input.api.confirmOrder(merchantToken, completedOrder.id);
  assertWallet(
    await input.database.getUserWallet(customer.id),
    {
      availableBalance: initialWallet.availableBalance - REQUEST_FEE_NDP,
      frozenBalance: initialWallet.frozenBalance + REQUEST_FEE_NDP
    },
    "completed-flow confirm"
  );
  const completedHoldDetail = await input.api.getMerchantOrderFinance(
    merchantToken,
    completedOrder.id
  );
  assertEqual(completedHoldDetail.orderType, "request", "completed-flow finance orderType");
  assertEqual(
    completedHoldDetail.cRequestFeeHoldNdp,
    REQUEST_FEE_NDP,
    "completed-flow request fee hold"
  );

  await input.api.completeOrder(merchantToken, completedOrder.id);
  const afterCompletedWallet = assertWallet(
    await input.database.getUserWallet(customer.id),
    {
      availableBalance: initialWallet.availableBalance - REQUEST_FEE_NDP,
      frozenBalance: initialWallet.frozenBalance
    },
    "completed-flow complete"
  );
  const completedDetail = await input.api.getBackofficeOrderFinance(
    operatorToken,
    completedOrder.id
  );
  assertEqual(
    completedDetail.cRequestFeeActualNdp,
    REQUEST_FEE_NDP,
    "completed-flow actual request fee"
  );
  assertEqual(
    completedDetail.requestFeeNdpRevenue,
    REQUEST_FEE_NDP,
    "completed-flow request fee revenue"
  );
  assertTimelineIncludes(completedDetail, "request_fee_captured");
  log(
    `completed request order ${completedOrder.id}: actual=${completedDetail.cRequestFeeActualNdp}, revenue=${completedDetail.requestFeeNdpRevenue}`
  );

  const cancelledOrder = await input.api.createRequestBooking(customerToken, {
    orderType: "request",
    scheduleSlotId: slots[1].id,
    serviceId: slots[1].serviceId,
    fulfillmentMode: "store",
    note: "Step 12E request finance cancellation smoke flow"
  });
  assertEqual(cancelledOrder.orderType, "request", "created cancellation-flow orderType");

  await input.api.confirmOrder(merchantToken, cancelledOrder.id);
  assertWallet(
    await input.database.getUserWallet(customer.id),
    {
      availableBalance: afterCompletedWallet.availableBalance - REQUEST_FEE_NDP,
      frozenBalance: afterCompletedWallet.frozenBalance + REQUEST_FEE_NDP
    },
    "cancellation-flow confirm"
  );

  await input.api.cancelOrder(
    merchantToken,
    cancelledOrder.id,
    "Step 12E request finance cancellation smoke flow"
  );
  assertWallet(
    await input.database.getUserWallet(customer.id),
    afterCompletedWallet,
    "cancellation-flow cancel release"
  );
  const cancelledDetail = await input.api.getBackofficeOrderFinance(
    operatorToken,
    cancelledOrder.id
  );
  assertEqual(
    cancelledDetail.cRequestFeeActualNdp,
    0,
    "cancellation-flow actual request fee"
  );
  assertEqual(cancelledDetail.requestFeeNdpRevenue, 0, "cancellation-flow request fee revenue");
  assertEqual(cancelledDetail.releasedNdp, REQUEST_FEE_NDP, "cancellation-flow released NDP");
  log(`cancelled request order ${cancelledOrder.id}: released=${cancelledDetail.releasedNdp}`);

  return {
    completedOrderId: completedOrder.id,
    cancelledOrderId: cancelledOrder.id
  };
};

export const createFetchFinanceRequestFlowApi = (baseUrl: string): FinanceRequestFlowApi => {
  const request = async <T>(
    path: string,
    options: { body?: unknown; method?: string; token?: string } = {}
  ): Promise<T> => {
    const response = await fetch(joinUrl(baseUrl, path), {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      method: options.method ?? "GET"
    });
    const payload = (await response.json()) as ApiEnvelope<T>;

    if (!response.ok || payload.code !== 0 || payload.data === undefined) {
      throw new Error(payload.message || `${path} HTTP ${response.status}`);
    }

    return payload.data;
  };

  return {
    login: async (email, password) => {
      const payload = await request<LoginPayload>("/auth/login", {
        body: { email, password },
        method: "POST"
      });

      if (!payload.accessToken) {
        throw new Error(`login for ${email} did not return an access token`);
      }

      return payload.accessToken;
    },
    getMe: (token) => request<FinanceRequestFlowAccount>("/auth/me", { token }),
    createRequestBooking: (token, input) =>
      request<FinanceRequestFlowOrder>("/bookings", {
        body: input,
        method: "POST",
        token
      }),
    confirmOrder: (token, id) =>
      request<FinanceRequestFlowOrder>(`/orders/${id}/confirm`, { method: "POST", token }),
    completeOrder: (token, id) =>
      request<FinanceRequestFlowOrder>(`/orders/${id}/complete`, { method: "POST", token }),
    cancelOrder: (token, id, reason) =>
      request<FinanceRequestFlowOrder>(`/orders/${id}/cancel`, {
        body: { reason },
        method: "POST",
        token
      }),
    getMerchantOrderFinance: (token, id) =>
      request<FinanceRequestFlowOrderFinance>(`/merchant-admin/finance/orders/${id}`, { token }),
    getBackofficeOrderFinance: (token, id) =>
      request<FinanceRequestFlowOrderFinance>(`/backoffice/finance/orders/${id}`, { token })
  };
};

export const createPrismaFinanceRequestFlowDatabase = (
  prisma: PrismaClient
): FinanceRequestFlowDatabase => ({
  findAvailableSeedSlots: async () => {
    const slots = await prisma.scheduleSlot.findMany({
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        serviceId: true,
        startsAt: true,
        capacity: true,
        bookedCount: true,
        service: {
          select: {
            deletedAt: true,
            status: true
          }
        },
        shop: {
          select: {
            deletedAt: true,
            status: true
          }
        }
      },
      take: 20,
      where: {
        deletedAt: null,
        serviceId: { not: null },
        status: "AVAILABLE"
      }
    });

    return slots
      .filter(
        (slot) =>
          slot.serviceId !== null &&
          slot.bookedCount < slot.capacity &&
          slot.service?.deletedAt === null &&
          slot.service.status === "published" &&
          slot.shop.deletedAt === null &&
          slot.shop.status === "published"
      )
      .slice(0, 2)
      .map((slot) => ({
        id: slot.id,
        serviceId: slot.serviceId as number,
        startsAt: slot.startsAt.toISOString()
      }));
  },
  getUserWallet: async (userId) => {
    const wallet = await prisma.wallet.findUnique({
      select: {
        availableBalance: true,
        frozenBalance: true
      },
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: userId,
          currency: "NDP"
        }
      }
    });

    return wallet;
  }
});

const getPassword = (): string => {
  const password =
    process.env.TEST_USER_DEFAULT_PASSWORD?.trim() || process.env.ADMIN_DEFAULT_PASSWORD?.trim();

  if (!password) {
    throw new Error("TEST_USER_DEFAULT_PASSWORD or ADMIN_DEFAULT_PASSWORD is required.");
  }

  return password;
};

const buildDefaultBaseUrl = (env: AppConfig): string =>
  process.env.API_BASE_URL || `http://127.0.0.1:${env.PORT}${env.API_PREFIX}`;

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const hasBaseUrlArg = args.includes("--base-url");
  const initialOptions = parseFinanceRequestFlowArgs(args);
  process.env.ENV_FILE = initialOptions.envFile;

  if (!existsSync(initialOptions.envFile)) {
    throw new Error(
      `Env file ${initialOptions.envFile} was not found. Copy backend/.env.dev.example to backend/.env.dev and fill real local values.`
    );
  }

  loadDotenv({ path: initialOptions.envFile });

  const [{ env }, { prisma, disconnectPrisma }] = await Promise.all([
    import("../src/config/env"),
    import("../src/prisma/client")
  ]);
  const options = {
    ...initialOptions,
    baseUrl: hasBaseUrlArg ? initialOptions.baseUrl : trimTrailingSlash(buildDefaultBaseUrl(env))
  };

  try {
    const result = await runFinanceRequestFlow({
      api: createFetchFinanceRequestFlowApi(options.baseUrl),
      database: createPrismaFinanceRequestFlowDatabase(prisma),
      password: getPassword()
    });
    console.log(
      `Step 12E finance request flow ok: completed=${result.completedOrderId}, cancelled=${result.cancelledOrderId}`
    );
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Step 12E finance request flow failed: ${message}`);
    process.exitCode = 1;
  });
}
