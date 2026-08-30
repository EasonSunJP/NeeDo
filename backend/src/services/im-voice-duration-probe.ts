import { Worker } from "node:worker_threads";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { ImVoiceMimeType } from "./im-voice.storage";

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_ACTIVE_WORKERS = 2;
const DEFAULT_MAX_QUEUED_PROBES = 8;

const WORKER_SOURCE = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const { parseBuffer } = require("music-metadata");

(async () => {
  try {
    const bytes = Buffer.from(workerData.bytes);
    const metadata = await parseBuffer(
      bytes,
      { mimeType: workerData.mimeType, size: bytes.length },
      { duration: true, skipCovers: true }
    );
    parentPort.postMessage({
      ok: true,
      result: {
        durationSeconds: metadata.format.duration,
        hasAudio: metadata.format.hasAudio,
        hasVideo: metadata.format.hasVideo
      }
    });
  } catch {
    parentPort.postMessage({ ok: false });
  }
})().catch(() => parentPort.postMessage({ ok: false }));
`;

export interface ImVoiceDurationMetadata {
  durationSeconds: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface ImVoiceDurationProbePort {
  probe(bytes: Buffer, mimeType: ImVoiceMimeType): Promise<ImVoiceDurationMetadata>;
}

export interface ImVoiceDurationWorkerInput {
  bytes: Uint8Array;
  mimeType: ImVoiceMimeType;
}

export interface ImVoiceDurationWorkerOptions {
  eval: true;
  resourceLimits: {
    maxOldGenerationSizeMb: number;
    maxYoungGenerationSizeMb: number;
    stackSizeMb: number;
  };
  workerData: ImVoiceDurationWorkerInput;
}

export interface ImVoiceDurationProbeWorker {
  off(event: "message", listener: (message: unknown) => void): void;
  off(event: "error", listener: (error: Error) => void): void;
  off(event: "exit", listener: (code: number) => void): void;
  once(event: "message", listener: (message: unknown) => void): void;
  once(event: "error", listener: (error: Error) => void): void;
  once(event: "exit", listener: (code: number) => void): void;
  terminate(): Promise<number>;
}

export type ImVoiceDurationProbeWorkerFactory = (
  source: string,
  options: ImVoiceDurationWorkerOptions
) => ImVoiceDurationProbeWorker;

interface ProbeJob {
  input: ImVoiceDurationWorkerInput;
  reject(error: AppError): void;
  resolve(metadata: ImVoiceDurationMetadata): void;
}

interface WorkerIsolatedImVoiceDurationProbeOptions {
  maxActiveWorkers?: number;
  maxQueuedProbes?: number;
  timeoutMs?: number;
  workerFactory?: ImVoiceDurationProbeWorkerFactory;
}

const defaultWorkerFactory: ImVoiceDurationProbeWorkerFactory = (source, options) =>
  new Worker(source, options);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeWorkerResult = (message: unknown): ImVoiceDurationMetadata | null => {
  if (!isRecord(message) || message.ok !== true || !isRecord(message.result)) return null;
  const { durationSeconds, hasAudio, hasVideo } = message.result;
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    typeof hasAudio !== "boolean" ||
    typeof hasVideo !== "boolean"
  ) {
    return null;
  }
  return { durationSeconds, hasAudio, hasVideo };
};

export class WorkerIsolatedImVoiceDurationProbe implements ImVoiceDurationProbePort {
  private activeWorkers = 0;
  private readonly maxActiveWorkers: number;
  private readonly maxQueuedProbes: number;
  private readonly queue: ProbeJob[] = [];
  private readonly timeoutMs: number;
  private readonly workerFactory: ImVoiceDurationProbeWorkerFactory;

  public constructor(options: WorkerIsolatedImVoiceDurationProbeOptions = {}) {
    this.maxActiveWorkers = options.maxActiveWorkers ?? DEFAULT_MAX_ACTIVE_WORKERS;
    this.maxQueuedProbes = options.maxQueuedProbes ?? DEFAULT_MAX_QUEUED_PROBES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
  }

  public probe(bytes: Buffer, mimeType: ImVoiceMimeType): Promise<ImVoiceDurationMetadata> {
    if (this.activeWorkers >= this.maxActiveWorkers && this.queue.length >= this.maxQueuedProbes) {
      return Promise.reject(this.invalid());
    }

    return new Promise<ImVoiceDurationMetadata>((resolve, reject) => {
      const job: ProbeJob = {
        input: { bytes: Uint8Array.from(bytes), mimeType },
        reject,
        resolve
      };
      if (this.activeWorkers < this.maxActiveWorkers) {
        this.start(job);
        return;
      }
      this.queue.push(job);
    });
  }

  private start(job: ProbeJob): void {
    this.activeWorkers += 1;
    let worker: ImVoiceDurationProbeWorker;
    try {
      worker = this.workerFactory(WORKER_SOURCE, {
        eval: true,
        resourceLimits: {
          maxOldGenerationSizeMb: 32,
          maxYoungGenerationSizeMb: 8,
          stackSizeMb: 2
        },
        workerData: job.input
      });
    } catch (error) {
      this.releaseSlot();
      job.reject(this.invalid(error));
      return;
    }

    let settled = false;
    const onMessage = (message: unknown) => {
      const result = normalizeWorkerResult(message);
      void settle(result ?? undefined, result ? undefined : this.invalid());
    };
    const onError = (error: Error) => {
      void settle(undefined, this.invalid(error));
    };
    const onExit = (code: number) => {
      void settle(undefined, this.invalid(new Error(`voice duration worker exited with ${code}`)));
    };
    const settle = async (
      result: ImVoiceDurationMetadata | undefined,
      error: AppError | undefined
    ): Promise<void> => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
      try {
        await worker.terminate();
      } catch {
        // Termination is best-effort after the result is already fixed.
      }
      this.releaseSlot();
      if (result) {
        job.resolve(result);
        return;
      }
      job.reject(error ?? this.invalid());
    };

    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
    const timeout = setTimeout(() => {
      void settle(undefined, this.invalid(new Error("voice duration worker timed out")));
    }, this.timeoutMs);
    timeout.unref();
  }

  private releaseSlot(): void {
    this.activeWorkers -= 1;
    const next = this.queue.shift();
    if (next) this.start(next);
  }

  private invalid(cause?: unknown): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.voice_duration_invalid",
      statusCode: 400,
      cause
    });
  }
}
