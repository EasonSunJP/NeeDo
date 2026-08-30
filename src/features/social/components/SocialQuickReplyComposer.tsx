import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type Ref
} from "react";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import {
  ImChatComposer,
  type ImChatComposerAction,
  type ImChatComposerPanel
} from "../../im/components";
import { serializeImComposerMessage } from "../../im/reaction-policy";
import { realtimeApi } from "../../realtime/api";
import { buildSocialLocationOptions } from "../composer-location";
import {
  getSocialComposerErrorMessage,
  getSocialImageValidationError
} from "../composer-media";
import type {
  SocialMediaItem,
  SocialPost,
  SocialProfile,
  SocialQuickReplySubmitInput
} from "../types";
import { nextId } from "../utils";
import { ComposerLocationSelector } from "./UnifiedComposerUi";

type SocialQuickReplyComposerProps = {
  actor?: Pick<SocialProfile, "avatar" | "displayName" | "location">;
  canComment: boolean;
  onSubmit: (input: SocialQuickReplySubmitInput) => SocialPost | Promise<SocialPost>;
  targetIdentity: string;
};

type SocialQuickReplyComposerStateProps = Omit<SocialQuickReplyComposerProps, "targetIdentity">;

type PendingReplyImage = {
  file: File;
  fileName: string;
  media?: SocialMediaItem;
  ownsObjectUrl: boolean;
  previewUrl: string;
  requestId: number;
  status: "uploading" | "failed" | "uploaded";
};

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
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingReplyImage | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [locationCandidate, setLocationCandidate] = useState("");
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const richInputRef = useRef<HTMLDivElement | null>(null);
  const locationCandidateRef = useRef("");
  const pendingImageRef = useRef<PendingReplyImage | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const updatePendingImage = useCallback((next: PendingReplyImage | null) => {
    pendingImageRef.current = next;
    setPendingImage(next);
  }, []);

  const revokePendingPreview = useCallback((image: PendingReplyImage | null) => {
    if (image?.ownsObjectUrl) {
      URL.revokeObjectURL(image.previewUrl);
    }
  }, []);

  const clearPendingImage = useCallback(() => {
    requestIdRef.current += 1;
    revokePendingPreview(pendingImageRef.current);
    updatePendingImage(null);
    setImageError(null);
  }, [revokePendingPreview, updatePendingImage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      revokePendingPreview(pendingImageRef.current);
      pendingImageRef.current = null;
    };
  }, [revokePendingPreview]);

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

  const uploadImage = useCallback(async (image: PendingReplyImage) => {
    const requestId = ++requestIdRef.current;
    const uploadingImage: PendingReplyImage = {
      ...image,
      media: undefined,
      requestId,
      status: "uploading"
    };
    updatePendingImage(uploadingImage);
    setImageError(null);

    try {
      const uploaded = await realtimeApi.uploadSocialMedia(image.file);
      const current = pendingImageRef.current;
      if (!mountedRef.current || !current || current.requestId !== requestId) {
        return;
      }

      revokePendingPreview(current);
      updatePendingImage({
        ...current,
        media: {
          id: nextId("quick-reply-media"),
          type: "image",
          url: uploaded.url,
          mediaAssetPublicId: uploaded.publicId,
          alt: current.fileName
        },
        ownsObjectUrl: false,
        previewUrl: uploaded.url,
        status: "uploaded"
      });
    } catch (error) {
      const current = pendingImageRef.current;
      if (!mountedRef.current || !current || current.requestId !== requestId) {
        return;
      }

      updatePendingImage({ ...current, status: "failed" });
      setImageError(getSocialComposerErrorMessage(error));
    }
  }, [revokePendingPreview, updatePendingImage]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (!canComment || sending) {
      input.value = "";
      return;
    }
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const validationError = getSocialImageValidationError(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }

    requestIdRef.current += 1;
    revokePendingPreview(pendingImageRef.current);
    const next: PendingReplyImage = {
      file,
      fileName: file.name,
      ownsObjectUrl: true,
      previewUrl: URL.createObjectURL(file),
      requestId: 0,
      status: "uploading"
    };
    void uploadImage(next);
    setPanel(null);
  };

  const submit = async () => {
    const serialized = serializeImComposerMessage(draft);
    const text = serialized.content.trim();
    const uploadedMedia = pendingImageRef.current?.status === "uploaded"
      ? pendingImageRef.current.media
      : undefined;
    const uploadPending = pendingImageRef.current?.status === "uploading";
    if (!canComment || sending || uploadPending || (!text && !uploadedMedia)) return;

    setSubmissionError(null);
    setSending(true);
    try {
      await onSubmit({
        text,
        richText: serialized.richText,
        media: uploadedMedia ? [uploadedMedia] : [],
        locationLabel: locationLabel || undefined
      });
      setDraft("");
      setPanel(null);
      setLocationLabel("");
      locationCandidateRef.current = "";
      setLocationCandidate("");
      setLocationQuery("");
      clearPendingImage();
      setSubmissionError(null);
    } catch (error) {
      setSubmissionError(getSocialComposerErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const openLocation = () => {
    if (!canComment || sending) return;
    locationCandidateRef.current = locationLabel;
    setLocationCandidate(locationLabel);
    setLocationOpen(true);
  };
  const cancelLocation = () => {
    locationCandidateRef.current = locationLabel;
    setLocationCandidate(locationLabel);
    setLocationOpen(false);
  };
  const confirmLocation = () => {
    setLocationLabel(locationCandidateRef.current);
    setLocationOpen(false);
  };
  const selectLocationCandidate = (value: string) => {
    locationCandidateRef.current = value;
    setLocationCandidate(value);
  };
  const actions: ImChatComposerAction[] = [
    { key: "image", label: "相册", icon: "photo", run: () => albumInputRef.current?.click() },
    { key: "camera", label: "拍照", icon: "camera", run: () => cameraInputRef.current?.click() },
    { key: "location", label: "位置", icon: "location", run: openLocation }
  ];
  const uploadPending = pendingImage?.status === "uploading";
  const composerDisabled = !canComment || sending;

  if (locationOpen) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-[color:var(--client-bg)]" data-social-quick-reply-location="true">
        <ComposerLocationSelector
          authorLocation={actor?.location}
          onBack={cancelLocation}
          onConfirm={confirmLocation}
          onQueryChange={setLocationQuery}
          onSelect={selectLocationCandidate}
          options={buildSocialLocationOptions(actor?.location, locationQuery)}
          query={locationQuery}
          selectedValue={locationCandidate}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[720px]"
      data-social-quick-reply-composer="true"
    >
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="相册"
        className="hidden"
        disabled={composerDisabled}
        onChange={handleImageChange}
        ref={albumInputRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="拍照"
        capture="environment"
        className="hidden"
        disabled={composerDisabled}
        onChange={handleImageChange}
        ref={cameraInputRef}
        type="file"
      />
      {locationLabel ? (
        <div className="mx-3 flex items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-white/10 bg-black/[0.82] px-4 py-2 text-sm text-white">
          <span className="min-w-0 truncate"><span>已选位置</span>：{locationLabel}</span>
          <button
            aria-label="移除位置"
            className="focus-ring shrink-0 text-xs font-semibold text-[#d1ff4d]"
            disabled={composerDisabled}
            onClick={() => {
              setLocationLabel("");
              locationCandidateRef.current = "";
              setLocationCandidate("");
            }}
            type="button"
          >
            移除位置
          </button>
        </div>
      ) : null}
      {pendingImage ? (
        <div className="mx-3 flex items-center justify-between gap-3 border border-b-0 border-white/10 bg-black/[0.82] px-4 py-2 text-sm text-white">
          <span>{pendingImage.status === "uploading" ? "图片上传中" : pendingImage.status === "failed" ? "上传失败" : pendingImage.fileName}</span>
          <span className="flex shrink-0 items-center gap-3">
            {pendingImage.status === "failed" ? (
              <button
                className="focus-ring text-xs font-semibold text-[#d1ff4d]"
                disabled={composerDisabled}
                onClick={() => void uploadImage(pendingImage)}
                type="button"
              >
                重试图片
              </button>
            ) : null}
            <button
              aria-label="移除图片"
              className="focus-ring text-xs font-semibold text-[#d1ff4d]"
              disabled={composerDisabled}
              onClick={clearPendingImage}
              type="button"
            >
              移除图片
            </button>
          </span>
        </div>
      ) : null}
      <ImChatComposer
        actions={actions}
        disabled={composerDisabled}
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
        nativeDisabledInput={!canComment}
        onDraftChange={(value) => {
          if (!sending) setDraft(value);
        }}
        onPanelChange={setPanel}
        onRemovePendingImage={clearPendingImage}
        onSend={() => void submit()}
        panel={panel}
        pendingImage={pendingImage ? { fileName: pendingImage.fileName, previewUrl: pendingImage.previewUrl } : undefined}
        placeholder={canComment ? "发布你的回复" : "仅好友可以评论"}
        sendLabel="回复"
        sending={sending || uploadPending}
        sendingLabel={uploadPending ? "图片上传中" : "回复中"}
        submitOnEnter
        textareaRef={richInputRef}
        voiceInputAriaLabel="录制语音"
      />
      {imageError ? (
        <p className="px-4 pb-2 text-sm text-[#ff8b86]" role="alert">
          {imageError}
        </p>
      ) : null}
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
