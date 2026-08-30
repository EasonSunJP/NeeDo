import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import { ERROR_CODES } from "../src/constants/error-codes";
import {
  WorkerIsolatedImVoiceDurationProbe,
  type ImVoiceDurationProbeWorker,
  type ImVoiceDurationProbeWorkerFactory,
  type ImVoiceDurationWorkerOptions
} from "../src/services/im-voice-duration-probe";

const fixture = (name: string) => readFile(join(__dirname, "fixtures", "im-voice", name));

const expectStableInvalidError = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({
    code: ERROR_CODES.VALIDATION,
    message: "error.im.voice_duration_invalid",
    statusCode: 400
  });

class ControlledWorker extends EventEmitter implements ImVoiceDurationProbeWorker {
  public readonly deliveries: Array<{
    message: unknown;
    transferredByteLengths: number[];
  }> = [];
  public readonly postMessage = jest.fn(
    (message: unknown, transferList: readonly ArrayBuffer[] = []) => {
      const transferredByteLengths = transferList.map((buffer) => buffer.byteLength);
      const delivered = structuredClone(message, { transfer: [...transferList] });
      this.deliveries.push({ message: delivered, transferredByteLengths });
    }
  );
  public readonly terminate = jest.fn(async () => 0);

  public succeed(result: unknown): void {
    this.emit("message", { ok: true, result });
  }

  public fail(): void {
    this.emit("message", { ok: false });
  }

  public crash(error = new Error("worker crashed")): void {
    this.emit("error", error);
  }

  public exit(code: number): void {
    this.emit("exit", code);
  }
}

const readDeliveredBytes = (worker: ControlledWorker): Buffer => {
  const message = worker.deliveries[0]?.message;
  if (!message || typeof message !== "object") throw new Error("missing worker delivery");
  const input = message as {
    bytes: ArrayBuffer;
    byteLength: number;
    byteOffset: number;
  };
  return Buffer.from(input.bytes, input.byteOffset, input.byteLength);
};

