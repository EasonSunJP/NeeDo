type FinancialEvidenceInput = {
  orderPlatformFeesJpy: number;
  saasFeesJpy: number;
  userRebatesJpy: number;
  refundsAndReversalsJpy: number;
  channelFeesJpy: number;
  consumptionTaxJpy: number;
  allocatedOperatingCostsJpy: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
};

export type SettlementSnapshotEvidence = FinancialEvidenceInput & {
  pureProfitJpy: number;
  profitShareAmountJpy: number;
  totalAmountJpy: number;
};

const safeNonnegative = (value: number): bigint => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  return BigInt(value);
};

const safeNumber = (value: bigint): number => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  return result;
};

export function expectedSettlementEvidence(
  input: FinancialEvidenceInput
): SettlementSnapshotEvidence {
  const income = safeNonnegative(input.orderPlatformFeesJpy) + safeNonnegative(input.saasFeesJpy);
  const deductions =
    safeNonnegative(input.userRebatesJpy) +
    safeNonnegative(input.refundsAndReversalsJpy) +
    safeNonnegative(input.channelFeesJpy) +
    safeNonnegative(input.consumptionTaxJpy) +
    safeNonnegative(input.allocatedOperatingCostsJpy);
  if (
    !Number.isSafeInteger(input.profitShareRateBps) ||
    input.profitShareRateBps < 0 ||
    input.profitShareRateBps > 10_000
  ) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  const pureProfitJpy = safeNumber(income - deductions);
  const profitShareAmountJpy = safeNumber(
    (BigInt(Math.max(0, pureProfitJpy)) * BigInt(input.profitShareRateBps)) / 10_000n
  );
  return {
    ...input,
    pureProfitJpy,
    profitShareAmountJpy,
    totalAmountJpy: safeNumber(
      safeNonnegative(input.fixedSuccessRewardJpy) + BigInt(profitShareAmountJpy)
    )
  };
}

export const canonicalEvidence = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return `array:[${value.map(canonicalEvidence).join(",")}]`;
  if (value && typeof value === "object") {
    const jsonCapable = value as { toJSON?: () => unknown };
    if (typeof jsonCapable.toJSON === "function") {
      return `json:${canonicalEvidence(jsonCapable.toJSON())}`;
    }
    const record = value as Record<string, unknown>;
    return `object:{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalEvidence(record[key])}`)
      .join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
};

export function assertPersistedSettlementEvidenceUnchanged(before: unknown, after: unknown): void {
  if (canonicalEvidence(before) !== canonicalEvidence(after)) {
    throw new Error("Confirmed agent settlement snapshot changed");
  }
}

export function assertSettlementSnapshotUnchanged(
  before: SettlementSnapshotEvidence,
  after: SettlementSnapshotEvidence
): void {
  assertPersistedSettlementEvidenceUnchanged(before, after);
}

type FormalEnvironmentResult = { values: Record<string, string> };

export async function loadValidatedSettlementCheckModules<TPrismaModule, TFlowModule>(
  runtimeEnvironment: NodeJS.ProcessEnv,
  dependencies: {
    validateEnvironment: (environment: NodeJS.ProcessEnv) => FormalEnvironmentResult;
    loadPrismaModule: () => Promise<TPrismaModule>;
    loadFlowModule: () => Promise<TFlowModule>;
  }
): Promise<[TPrismaModule, TFlowModule]> {
  const formalEnvironment = dependencies.validateEnvironment(runtimeEnvironment);
  for (const [name, value] of Object.entries(formalEnvironment.values)) {
    runtimeEnvironment[name] = value;
  }
  return Promise.all([dependencies.loadPrismaModule(), dependencies.loadFlowModule()]);
}

export async function runAgentSettlementCheck(): Promise<void> {
  const { loadAndValidateFormalEnvironment, runRollbackOnlyTransaction } = await import(
    "./check-order-fulfillment-checkout-flow"
  );
  const [{ prisma }, flow] = await loadValidatedSettlementCheckModules(process.env, {
    validateEnvironment: loadAndValidateFormalEnvironment,
    loadPrismaModule: () => import("../src/prisma/client"),
    loadFlowModule: () => import("./check-agent-settlement-flow-runner")
  });
  try {
    await runRollbackOnlyTransaction(
      prisma,
      () => flow.captureAgentSettlementExternalBaseline(prisma),
      flow.runFormalAgentSettlementFlow
    );
    process.stdout.write("Agent settlement flow verified; ROLLBACK completed.\n");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runAgentSettlementCheck().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Agent settlement check failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
