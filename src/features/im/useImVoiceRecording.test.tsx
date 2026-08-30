// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_VOICE_RECORDING_SECONDS,
  useImVoiceRecording,
  type UseImVoiceRecordingResult,
} from "./useImVoiceRecording";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];

  readonly mimeType = "audio/webm;codecs=opus";
  readonly start = vi.fn(() => {
    this.state = "recording" as RecordingState;
  });
  readonly stop = vi.fn(() => {
    if (this.state === "inactive") {
      throw new DOMException("The recorder is already inactive", "InvalidStateError");
    }
    this.state = "inactive" as RecordingState;
  });
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  state: RecordingState = "inactive";

  constructor(readonly stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  emitData(blob: Blob) {
    this.ondataavailable?.({ data: blob } as BlobEvent);
  }

  fail() {
    this.state = "inactive";
    this.onerror?.(new Event("error"));
  }

  finishStop() {
    this.onstop?.(new Event("stop"));
  }
}

function HookProbe() {
  const voice = useImVoiceRecording();
  latest = voice;
  return (
    <audio
      data-testid="preview-audio"
      ref={voice.audioRef}
      src={voice.previewUrl ?? undefined}
    />
  );
}

function PageLikeHookProbe() {
  const voice = useImVoiceRecording();
  latest = voice;
  return voice.phase === "idle" ? null : (
    <audio
      data-testid="page-like-preview-audio"
      ref={voice.audioRef}
      src={voice.previewUrl ?? undefined}
    />
  );
}

let latest: UseImVoiceRecordingResult;
let container: HTMLDivElement;
let root: Root;
let trackStop: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;
let audioPlay: ReturnType<typeof vi.spyOn>;
let audioPause: ReturnType<typeof vi.spyOn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

const webmChunk = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
  type: "audio/webm;codecs=opus",
});

async function renderHook() {
  await act(async () => root.render(<HookProbe />));
}

async function openRecording() {
  await act(async () => {
    await latest.open();
  });
  return FakeMediaRecorder.instances.at(-1)!;
}

async function finishRecorder(recorder: FakeMediaRecorder, elapsedMs = 2_000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(elapsedMs);
    latest.stop("manual");
    recorder.emitData(webmChunk);
    recorder.finishStop();
    await Promise.resolve();
  });
}