describe("WorkerIsolatedImVoiceDurationProbe", () => {
  it.each([
    { name: "silence-1s.webm", mimeType: "audio/webm" as const },
    { name: "silence-1s.mp4", mimeType: "audio/mp4" as const },
    { name: "silence-1s.ogg", mimeType: "audio/ogg" as const }
  ])("parses real silent $name audio", async ({ name, mimeType }) => {
    const probe = new WorkerIsolatedImVoiceDurationProbe();

    await expect(probe.probe(await fixture(name), mimeType)).resolves.toMatchObject({
      durationSeconds: expect.closeTo(1.25, 1),
      hasAudio: true,
      hasVideo: false
    });
  });

  it("reports the real duration of an over-limit audio fixture", async () => {
    const probe = new WorkerIsolatedImVoiceDurationProbe();

    await expect(
      probe.probe(await fixture("silence-60s.webm"), "audio/webm")
    ).resolves.toMatchObject({
      durationSeconds: expect.closeTo(60, 1),
      hasAudio: true,
      hasVideo: false
    });
  });

  it.each([
    { name: "audio-video-1s.webm", mimeType: "audio/webm" as const },
    { name: "audio-video-1s.mp4", mimeType: "audio/mp4" as const },
    { name: "audio-video-1s.ogg", mimeType: "audio/ogg" as const }
  ])("never reports real $name media as acceptable pure audio", async ({ name, mimeType }) => {
    const probe = new WorkerIsolatedImVoiceDurationProbe();

    const outcome = await probe.probe(await fixture(name), mimeType).then(
      (result) => ({ kind: "result" as const, result }),
      (error: unknown) => ({ kind: "error" as const, error })
    );

    if (outcome.kind === "error") {
      expect(outcome.error).toMatchObject({
        code: ERROR_CODES.VALIDATION,
        message: "error.im.voice_duration_invalid",
        statusCode: 400
      });
      return;
    }

    expect(outcome.result).not.toMatchObject({ hasAudio: true, hasVideo: false });
  });

  it.each([
    {
      bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      mimeType: "audio/webm" as const
    },
    {
      bytes: Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]),
      mimeType: "audio/mp4" as const
    },
    { bytes: Buffer.from("OggS"), mimeType: "audio/ogg" as const }
  ])("rejects malformed signature-only $mimeType data", async ({ bytes, mimeType }) => {
    const probe = new WorkerIsolatedImVoiceDurationProbe();

    await expectStableInvalidError(probe.probe(bytes, mimeType));
  });

  it("maps a parser failure to the stable validation error and terminates the worker", async () => {
    const worker = new ControlledWorker();
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      workerFactory: () => worker
    });

    const pending = probe.probe(Buffer.from("parser failure"), "audio/webm");
    worker.fail();

    await expectStableInvalidError(pending);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { durationSeconds: Number.NaN, hasAudio: true, hasVideo: false },
    { durationSeconds: 0, hasAudio: true, hasVideo: false },
    { durationSeconds: 1, hasVideo: false },
    { durationSeconds: 1, hasAudio: true },
    { durationSeconds: 1, hasAudio: "yes", hasVideo: false },
    { durationSeconds: 1, hasAudio: true, hasVideo: 0 }
  ])("rejects untrusted malformed worker result %# in the parent", async (result) => {
    const worker = new ControlledWorker();
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      workerFactory: () => worker
    });

    const pending = probe.probe(Buffer.from("untrusted result"), "audio/webm");
    worker.succeed(result);

    await expectStableInvalidError(pending);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("times out, terminates the worker, and maps the timeout to the stable error", async () => {
    const worker = new ControlledWorker();
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      timeoutMs: 10,
      workerFactory: () => worker
    });

    await expectStableInvalidError(probe.probe(Buffer.from("never completes"), "audio/webm"));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("uses the inline CommonJS worker with the approved V8 resource limits", async () => {
    const worker = new ControlledWorker();
    let source = "";
    let options: ImVoiceDurationWorkerOptions | undefined;
    const input = Buffer.from("worker input");
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      workerFactory: (nextSource: string, nextOptions: ImVoiceDurationWorkerOptions) => {
        source = nextSource;
        options = nextOptions;
        return worker;
      }
    });

    const pending = probe.probe(input, "audio/ogg");

    expect(source).toContain('require("music-metadata")');
    expect(source).toContain('parentPort.once("message"');
    expect(source).toContain("Buffer.from(message.bytes, message.byteOffset, message.byteLength)");
    expect(options).toMatchObject({
      eval: true,
      resourceLimits: {
        maxOldGenerationSizeMb: 32,
        maxYoungGenerationSizeMb: 8,
        stackSizeMb: 2
      }
    });
    expect(options).not.toHaveProperty("workerData");
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(readDeliveredBytes(worker).toString()).toBe("worker input");
    expect(worker.deliveries[0]?.message).toMatchObject({ mimeType: "audio/ogg" });
    expect(worker.deliveries[0]?.transferredByteLengths).toEqual([input.byteLength]);
    expect(input.toString()).toBe("worker input");

    worker.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
    await expect(pending).resolves.toBeDefined();
  });

  it("copies only active jobs, transfers ownership, drains FIFO, and rejects queue overflow", async () => {
    const workers: ControlledWorker[] = [];
    const workerFactory: ImVoiceDurationProbeWorkerFactory = () => {
      const worker = new ControlledWorker();
      workers.push(worker);
      return worker;
    };
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      workerFactory
    });

    const sourceBuffers = Array.from({ length: 10 }, (_, index) => Buffer.from(`probe-${index}`));
    const accepted = sourceBuffers.map((bytes) => probe.probe(bytes, "audio/webm"));
    const overflowAssertion = expectStableInvalidError(
      probe.probe(Buffer.from("probe-overflow"), "audio/webm")
    );

    expect(workers).toHaveLength(2);
    expect(workers.reduce((total, worker) => total + worker.postMessage.mock.calls.length, 0)).toBe(
      2
    );
    sourceBuffers[2]!.write("queued!");
    await overflowAssertion;

    for (let index = 0; index < accepted.length; index += 1) {
      const expected = index === 2 ? "queued!" : `probe-${index}`;
      expect(readDeliveredBytes(workers[index]!).toString()).toBe(expected);
      expect(workers[index]!.deliveries[0]?.transferredByteLengths).toEqual([
        sourceBuffers[index]!.byteLength
      ]);
      expect(sourceBuffers[index]!.buffer.byteLength).toBeGreaterThan(0);
      workers[index]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
      await expect(accepted[index]).resolves.toBeDefined();
    }

    expect(workers).toHaveLength(10);
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });

  it("settles, terminates, and releases a slot exactly once across message/exit races", async () => {
    const workers: ControlledWorker[] = [];
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      maxActiveWorkers: 1,
      workerFactory: () => {
        const worker = new ControlledWorker();
        workers.push(worker);
        return worker;
      }
    });

    const first = probe.probe(Buffer.from("first"), "audio/webm");
    const second = probe.probe(Buffer.from("second"), "audio/webm");
    workers[0]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
    workers[0]!.exit(1);

    await expect(first).resolves.toBeDefined();
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);

    workers[1]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
    await expect(second).resolves.toBeDefined();
    expect(workers[1]!.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])(
    "maps worker errors and exit code %s once while continuing queued work",
    async (exitCode) => {
      const workers: ControlledWorker[] = [];
      const probe = new WorkerIsolatedImVoiceDurationProbe({
        maxActiveWorkers: 1,
        workerFactory: () => {
          const worker = new ControlledWorker();
          workers.push(worker);
          return worker;
        }
      });

      const errored = probe.probe(Buffer.from("error"), "audio/webm");
      const exited = probe.probe(Buffer.from("exit"), "audio/webm");
      const final = probe.probe(Buffer.from("final"), "audio/webm");
      workers[0]!.crash();
      workers[0]!.exit(1);

      await expectStableInvalidError(errored);
      expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
      expect(workers).toHaveLength(2);

      workers[1]!.exit(exitCode);
      await expectStableInvalidError(exited);
      expect(workers[1]!.terminate).toHaveBeenCalledTimes(1);
      expect(workers).toHaveLength(3);

      workers[2]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
      await expect(final).resolves.toBeDefined();
    }
  );

  it("continues FIFO work when the worker factory throws for a queued job", async () => {
    const workers: ControlledWorker[] = [];
    let calls = 0;
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      maxActiveWorkers: 1,
      workerFactory: () => {
        calls += 1;
        if (calls === 2) throw new Error("factory failed");
        const worker = new ControlledWorker();
        workers.push(worker);
        return worker;
      }
    });

    const first = probe.probe(Buffer.from("first"), "audio/webm");
    const failed = probe.probe(Buffer.from("failed"), "audio/webm");
    const successor = probe.probe(Buffer.from("successor"), "audio/webm");

    workers[0]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
    await expect(first).resolves.toBeDefined();
    await expectStableInvalidError(failed);
    expect(workers).toHaveLength(2);
    expect(readDeliveredBytes(workers[1]!).toString()).toBe("successor");

    workers[1]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
    await expect(successor).resolves.toBeDefined();
  });

  it("continues queued work after a timeout and ignores late worker exit", async () => {
    const workers: ControlledWorker[] = [];
    const probe = new WorkerIsolatedImVoiceDurationProbe({
      maxActiveWorkers: 1,
      timeoutMs: 10,
      workerFactory: () => {
        const worker = new ControlledWorker();
        workers.push(worker);
        return worker;
      }
    });

    const timedOut = probe.probe(Buffer.from("timeout"), "audio/webm");
    const successor = probe.probe(Buffer.from("successor"), "audio/webm");

    await expectStableInvalidError(timedOut);
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(2);
    workers[0]!.exit(1);
    expect(workers).toHaveLength(2);

    workers[1]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
    await expect(successor).resolves.toBeDefined();
  });

  it("settles and releases exactly once when termination rejects", async () => {
    const workers: ControlledWorker[] = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const probe = new WorkerIsolatedImVoiceDurationProbe({
        maxActiveWorkers: 1,
        workerFactory: () => {
          const worker = new ControlledWorker();
          workers.push(worker);
          return worker;
        }
      });

      const first = probe.probe(Buffer.from("first"), "audio/webm");
      const successor = probe.probe(Buffer.from("successor"), "audio/webm");
      workers[0]!.terminate.mockRejectedValueOnce(new Error("terminate failed"));
      workers[0]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
      workers[0]!.exit(1);

      await expect(first).resolves.toBeDefined();
      expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
      expect(workers).toHaveLength(2);
      workers[1]!.succeed({ durationSeconds: 1, hasAudio: true, hasVideo: false });
      await expect(successor).resolves.toBeDefined();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
