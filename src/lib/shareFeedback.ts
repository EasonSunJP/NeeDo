export const NEEDO_SHARE_FEEDBACK_EVENT = "needo:share-feedback";

export type ShareFeedbackEvent =
  | {
      type: "toast";
      message: string;
      tone?: "neutral" | "danger";
    }
  | {
      type: "manual-copy";
      title?: string;
      message: string;
      url: string;
    };

export function emitShareFeedback(event: ShareFeedbackEvent) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ShareFeedbackEvent>(NEEDO_SHARE_FEEDBACK_EVENT, { detail: event }));
}
