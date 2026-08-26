const MAX_TRANSACTION_ATTEMPTS = 3;

export const isRetryableTransactionConflict = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown; message?: unknown };
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const metaCode = typeof candidate.meta?.code === "string" ? candidate.meta.code : "";
  const message = [candidate.message, candidate.meta?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return (
    code === "P2034" ||
    code === "1213" ||
    metaCode === "1213" ||
    /deadlock|\b1213\b|\b40001\b/i.test(message)
  );
};

export const runWithTransactionConflictRetry = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === MAX_TRANSACTION_ATTEMPTS || !isRetryableTransactionConflict(error)) {
        throw error;
      }
    }
  }

  throw new Error("error.transaction_retry_exhausted");
};
