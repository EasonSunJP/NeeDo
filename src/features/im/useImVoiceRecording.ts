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

export interface UseImVoiceRecordingResult {
  phase: ImVoiceRecordingPhase;
  audioRef: RefObject<HTMLAudioElement | null>;
  blob: Blob | null;
  previewUrl: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  progress: number;
  error: string | null;
  open: () => Promise<void>;
  cancel: () => void;
  stop: (reason?: ImVoiceRecordingStopReason) => void;
  replay: () => Promise<void>;
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
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
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

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (!stoppedTracksRef.current.has(track)) {
        stoppedTracksRef.current.add(track);
        track.stop();
      }
    }
    if (streamRef.current === stream) {
      streamRef.current = null;
    }
  }, []);

  const revokePreviewUrl = useCallback(() => {
    playbackAttemptRef.current += 1;
    autoPlaybackUrlRef.current = null;
    const currentUrl = objectUrlRef.current;
    objectUrlRef.current = null;
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
  }, []);

  const pausePreview = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resetVisibleState = useCallback(() => {
    if (!mountedRef.current) return;
    setBlob(null);
    setPreviewUrl(null);
    setDurationSeconds(0);
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
        recorderRef.current = null;
        stopStream(streamRef.current);
        transition("idle");
        if (mountedRef.current) setError("error.im.voice_recording_failed");
      }
    }
  }, [clearTimers, stopStream, transition]);

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

    const attempt = playbackAttemptRef.current + 1;
    playbackAttemptRef.current = attempt;
    if (resetTime) audio.currentTime = 0;
    try {
      await audio.play();
      if (
        mountedRef.current &&
        playbackAttemptRef.current === attempt &&
        generationRef.current === generation &&
        objectUrlRef.current === expectedUrl &&
        (phaseRef.current === "preview_paused" ||
          phaseRef.current === "preview_playing")
      ) {
        setError(null);
        transition("preview_playing");
      }
    } catch {
      if (
        mountedRef.current &&
        playbackAttemptRef.current === attempt &&
        generationRef.current === generation &&
        objectUrlRef.current === expectedUrl &&
        (phaseRef.current === "preview_paused" ||
          phaseRef.current === "preview_playing")
      ) {
        setError("error.im.voice_autoplay_blocked");
        transition("preview_paused");
      }
    }
  }, [transition]);

  const open = useCallback(async () => {
    if (phaseRef.current !== "idle") return;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    stopRequestedRef.current = false;
    stoppedDurationRef.current = 0;
    startedAtRef.current = 0;
    if (mountedRef.current) {
      setError(null);
      setBlob(null);
      setPreviewUrl(null);
      setDurationSeconds(0);
      setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS);
      setProgress(0);
    }
    transition("acquiring_permission");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      recorderRef.current = null;
      stopRequestedRef.current = true;
      transition("idle");
      setError("error.im.voice_recording_failed");
    };

    recorder.onstop = () => {
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
      const recordedBlob = new Blob(chunks, {
        type: recorder.mimeType || chunks[0]?.type || "audio/webm",
      });
      if (chunks.length === 0 || recordedBlob.size === 0) {
        generationRef.current += 1;
        playbackAttemptRef.current += 1;
        setBlob(null);
        setPreviewUrl(null);
        setDurationSeconds(0);
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
  }, [clearTimers, stop, stopStream, transition]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
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
  }, [clearTimers, pausePreview, resetVisibleState, revokePreviewUrl, stopStream, transition]);

  const replay = useCallback(async () => {
    if (
      phaseRef.current !== "preview_paused" &&
      phaseRef.current !== "preview_playing"
    ) {
      return;
    }
    const currentUrl = objectUrlRef.current;
    if (!currentUrl) return;
    await attemptPlayback(generationRef.current, currentUrl, true);
  }, [attemptPlayback]);

  const beginSending = useCallback(() => {
    if (
      phaseRef.current !== "preview_paused" &&
      phaseRef.current !== "preview_playing" &&
      phaseRef.current !== "send_error"
    ) {
      return;
    }
    playbackAttemptRef.current += 1;
    transition("sending");
    setError(null);
    pausePreview();
  }, [pausePreview, transition]);

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
        playbackAttemptRef.current += 1;
        transition("preview_paused");
      }
    };
    audio.addEventListener("pause", markPaused);
    audio.addEventListener("ended", markPaused);
    return () => {
      audio.removeEventListener("pause", markPaused);
      audio.removeEventListener("ended", markPaused);
    };
  }, [transition]);

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
      playbackAttemptRef.current += 1;
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
  }, [clearTimers, pausePreview, revokePreviewUrl, stopStream]);

  return {
    phase,
    audioRef,
    blob,
    previewUrl,
    durationSeconds,
    remainingSeconds,
    progress,
    error,
    open,
    cancel,
    stop,
    replay,
    beginSending,
    finishSending,
    failSending,
  };
}
