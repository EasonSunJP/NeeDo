import type { KeyboardEvent as ReactKeyboardEvent, ReactEventHandler, RefObject } from "react";
import { ImIcon } from "./components";
import type { ImVoiceRecordingPhase } from "./useImVoiceRecording";

export type ImVoiceRecordingOverlayCopy = {
  acquiringPermission: string;
  cancelAriaLabel: string;
  deleteAriaLabel: string;
  previewPaused: string;
  previewPlaying: string;
  replayAriaLabel: string;
  remainingRecording: (remainingSeconds: number) => string;
  sendAriaLabel: string;
  sendingAriaLabel: string;
  stopAriaLabel: string;
};

export function ImVoiceRecordingOverlay({
  audioRef,
  copy,
  durationSeconds,
  error,
  onCancel,
  onDelete,
  onPreviewEnded,
  onReplay,
  onSend,
  onStop,
  onTimeUpdate,
  phase,
  previewUrl,
  remainingSeconds,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  copy: ImVoiceRecordingOverlayCopy;
  durationSeconds: number;
  error: string | null;
  onCancel: () => void;
  onDelete: () => void;
  onPreviewEnded: ReactEventHandler<HTMLAudioElement>;
  onReplay: () => void;
  onSend: () => void;
  onStop: () => void;
  onTimeUpdate: ReactEventHandler<HTMLAudioElement>;
  phase: ImVoiceRecordingPhase;
  previewUrl: string | null;
  remainingSeconds: number;
}) {
  if (phase === "idle") return null;

  const isRecording = phase === "acquiring_permission" || phase === "recording";
  const isSending = phase === "sending";
  const bubbleText = phase === "acquiring_permission"
    ? copy.acquiringPermission
    : phase === "recording"
      ? copy.remainingRecording(remainingSeconds)
      : phase === "preview_playing"
        ? copy.previewPlaying
        : phase === "send_error" && error
          ? error
          : copy.previewPaused;

  const handleEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || isSending) return;
    event.preventDefault();
    if (isRecording) {
      onCancel();
    } else {
      onDelete();
    }
  };

  return (
    <section
      aria-labelledby="im-voice-recording-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex flex-col bg-black/55 px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[max(72px,env(safe-area-inset-top))] backdrop-blur-[10px] motion-reduce:transition-none"
      data-im-voice-recording-overlay="true"
      onKeyDown={handleEscape}
      role="dialog"
    >
      <div
        className="relative mx-auto mt-[8vh] flex min-h-[112px] w-full max-w-[420px] items-center justify-center rounded-[28px] bg-[#91ed63] px-6 text-center text-[#245629] shadow-[0_18px_54px_rgba(0,0,0,0.28)]"
        data-im-voice-bubble="true"
        data-im-voice-duration-seconds={durationSeconds}
      >
        <span aria-hidden="true" className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 bg-[#91ed63]" />
        <p aria-live="polite" className="relative text-xl font-black tabular-nums" id="im-voice-recording-title">
          {bubbleText}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-center gap-5" data-im-voice-recording-actions="true">
        {isRecording ? (
          <>
            <button
              aria-label={copy.cancelAriaLabel}
              autoFocus
              className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/72 text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition motion-reduce:transition-none"
              onClick={onCancel}
              type="button"
            >
              <ImIcon name="close" />
            </button>
            <button
              aria-label={copy.stopAriaLabel}
              className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/72 text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition motion-reduce:transition-none"
              onClick={onStop}
              type="button"
            >
              <span aria-hidden="true" className="h-4 w-4 rounded-[3px] bg-current" />
            </button>
          </>
        ) : (
          <>
            <button
              aria-label={copy.deleteAriaLabel}
              autoFocus
              className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/72 text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending}
              onClick={onDelete}
              type="button"
            >
              <ImIcon name="delete" />
            </button>
            <button
              aria-label={copy.replayAriaLabel}
              className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/72 text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending}
              onClick={onReplay}
              type="button"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path d="M7 8.5a7 7 0 1 1-1 8.9" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
                <path d="M5 5.5v4h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
              </svg>
            </button>
            <button
              aria-busy={isSending || undefined}
              aria-label={isSending ? copy.sendingAriaLabel : copy.sendAriaLabel}
              className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/72 text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending}
              onClick={onSend}
              type="button"
            >
              {isSending ? (
                <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" />
              ) : (
                <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <path d="m4 4 16 8-16 8 3.2-8L4 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
                  <path d="M7.2 12H20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>

      <audio className="sr-only" onEnded={onPreviewEnded} onTimeUpdate={onTimeUpdate} ref={audioRef} src={previewUrl ?? undefined} />
    </section>
  );
}
