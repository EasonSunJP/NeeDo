import { useState } from "react";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { ImChatComposer, type ImChatComposerPanel } from "../../im/components";
import { materializeImComposerDraft } from "../../im/reaction-policy";
import type { SocialPost, SocialProfile } from "../types";

export function SocialQuickReplyComposer({
  actor,
  canComment,
  onOpenFullComposer,
  onSubmit
}: {
  actor?: Pick<SocialProfile, "avatar" | "displayName">;
  canComment: boolean;
  onOpenFullComposer: () => void;
  onSubmit: (text: string) => SocialPost | Promise<SocialPost>;
}) {
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<ImChatComposerPanel>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const text = materializeImComposerDraft(draft).trim();
    if (!canComment || !text || sending) return;

    setSending(true);
    try {
      await onSubmit(text);
      setDraft("");
      setPanel(null);
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
        moreAction={{ ariaLabel: "打开完整回复", run: onOpenFullComposer }}
        onDraftChange={setDraft}
        onPanelChange={setPanel}
        onSend={() => void submit()}
        panel={panel}
        placeholder={canComment ? "发布你的回复" : "仅好友可以评论"}
        sendLabel="回复"
        sending={sending}
        sendingLabel="回复中"
      />
    </div>
  );
}
