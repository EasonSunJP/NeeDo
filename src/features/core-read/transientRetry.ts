import { ApiClientError } from "../../api/httpClient";

type TransientRetryOptions = {
  retryDelayMs?: number;
};

const transientNetworkMessages = new Set([
  "error.network",
  "error.network.timeout",
  "error.network.unreachable"
]);

function isTransientCoreReadError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return error instanceof Error && transientNetworkMessages.has(error.message);
}

function wait(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs))
    : Promise.resolve();
}

export async function loadCoreReadWithTransientRetry<TData>(
  load: () => Promise<TData>,
  options: TransientRetryOptions = {}
) {
  try {
    return await load();
  } catch (error) {
    if (!isTransientCoreReadError(error)) {
      throw error;
    }

    await wait(options.retryDelayMs ?? 300);
    return load();
  }
}
