import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../lib/share";
import { NEEDO_SHARE_FEEDBACK_EVENT, type ShareFeedbackEvent } from "../../lib/shareFeedback";
import { cn } from "../../lib/utils";
import { Button } from "./Button";
import { TitleWithInfo } from "./TitleWithInfo";

type ToastState = {
  id: number;
  message: string;
  tone: "neutral" | "danger";
};

type ManualCopyState = {
  title: string;
  message: string;
  url: string;
};

export function ShareFeedbackViewport() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [manualCopy, setManualCopy] = useState<ManualCopyState | null>(null);
  const toastIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleFeedback = (event: Event) => {
      const detail = (event as CustomEvent<ShareFeedbackEvent>).detail;

      if (!detail) {
        return;
      }

      if (detail.type === "toast") {
        toastIdRef.current += 1;
        setToast({
          id: toastIdRef.current,
          message: detail.message,
          tone: detail.tone ?? "neutral"
        });
        return;
      }

      setManualCopy({
        title: detail.title ?? "分享链接",
        message: detail.message,
        url: detail.url
      });
    };

    window.addEventListener(NEEDO_SHARE_FEEDBACK_EVENT, handleFeedback as EventListener);
    return () => window.removeEventListener(NEEDO_SHARE_FEEDBACK_EVENT, handleFeedback as EventListener);
  }, []);

  useEffect(() => {
    if (!toast || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleCopyManualLink = async () => {
    if (!manualCopy) {
      return;
    }

    const copied = await copyTextToClipboard(manualCopy.url);
    toastIdRef.current += 1;

    if (copied) {
      setManualCopy(null);
      setToast({
        id: toastIdRef.current,
        message: "链接已复制，可以手动分享",
        tone: "neutral"
      });
      return;
    }

    setToast({
      id: toastIdRef.current,
      message: "复制失败，请长按链接后手动复制",
      tone: "danger"
    });
  };

  return (
    <>
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+22px)] z-[120] flex justify-center px-4">
          <div
            className={cn(
              "max-w-[min(92vw,420px)] rounded-full px-4 py-3 text-center text-sm font-semibold shadow-[0_20px_48px_rgba(0,0,0,0.16)] backdrop-blur-xl",
              toast.tone === "danger" ? "bg-[#a63f32] text-white" : "bg-[rgba(15,14,11,0.9)] text-white"
            )}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      {manualCopy ? (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/45 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8 backdrop-blur-sm">
          <section className="w-full max-w-[460px] rounded-[28px] border border-white/10 bg-[color:var(--client-surface)] p-5 text-[color:var(--client-text)] shadow-[0_30px_80px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-black tracking-[0.18em] text-[color:var(--client-muted)]">手动分享</p>
            <TitleWithInfo
              as="h2"
              className="mt-2"
              info={manualCopy.message}
              label={`${manualCopy.title}说明`}
              title={manualCopy.title}
              titleClassName="text-xl font-black"
            />

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">可手动复制的链接</span>
              <input
                className="h-12 w-full rounded-[18px] border border-line bg-paper px-4 text-sm font-semibold text-[color:var(--client-text)] outline-none"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={manualCopy.url}
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button onClick={handleCopyManualLink} variant="secondary">
                复制链接
              </Button>
              <Button onClick={() => setManualCopy(null)}>关闭</Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
