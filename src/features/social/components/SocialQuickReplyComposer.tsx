import { forwardRef, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { ImChatComposer, type ImChatComposerPanel } from "../../im/components";
import { materializeImComposerDraft } from "../../im/reaction-policy";
import { getSocialComposerErrorMessage } from "../composer-media";
import type { SocialPost, SocialProfile } from "../types";

type SocialQuickReplyComposerProps = {
  actor?: Pick<SocialProfile, "avatar" | "displayName">;
  canComment: boolean;
  onSubmit: (text: string) => SocialPost | Promise<SocialPost>;
  targetIdentity: string;
};

type SocialQuickReplyComposerStateProps = Omit<SocialQuickReplyComposerProps, "targetIdentity">;

export type SocialQuickReplyComposerHandle = {
  focus: () => void;
};

function SocialQuickReplyComposerState({
  actor,
  canComment,
  onSubmit,
  forwardedRef
}: SocialQuickReplyComposerStateProps & { forwardedRef: Ref<SocialQuickReplyComposerHandle> }) {
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<ImChatComposerPanel>(null);
  const [sending, setSending] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const richInputRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(forwardedRef, () => ({
    focus() {
      const editor = richInputRef.current;
      if (!editor) return;

      editor.focus();
      const selection = window.getSelection();
      if (!selection) return;

      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }), []);

  const submit = async () => {
    const text = materializeImComposerDraft(draft).trim();
    if (!canComment || !text || sending) return;

    setSubmissionError(null);
    setSending(true);
    try {
      await onSubmit(text);
      setDraft("");
      setPanel(null);
      setSubmissionError(null);
    } catch (error) {
      setSubmissionError(getSocialComposerErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[720px]"
      data-social-quick-reply-composer="true"
    >
      <ImChatComposer
        disabled={!canComment}
        draft={draft}
        isNight
        leadingAccessory={
          <span className="block h-10 w-10" data-social-quick-reply-avatar="true">
            <AvatarImage
              alt={actor?.displayName ?? "当前账号"}
              className="h-10 w-10 object-cover"
              src={actor?.avatar ?? ""}
            />
          </span>
        }
        onDraftChange={setDraft}
        onPanelChange={setPanel}
        onSend={() => void submit()}
        panel={panel}
        placeholder={canComment ? "发布你的回复" : "仅好友可以评论"}
        sendLabel="回复"
        sending={sending}
        sendingLabel="回复中"
        submitOnEnter
        textareaRef={richInputRef}
      />
      {submissionError ? (
        <p className="px-4 pb-2 text-sm text-[#ff8b86]" role="alert">
          {submissionError}
        </p>
      ) : null}
    </div>
  );
}

export const SocialQuickReplyComposer = forwardRef<SocialQuickReplyComposerHandle, SocialQuickReplyComposerProps>(
  function SocialQuickReplyComposer({ targetIdentity, ...props }, ref) {
    return <SocialQuickReplyComposerState forwardedRef={ref} key={targetIdentity} {...props} />;
  }
);
