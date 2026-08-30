import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const MAX_VOICE_RECORDING_SECONDS = 59;

export type ImVoiceRecordingPhase =
  | "idle"
  | "acquiring_permission"
  | "recording"
  | "preview_playing"
  | "preview_paused"
  | "sending"
  | "send_error";

export type ImVoiceRecordingStopReason = "manual" | "limit";

const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: { ideal: 1 },
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
};

interface VoiceInputTrackState {
  stream: MediaStream;
  track: MediaStreamTrack;
  hasEverUnmuted: boolean;
  onMute: () => void;
  onUnmute: () => void;
}

export interface UseImVoiceRecordingResult {
  phase: ImVoiceRecordingPhase;
  openAttempt: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  blob: Blob | null;
  previewUrl: string | null;
  durationSeconds: number;
  playbackSeconds: number;
  remainingSeconds: number;
  progress: number;
  error: string | null;
  open: () => Promise<void>;
  cancel: () => void;
  stop: (reason?: ImVoiceRecordingStopReason) => void;
  replay: () => Promise<void>;
  updatePlaybackSeconds: (currentTime: number) => void;
  handlePlaybackEnded: () => void;
  beginSending: () => void;
  finishSending: () => void;
  failSending: (errorKey: string) => void;
}

const clampDuration = (startedAt: number) =>
  Math.min(
    MAX_VOICE_RECORDING_SECONDS,
    Math.max(1, Math.floor((Date.now() - startedAt) / 1_000)),
  );