describe("useImVoiceRecording", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    trackStop = vi.fn();
    const track = { stop: trackStop } as unknown as MediaStreamTrack;
    stream = { getTracks: () => [track] } as unknown as MediaStream;
    getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    createObjectURL = vi.fn(() => "blob:needo-voice-1");
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    audioPlay = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    audioPause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await renderHook();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts on click and counts down from 59", async () => {
    await openRecording();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(latest.phase).toBe("recording");
    expect(latest.remainingSeconds).toBe(MAX_VOICE_RECORDING_SECONDS);
    expect(latest.progress).toBe(0);
  });

  it("can open after the StrictMode effect cleanup and setup cycle", async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(
      <StrictMode>
        <HookProbe />
      </StrictMode>,
    ));

    await act(async () => {
      await latest.open();
    });

    expect(latest.phase).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(trackStop).not.toHaveBeenCalled();
  });

  it("uses elapsed time for manual stop and never stops the recorder twice", async () => {
    const recorder = await openRecording();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_250);
      latest.stop("manual");
      latest.stop("limit");
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      recorder.emitData(webmChunk);
      recorder.finishStop();
      await Promise.resolve();
    });
    expect(latest.durationSeconds).toBe(1);
    expect(latest.progress).toBeCloseTo(1 / MAX_VOICE_RECORDING_SECONDS);
  });

  it("uses elapsed time for a limit stop before clamping at 59", async () => {
    const recorder = await openRecording();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_250);
      latest.stop("limit");
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(latest.durationSeconds).toBe(2);
    expect(latest.remainingSeconds).toBe(57);
  });

  it("stops at 59 seconds, creates one Blob URL, and auto-plays once without sending", async () => {
    const recorder = await openRecording();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
      recorder.emitData(webmChunk);
      recorder.finishStop();
      await Promise.resolve();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(latest.phase).toBe("preview_playing");
    expect(latest.blob).toBeInstanceOf(Blob);
    expect(latest.blob?.type).toBe("audio/webm;codecs=opus");
    expect(latest.durationSeconds).toBe(59);
    expect(latest.remainingSeconds).toBe(0);
    expect(latest.progress).toBe(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(latest.phase).not.toBe("sending");
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it("commits the preview URL to the audio element before autoplay", async () => {
    let srcAtPlay: string | null = null;
    audioPlay.mockImplementation(function (this: HTMLMediaElement) {
      srcAtPlay = this.getAttribute("src");
      return Promise.resolve();
    });
    const recorder = await openRecording();

    await finishRecorder(recorder);

    expect(srcAtPlay).toBe("blob:needo-voice-1");
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(latest.phase).toBe("preview_playing");
  });

  it("does not let a pending autoplay rejection escape the sending phase", async () => {
    const playback = deferred<void>();
    audioPlay.mockReturnValue(playback.promise);
    const recorder = await openRecording();
    await finishRecorder(recorder);

    expect(latest.phase).toBe("preview_paused");
    await act(async () => latest.beginSending());
    expect(latest.phase).toBe("sending");

    await act(async () => {
      playback.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
      await Promise.resolve();
    });
    expect(latest.phase).toBe("sending");

    await act(async () => latest.finishSending());
    expect(latest.phase).toBe("idle");
    expect(latest.blob).toBeNull();
    expect(latest.previewUrl).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each(["no data", "zero-size data"])(
    "rejects %s without creating or playing an empty preview",
    async (dataCase) => {
      const recorder = await openRecording();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
        latest.stop("manual");
        if (dataCase === "zero-size data") {
          recorder.emitData(new Blob([], { type: "audio/webm" }));
        }
        recorder.finishStop();
        await Promise.resolve();
      });

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(audioPlay).not.toHaveBeenCalled();
      expect(latest.phase).toBe("idle");
      expect(latest.error).toBe("error.im.voice_recording_failed");
      expect(latest.blob).toBeNull();
      expect(latest.previewUrl).toBeNull();
      expect(latest.durationSeconds).toBe(0);
      expect(latest.remainingSeconds).toBe(MAX_VOICE_RECORDING_SECONDS);
      expect(latest.progress).toBe(0);
      expect(trackStop).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("stops late permission tracks after cancellation without starting a recorder", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);

    let opening!: Promise<void>;
    await act(async () => {
      opening = latest.open();
      latest.cancel();
      permission.resolve(stream);
      await opening;
    });

    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(latest.phase).toBe("idle");
    expect(latest.error).toBeNull();
  });

  it("ignores stale recorder callbacks after cancellation", async () => {
    const recorder = await openRecording();

    await act(async () => {
      latest.cancel();
      recorder.emitData(webmChunk);
      recorder.finishStop();
      await Promise.resolve();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(latest.phase).toBe("idle");
    expect(latest.blob).toBeNull();
  });

  it("replays from zero and follows pause and ended events", async () => {
    const recorder = await openRecording();
    await finishRecorder(recorder);
    const audio = container.querySelector<HTMLAudioElement>('[data-testid="preview-audio"]')!;

    audio.currentTime = 1;
    await act(async () => {
      await latest.replay();
    });
    expect(audio.currentTime).toBe(0);
    expect(audioPlay).toHaveBeenCalledTimes(2);
    expect(latest.phase).toBe("preview_playing");

    await act(async () => audio.dispatchEvent(new Event("pause")));
    expect(latest.phase).toBe("preview_paused");

    await act(async () => {
      await latest.replay();
      audio.dispatchEvent(new Event("ended"));
    });
    expect(latest.phase).toBe("preview_paused");
  });

  it("follows ended events when the page mounts audio only after leaving idle", async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<PageLikeHookProbe />));
    expect(container.querySelector("audio")).toBeNull();

    const recorder = await openRecording();
    await finishRecorder(recorder);
    expect(latest.phase).toBe("preview_playing");

    const audio = container.querySelector<HTMLAudioElement>(
      '[data-testid="page-like-preview-audio"]',
    )!;
    await act(async () => audio.dispatchEvent(new Event("ended")));
    expect(latest.phase).toBe("preview_paused");
  });

  it("retains the preview when autoplay is rejected", async () => {
    audioPlay.mockRejectedValueOnce(new DOMException("Autoplay blocked", "NotAllowedError"));
    const recorder = await openRecording();
    await finishRecorder(recorder);

    expect(latest.phase).toBe("preview_paused");
    expect(latest.error).toBe("error.im.voice_autoplay_blocked");
    expect(latest.blob).toBeInstanceOf(Blob);
    expect(latest.previewUrl).toBe("blob:needo-voice-1");
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("retains the Blob after send failure and releases everything after success", async () => {
    const recorder = await openRecording();
    await finishRecorder(recorder);
    const blob = latest.blob;
    const previewUrl = latest.previewUrl;

    await act(async () => latest.beginSending());
    await act(async () => latest.failSending("error.im.voice_send_failed"));
    expect(latest.phase).toBe("send_error");
    expect(latest.error).toBe("error.im.voice_send_failed");
    expect(latest.blob).toBe(blob);
    expect(latest.previewUrl).toBe(previewUrl);

    await act(async () => latest.beginSending());
    await act(async () => latest.finishSending());
    expect(latest.phase).toBe("idle");
    expect(latest.blob).toBeNull();
    expect(latest.previewUrl).toBeNull();
    expect(audioPause).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(previewUrl);
  });

  it("cleans up recorder errors and permission denials with error keys", async () => {
    const recorder = await openRecording();

    await act(async () => recorder.fail());
    expect(latest.phase).toBe("idle");
    expect(latest.error).toBe("error.im.voice_recording_failed");
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    getUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    await act(async () => {
      await latest.open();
    });
    expect(latest.phase).toBe("idle");
    expect(latest.error).toBe("error.im.voice_permission_denied");
  });

  it("releases a preview exactly once on cancel and unmount", async () => {
    const recorder = await openRecording();
    await finishRecorder(recorder);

    await act(async () => latest.cancel());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(latest.phase).toBe("idle");

    await act(async () => root.unmount());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(audioPause).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});
