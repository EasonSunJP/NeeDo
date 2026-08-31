import { extname, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { DatabaseEnvConfig } from "../config/database";
import { env } from "../config/env";
import type { AuthRepository } from "../repositories/auth.repository";

interface MerchantShopAuditCompletionRuntimeOptions {
  socketTimeoutMs: number;
  onDisconnectError?: (error: unknown) => void;
}

interface CompletionResponse {
  requestId: number;
  result?: boolean;
  error?: string;
}

interface PendingCompletion {
  resolve: (result: boolean) => void;
  reject: (error: Error) => void;
}

export interface MerchantShopAuditCompletionRuntime {
  repository: Pick<AuthRepository, "completeMerchantShopSwitchAudit">;
  destroy: () => Promise<void>;
}

const runtimeClosedError = (): Error =>
  new Error("Merchant shop audit completion runtime is unavailable");

export const createMerchantShopAuditCompletionRuntime = (
  config: DatabaseEnvConfig = env,
  options: MerchantShopAuditCompletionRuntimeOptions
): MerchantShopAuditCompletionRuntime => {
  const sourceExtension = extname(__filename);
  const workerFile = resolve(__dirname, `merchant-shop-audit-completion.worker${sourceExtension}`);
  const worker = new Worker(
    sourceExtension === ".ts"
      ? `require("tsx/cjs");require(${JSON.stringify(workerFile)})`
      : workerFile,
    {
      env: process.env,
      workerData: {
        config,
        socketTimeoutMs: options.socketTimeoutMs
      },
      eval: sourceExtension === ".ts"
    }
  );
  const pending = new Map<number, PendingCompletion>();
  let nextRequestId = 1;
  let destroyed = false;
  let destroyPromise: Promise<void> | undefined;

  const rejectPending = (error: Error): void => {
    for (const completion of pending.values()) completion.reject(error);
    pending.clear();
  };
  worker.on("message", (response: CompletionResponse) => {
    const completion = pending.get(response.requestId);
    if (!completion) return;
    pending.delete(response.requestId);
    if (response.error) {
      completion.reject(new Error(response.error));
      return;
    }
    completion.resolve(response.result === true);
  });
  worker.once("error", (error) => {
    if (!destroyed) options.onDisconnectError?.(error);
    rejectPending(runtimeClosedError());
  });
  worker.once("exit", (code) => {
    if (!destroyed && code !== 0) {
      options.onDisconnectError?.(
        new Error(`Merchant shop audit completion worker exited with code ${code}`)
      );
    }
    rejectPending(runtimeClosedError());
  });

  return {
    repository: {
      completeMerchantShopSwitchAudit: (input) => {
        if (destroyed) return Promise.reject(runtimeClosedError());
        const requestId = nextRequestId;
        nextRequestId += 1;
        return new Promise<boolean>((resolveCompletion, rejectCompletion) => {
          pending.set(requestId, {
            resolve: resolveCompletion,
            reject: rejectCompletion
          });
          try {
            worker.postMessage({ requestId, input });
          } catch {
            pending.delete(requestId);
            rejectCompletion(runtimeClosedError());
          }
        });
      }
    },
    destroy: () => {
      if (destroyPromise) return destroyPromise;
      destroyed = true;
      rejectPending(runtimeClosedError());
      destroyPromise = worker
        .terminate()
        .then(() => undefined)
        .catch((error) => {
          destroyPromise = undefined;
          throw error;
        });
      return destroyPromise;
    }
  };
};