export function useImVoiceRecording(): UseImVoiceRecordingResult {
  const [phase, setPhase] = useState<ImVoiceRecordingPhase>("idle");
  const [openAttempt, setOpenAttempt] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(MAX_VOICE_RECORDING_SECONDS);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const phaseRef = useRef<ImVoiceRecordingPhase>("idle");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const previewGenerationRef = useRef(0);
  const autoPlaybackUrlRef = useRef<string | null>(null);
  const playbackAttemptRef = useRef(0);
  const startedAtRef = useRef(0);
  const stoppedDurationRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);
  const stoppedTracksRef = useRef(new WeakSet<MediaStreamTrack>());
  const voiceInputTrackRef = useRef<VoiceInputTrackState | null>(null);
  const playbackReadinessCleanupRef = useRef<(() => void) | null>(null);

  const transition = useCallback((nextPhase: ImVoiceRecordingPhase) => {
    phaseRef.current = nextPhase;
    if (mountedRef.current) {
      setPhase(nextPhase);
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (limitRef.current !== null) {
      window.clearTimeout(limitRef.current);
      limitRef.current = null;
    }
  }, []);

  const clearVoiceInputTrack = useCallback((stream?: MediaStream | null) => {
    const trackedInput = voiceInputTrackRef.current;
    if (!trackedInput || (stream && trackedInput.stream !== stream)) return;
    trackedInput.track.removeEventListener("mute", trackedInput.onMute);
    trackedInput.track.removeEventListener("unmute", trackedInput.onUnmute);
    voiceInputTrackRef.current = null;
  }, []);

  const monitorVoiceInputTrack = useCallback((stream: MediaStream) => {
    clearVoiceInputTrack();
    const track = stream.getTracks().find(
      (candidate) => candidate.kind === "audio" && candidate.readyState === "live",
    );
    if (!track) return false;

    const trackedInput: VoiceInputTrackState = {
      stream,
      track,
      hasEverUnmuted: !track.muted,
      onMute: () => undefined,
      onUnmute: () => undefined,
    };
    trackedInput.onUnmute = () => {
      trackedInput.hasEverUnmuted = true;
    };
    track.addEventListener("mute", trackedInput.onMute);
    track.addEventListener("unmute", trackedInput.onUnmute);
    voiceInputTrackRef.current = trackedInput;
    return true;
  }, [clearVoiceInputTrack]);

  const didVoiceInputStayMuted = useCallback((stream: MediaStream) => {
    const trackedInput = voiceInputTrackRef.current;
    return trackedInput?.stream === stream && !trackedInput.hasEverUnmuted;
  }, []);

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    clearVoiceInputTrack(stream);
    for (const track of stream.getTracks()) {
      if (!stoppedTracksRef.current.has(track)) {
        stoppedTracksRef.current.add(track);
        track.stop();
      }
    }
    if (streamRef.current === stream) {
      streamRef.current = null;
    }
  }, [clearVoiceInputTrack]);

  const invalidatePendingPlayback = useCallback(() => {
    playbackAttemptRef.current += 1;
    const cleanup = playbackReadinessCleanupRef.current;
    playbackReadinessCleanupRef.current = null;
    cleanup?.();
  }, []);

  const revokePreviewUrl = useCallback(() => {
    invalidatePendingPlayback();
    autoPlaybackUrlRef.current = null;
    const currentUrl = objectUrlRef.current;
    objectUrlRef.current = null;
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
  }, [invalidatePendingPlayback]);

  const pausePreview = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resetVisibleState = useCallback(() => {
    if (!mountedRef.current) return;
    setBlob(null);
    setPreviewUrl(null);
    setDurationSeconds(0);
    setPlaybackSeconds(0);
    setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS);
    setProgress(0);
    setError(null);
  }, []);

  const stop = useCallback((reason: ImVoiceRecordingStopReason = "manual") => {
    const recorder = recorderRef.current;
    if (
      phaseRef.current !== "recording" ||
      !recorder ||
      stopRequestedRef.current
    ) {
      return;
    }

    stopRequestedRef.current = true;
    clearTimers();
    const measuredDuration = clampDuration(startedAtRef.current);
    stoppedDurationRef.current = measuredDuration;
    if (mountedRef.current) {
      setDurationSeconds(measuredDuration);
      setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS - measuredDuration);
      setProgress(measuredDuration / MAX_VOICE_RECORDING_SECONDS);
    }

    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        generationRef.current += 1;
        invalidatePendingPlayback();
        recorderRef.current = null;
        stopStream(streamRef.current);
        transition("idle");
        if (mountedRef.current) setError("error.im.voice_recording_failed");
      }
    }
  }, [clearTimers, invalidatePendingPlayback, stopStream, transition]);

  const attemptPlayback = useCallback(async (
    generation: number,
    expectedUrl: string,
    resetTime: boolean,
  ) => {
    const audio = audioRef.current;
    if (
      !audio ||
      objectUrlRef.current !== expectedUrl ||
      audio.getAttribute("src") !== expectedUrl
    ) {
      return;
    }

    invalidatePendingPlayback();
    const attempt = playbackAttemptRef.current;
    const isPlaybackCurrent = () => (
      mountedRef.current &&
      playbackAttemptRef.current === attempt &&
      generationRef.current === generation &&
      objectUrlRef.current === expectedUrl &&
      (phaseRef.current === "preview_paused" ||
        phaseRef.current === "preview_playing" ||
        phaseRef.current === "send_error")
    );
    if (resetTime) audio.currentTime = 0;
    if (resetTime && mountedRef.current) setPlaybackSeconds(0);

    audio.defaultMuted = false;
    audio.muted = false;
    audio.volume = 1;
    audio.setAttribute("playsinline", "");

    let readinessFailed = false;
    try {
      if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            audio.removeEventListener("loadeddata", onReady);
            audio.removeEventListener("canplay", onReady);
            audio.removeEventListener("error", onError);
            if (playbackReadinessCleanupRef.current === cleanup) {
              playbackReadinessCleanupRef.current = null;
            }
          };
          const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback();
          };
          const onReady = () => settle(resolve);
          const onError = () => {
            readinessFailed = true;
            settle(() => reject(new DOMException(
              "Preview media could not be loaded",
              "NotSupportedError",
            )));
          };
          playbackReadinessCleanupRef.current = () => settle(() => reject(new DOMException(
            "Preview playback was cancelled",
            "AbortError",
          )));
          audio.addEventListener("loadeddata", onReady, { once: true });
          audio.addEventListener("canplay", onReady, { once: true });
          audio.addEventListener("error", onError, { once: true });
        });
      }
      if (!isPlaybackCurrent()) return;
      await audio.play();
      if (isPlaybackCurrent()) {
        setError(null);
        transition("preview_playing");
      }
    } catch {
      if (isPlaybackCurrent()) {
        setError(readinessFailed
          ? "error.im.voice_recording_failed"
          : "error.im.voice_autoplay_blocked");
        transition("preview_paused");
      }
    }
  }, [invalidatePendingPlayback, transition]);

  const open = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    setOpenAttempt((attempt) => attempt + 1);

    const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      if (mountedRef.current) setError("error.im.voice_unsupported");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    invalidatePendingPlayback();
    stopRequestedRef.current = false;
    stoppedDurationRef.current = 0;
    startedAtRef.current = 0;
    if (mountedRef.current) {
      setError(null);
      setBlob(null);
      setPreviewUrl(null);
      setDurationSeconds(0);
      setPlaybackSeconds(0);
      setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS);
      setProgress(0);
    }
    transition("acquiring_permission");

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: VOICE_AUDIO_CONSTRAINTS });
    } catch {
      if (mountedRef.current && generationRef.current === generation) {
        transition("idle");
        setError("error.im.voice_permission_denied");
      }
      return;
    }

    if (!mountedRef.current || generationRef.current !== generation) {
      stopStream(stream);
      return;
    }

    if (!monitorVoiceInputTrack(stream)) {
      stopStream(stream);
      transition("idle");
      if (mountedRef.current && generationRef.current === generation) {
        setError("error.im.voice_recording_failed");
      }
      return;
    }
    streamRef.current = stream;
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stopStream(stream);
      transition("idle");
      if (mountedRef.current) setError("error.im.voice_recording_failed");
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (
        mountedRef.current &&
        generationRef.current === generation &&
        event.data.size > 0
      ) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      stopStream(stream);
      clearTimers();
      if (
        !mountedRef.current ||
        generationRef.current !== generation ||
        recorderRef.current !== recorder
      ) {
        return;
      }
      generationRef.current += 1;
      invalidatePendingPlayback();
      recorderRef.current = null;
      stopRequestedRef.current = true;
      transition("idle");
      setError("error.im.voice_recording_failed");
    };

    recorder.onstop = () => {
      const inputStayedMuted = didVoiceInputStayMuted(stream);
      stopStream(stream);
      clearTimers();
      if (
        !mountedRef.current ||
        generationRef.current !== generation ||
        recorderRef.current !== recorder
      ) {
        return;
      }

      recorderRef.current = null;
      const measuredDuration =
        stoppedDurationRef.current || clampDuration(startedAtRef.current);
      stoppedDurationRef.current = measuredDuration;
      if (inputStayedMuted) {
        generationRef.current += 1;
        invalidatePendingPlayback();
        setBlob(null);
        setPreviewUrl(null);
        setDurationSeconds(0);
        setPlaybackSeconds(0);
        setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS);
        setProgress(0);
        setError("error.im.voice_input_muted");
        transition("idle");
        return;
      }
      const recordedBlob = new Blob(chunks, {
        type: recorder.mimeType || chunks[0]?.type || "audio/webm",
      });
      if (chunks.length === 0 || recordedBlob.size === 0) {
        generationRef.current += 1;
        invalidatePendingPlayback();
        setBlob(null);
        setPreviewUrl(null);
        setDurationSeconds(0);
        setPlaybackSeconds(0);
        setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS);
        setProgress(0);
        setError("error.im.voice_recording_failed");
        transition("idle");
        return;
      }

      const url = URL.createObjectURL(recordedBlob);
      playbackAttemptRef.current += 1;
      autoPlaybackUrlRef.current = null;
      previewGenerationRef.current = generation;
      objectUrlRef.current = url;
      setBlob(recordedBlob);
      setPreviewUrl(url);
      setDurationSeconds(measuredDuration);
      setPlaybackSeconds(0);
      setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS - measuredDuration);
      setProgress(measuredDuration / MAX_VOICE_RECORDING_SECONDS);
      setError(null);
      transition("preview_paused");
    };

    try {
      recorder.start();
    } catch {
      recorderRef.current = null;
      stopStream(stream);
      transition("idle");
      setError("error.im.voice_recording_failed");
      return;
    }

    startedAtRef.current = Date.now();
    transition("recording");
    tickRef.current = window.setInterval(() => {
      if (
        !mountedRef.current ||
        generationRef.current !== generation ||
        phaseRef.current !== "recording"
      ) {
        return;
      }
      const elapsed = Math.min(
        MAX_VOICE_RECORDING_SECONDS,
        Math.floor((Date.now() - startedAtRef.current) / 1_000),
      );
      setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS - elapsed);
      setProgress(elapsed / MAX_VOICE_RECORDING_SECONDS);
    }, 250);
    limitRef.current = window.setTimeout(() => {
      stop("limit");
    }, MAX_VOICE_RECORDING_SECONDS * 1_000);
  }, [clearTimers, didVoiceInputStayMuted, invalidatePendingPlayback, monitorVoiceInputTrack, stop, stopStream, transition]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    invalidatePendingPlayback();
    clearTimers();
    pausePreview();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive" && !stopRequestedRef.current) {
      stopRequestedRef.current = true;
      try {
        recorder.stop();
      } catch {
        // The owned stream is still released below.
      }
    }
    stopStream(streamRef.current);
    revokePreviewUrl();
    transition("idle");
    resetVisibleState();
  }, [clearTimers, invalidatePendingPlayback, pausePreview, resetVisibleState, revokePreviewUrl, stopStream, transition]);

  const replay = useCallback(async () => {
    if (
      phaseRef.current !== "preview_paused" &&
      phaseRef.current !== "preview_playing" &&
      phaseRef.current !== "send_error"
    ) {
      return;
    }
    const currentUrl = objectUrlRef.current;
    if (!currentUrl) return;
    await attemptPlayback(generationRef.current, currentUrl, true);
  }, [attemptPlayback]);

  const updatePlaybackSeconds = useCallback((currentTime: number) => {
    if (
      phaseRef.current !== "preview_paused" &&
      phaseRef.current !== "preview_playing" &&
      phaseRef.current !== "send_error"
    ) {
      return;
    }
    const total = stoppedDurationRef.current;
    if (!Number.isFinite(currentTime) || total <= 0) return;
    setPlaybackSeconds(Math.min(total, Math.max(0, currentTime)));
  }, []);

  const handlePlaybackEnded = useCallback(() => {
    if (
      phaseRef.current !== "preview_paused" &&
      phaseRef.current !== "preview_playing" &&
      phaseRef.current !== "send_error"
    ) {
      return;
    }
    setPlaybackSeconds(stoppedDurationRef.current);
    if (phaseRef.current === "preview_playing") {
      invalidatePendingPlayback();
      transition("preview_paused");
    }
  }, [invalidatePendingPlayback, transition]);

  const beginSending = useCallback(() => {
    if (
      phaseRef.current !== "preview_paused" &&
      phaseRef.current !== "preview_playing" &&
      phaseRef.current !== "send_error"
    ) {
      return;
    }
    invalidatePendingPlayback();
    transition("sending");
    setError(null);
    pausePreview();
  }, [invalidatePendingPlayback, pausePreview, transition]);

  const finishSending = useCallback(() => {
    if (phaseRef.current !== "sending") return;
    generationRef.current += 1;
    clearTimers();
    pausePreview();
    stopStream(streamRef.current);
    revokePreviewUrl();
    transition("idle");
    resetVisibleState();
  }, [clearTimers, pausePreview, resetVisibleState, revokePreviewUrl, stopStream, transition]);

  const failSending = useCallback((errorKey: string) => {
    if (phaseRef.current !== "sending") return;
    setError(errorKey);
    transition("send_error");
  }, [transition]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const markPaused = () => {
      if (phaseRef.current === "preview_playing") {
        invalidatePendingPlayback();
        transition("preview_paused");
      }
    };
    audio.addEventListener("pause", markPaused);
    return () => {
      audio.removeEventListener("pause", markPaused);
    };
  }, [invalidatePendingPlayback, phase, transition]);

  useEffect(() => {
    const currentUrl = previewUrl;
    if (
      !currentUrl ||
      objectUrlRef.current !== currentUrl ||
      autoPlaybackUrlRef.current === currentUrl ||
      phaseRef.current !== "preview_paused"
    ) {
      return;
    }
    autoPlaybackUrlRef.current = currentUrl;
    void attemptPlayback(previewGenerationRef.current, currentUrl, false);
  }, [attemptPlayback, previewUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      invalidatePendingPlayback();
      clearTimers();
      pausePreview();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive" && !stopRequestedRef.current) {
        stopRequestedRef.current = true;
        try {
          recorder.stop();
        } catch {
          // The owned stream and URL are still released below.
        }
      }
      stopStream(streamRef.current);
      revokePreviewUrl();
    };
  }, [clearTimers, invalidatePendingPlayback, pausePreview, revokePreviewUrl, stopStream]);

  return {
    phase,
    openAttempt,
    audioRef,
    blob,
    previewUrl,
    durationSeconds,
    playbackSeconds,
    remainingSeconds,
    progress,
    error,
    open,
    cancel,
    stop,
    replay,
    updatePlaybackSeconds,
    handlePlaybackEnded,
    beginSending,
    finishSending,
    failSending,
  };
}
