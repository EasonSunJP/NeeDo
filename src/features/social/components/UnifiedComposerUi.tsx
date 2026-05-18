import { useEffect, useMemo, useRef, type ChangeEvent, type ReactNode } from "react";
import { AppIcon, FloatingBackButton, FloatingCloseButton } from "../../../components/client-ui/AppScaffold";
import { InteractiveAvatar } from "../../../components/ui/InteractiveAvatar";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { cn } from "../../../lib/utils";
import type { SocialCommentPermission, SocialMediaItem, SocialProfile, SocialVisibility } from "../types";
import {
  extractCompletedHashtags,
  formatHashtagLabel,
  formatSocialCommentPermissionLabel,
  formatSocialVisibilityLabel,
  profileKey,
  socialHashtagChipClassName,
  socialImageUploadLimit
} from "../utils";

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M16.5 14.5c-.8 1.3-2.2 2-3.9 2-2.9 0-5.1-2.1-5.1-5.2s2.2-5.3 5.1-5.3c2.8 0 5 2.1 5 5.1v2.7c0 1 .7 1.6 1.5 1.6 1.3 0 2.4-1.3 2.4-3.8 0-4.8-3.7-8.1-9-8.1-5.7 0-10 4-10 9.4 0 5.5 4.3 9.5 10.1 9.5 2.1 0 4.1-.4 5.7-1.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="M15.3 11.4c0 1.9-1.1 3.2-2.8 3.2-1.5 0-2.5-1.2-2.5-3 0-2 1.2-3.4 2.8-3.4 1.5 0 2.5 1.3 2.5 3.2Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M2.5 12s3.6-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.6 5.5-9.5 5.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M5.2 17.2a7.8 7.8 0 0 1-2.1-5.3C3.1 7.5 7 4 12 4s8.9 3.5 8.9 7.9-3.9 7.9-8.9 7.9a10.2 10.2 0 0 1-3.2-.5L4 20.2l1.2-3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M8.4 11.8h7.2M8.4 14.5h4.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M5.5 7.5h13M9.5 4.5h5M9 10.5v6M15 10.5v6M7.5 7.5l.8 10.2a1.7 1.7 0 0 0 1.7 1.5h4a1.7 1.7 0 0 0 1.7-1.5l.8-10.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function SelectorLayout({
  title,
  subtitle,
  onBack,
  children,
  footer
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const hasFooter = Boolean(footer);

  return (
    <div className={cn("mx-auto w-full max-w-[720px] px-4 pt-0 text-[color:var(--client-text)] sm:px-6", hasFooter ? "pb-[calc(env(safe-area-inset-bottom)+128px)]" : "pb-10")}>
      <FloatingBackButton onClick={onBack} />
      <div className="fixed inset-x-0 top-0 z-30 border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] backdrop-blur-xl">
        <div className="safe-header-top mx-auto w-full max-w-[720px] px-4 pb-4 sm:px-6">
          <div className="flex min-h-12 items-center justify-center">
            <div className="min-w-0 flex-1 px-[56px] text-center sm:px-[60px]">
              <TitleWithInfo
                as="p"
                className="justify-center"
                info={subtitle}
                label={`${title} 说明`}
                title={title}
                titleClassName="truncate text-base font-black text-[color:var(--client-text)]"
              />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="h-[calc(env(safe-area-inset-top)+5rem)]" />
      <div className="pt-5">{children}</div>
      {footer ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 sm:px-6">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[96px] bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_82%,transparent)_36%,var(--client-bg)_100%)]"
          />
          <div className="pointer-events-auto relative mx-auto w-full max-w-[720px]">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

export function ComposerTopBar({
  onCancel,
  onPublish,
  canPublish,
  isPublishing,
  publishLabel
}: {
  onCancel: () => void;
  onPublish: () => void;
  canPublish: boolean;
  isPublishing: boolean;
  publishLabel: string;
}) {
  return (
    <>
      <FloatingCloseButton label="关闭发布动态" onClick={onCancel} />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4 sm:px-6">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[104px] bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_82%,transparent)_36%,var(--client-bg)_100%)]"
        />
        <div className="relative flex justify-center">
          <button
            className={cn(
              "pointer-events-auto inline-flex min-h-14 min-w-[180px] items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:var(--client-primary)] px-7 text-[15px] font-black text-[#090806] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_36%,transparent)] transition disabled:cursor-not-allowed",
              canPublish && !isPublishing ? "hover:translate-y-[-1px]" : "opacity-70"
            )}
            disabled={!canPublish || isPublishing}
            onClick={onPublish}
            type="button"
          >
            {isPublishing ? "发布中..." : publishLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export function ComposerTextArea({
  author,
  authorTo,
  text,
  placeholder,
  maxLength,
  hint,
  onChange,
  leading
}: {
  author?: SocialProfile;
  authorTo?: string;
  text: string;
  placeholder: string;
  maxLength?: number;
  hint?: string;
  onChange: (value: string) => void;
  leading?: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const completedHashtags = useMemo(() => extractCompletedHashtags(text).map(formatHashtagLabel).filter(Boolean), [text]);

  useEffect(() => {
    const node = textareaRef.current;

    if (!node) {
      return;
    }

    node.style.height = "0px";
    node.style.height = `${Math.max(148, node.scrollHeight)}px`;
    node.style.overflowY = "hidden";
  }, [text]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[70] border-b border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] text-[color:var(--client-text)]">
        <div className="safe-header-top mx-auto w-full max-w-[720px] px-4 pb-3 pt-3 sm:px-6">
          {author ? (
            <div className="flex items-center gap-3 pr-16">
              <InteractiveAvatar alt={author.displayName} className="h-11 w-11" src={author.avatar} to={authorTo} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">{author.displayName}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <textarea
          className="min-h-[148px] w-full resize-none border-0 bg-transparent p-0 text-[22px] leading-[1.55] tracking-[0] text-[color:var(--client-text)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_70%,var(--client-bg))] sm:text-[24px]"
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          ref={textareaRef}
          value={text}
        />
        {completedHashtags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {completedHashtags.map((tag) => (
              <span className={cn(socialHashtagChipClassName, "inline-flex items-center leading-none")} key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {maxLength ? (
          <div className="flex justify-end text-xs font-semibold text-[color:var(--client-muted)]">
            <span className={cn(text.length >= maxLength ? "text-[color:var(--client-primary)]" : undefined)}>
              {text.length}/{maxLength}
            </span>
          </div>
        ) : null}
        {leading}
        {hint ? <p className="text-sm leading-6 text-[color:var(--client-muted)]">{hint}</p> : null}
      </div>
    </>
  );
}

export function ComposerMediaGrid({
  media,
  maxMediaCount = socialImageUploadLimit,
  onOpenPicker,
  onRemove
}: {
  media: SocialMediaItem[];
  maxMediaCount?: number;
  onOpenPicker: () => void;
  onRemove: (mediaId: string) => void;
}) {
  const hasVideo = media.some((item) => item.type === "video");
  const canAdd = !hasVideo && media.length < maxMediaCount;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,104px))] gap-2">
      {media.map((item) => (
        <div
          className="group relative aspect-square overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)]"
          key={item.id}
        >
          <a className="block h-full w-full bg-[color:color-mix(in_srgb,var(--client-bg)_84%,var(--client-surface))]" href={item.url} rel="noreferrer" target="_blank">
            {item.type === "video" ? (
              <>
                <video className="h-full w-full object-cover" muted playsInline poster={item.thumbnailUrl} src={item.url} />
                <span className="absolute bottom-2 left-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[color:var(--client-text)] backdrop-blur">
                  {item.durationLabel ?? "视频"}
                </span>
              </>
            ) : (
              <img alt={item.alt ?? ""} className="h-full w-full object-cover" src={item.url} />
            )}
          </a>
          <button
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_84%,transparent)] text-[color:var(--client-text)] transition hover:text-[color:var(--client-primary)]"
            onClick={() => onRemove(item.id)}
            type="button"
          >
            <TrashIcon />
          </button>
        </div>
      ))}

      {canAdd ? (
        <button
          className="flex aspect-square items-center justify-center rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_58%,transparent)] text-[color:var(--client-muted)] transition hover:border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] hover:bg-[color:var(--client-primary-soft)] hover:text-[color:var(--client-primary)]"
          onClick={onOpenPicker}
          type="button"
        >
          <PlusIcon />
        </button>
      ) : null}
    </div>
  );
}

export function ComposerMediaPicker({
  media,
  maxMediaCount = socialImageUploadLimit,
  error,
  onFileChange,
  onOpenPicker,
  onRemove
}: {
  media: SocialMediaItem[];
  maxMediaCount?: number;
  error?: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenPicker: () => void;
  onRemove: (mediaId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasVideo = media.some((item) => item.type === "video");

  return (
    <section className="space-y-3">
      <input
        accept="image/*,video/*"
        className="hidden"
        multiple={!hasVideo}
        onChange={onFileChange}
        ref={inputRef}
        type="file"
      />
      <ComposerMediaGrid
        maxMediaCount={maxMediaCount}
        media={media}
        onOpenPicker={() => {
          inputRef.current?.click();
          onOpenPicker();
        }}
        onRemove={onRemove}
      />
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[color:var(--client-muted)]">
        <span className={cn(error ? "text-[color:var(--client-warm)]" : undefined)}>{error || "最多 9 张图片，或 1 个视频。"}</span>
        <span>{hasVideo ? "1/1" : `${media.length}/${maxMediaCount}`}</span>
      </div>
    </section>
  );
}

export function ComposerSettingItem({
  icon,
  label,
  value,
  onClick
}: {
  icon: "location" | "mention" | "visibility" | "comment";
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-[64px] w-full items-center gap-3 border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] py-3 text-left transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]"
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-primary)]">
        {icon === "location" ? <AppIcon name="map" /> : icon === "mention" ? <AtIcon /> : icon === "comment" ? <CommentIcon /> : <EyeIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[color:var(--client-text)]">{label}</span>
      </span>
      <span className="max-w-[46%] truncate text-sm font-semibold text-[color:var(--client-muted)]">{value || ""}</span>
      <span className="text-[color:var(--client-muted)]">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

export function ComposerSettingList({ children }: { children: ReactNode }) {
  return <section className="mt-2 border-y border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]">{children}</section>;
}

export function ComposerVisibilitySelector({
  value,
  onChange,
  onBack
}: {
  value: SocialVisibility;
  onChange: (value: SocialVisibility) => void;
  onBack: () => void;
}) {
  const options: Array<{ value: SocialVisibility; title: string; description: string }> = [
    { value: "public", title: "公开", description: "所有能看到这条动态的人都可见。" },
    { value: "followers", title: "仅关注可见", description: "只有关注当前发布身份的人可见。" },
    { value: "friends", title: "仅好友可见", description: "仅双方互相关注的好友可见。" },
    { value: "private", title: "仅自己可见", description: "只保留给自己查看，用作私人记录。" }
  ];

  return (
    <SelectorLayout
      footer={<SelectorConfirmButton onClick={onBack} />}
      onBack={onBack}
      subtitle="选择本条动态的可见范围"
      title="谁可以看"
    >
      <div className="space-y-3">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              className={cn(
                "w-full rounded-[24px] border px-4 py-4 text-left transition",
                active
                  ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]"
                  : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]"
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-[color:var(--client-text)]">{option.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{option.description}</p>
                </div>
                <span
                  className={cn(
                    "mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    active
                      ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] text-transparent"
                  )}
                >
                  ✓
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </SelectorLayout>
  );
}

export function ComposerCommentPermissionSelector({
  value,
  onChange,
  onBack
}: {
  value: SocialCommentPermission;
  onChange: (value: SocialCommentPermission) => void;
  onBack: () => void;
}) {
  const options: Array<{ value: SocialCommentPermission; title: string; description: string }> = [
    { value: "everyone", title: "任何人", description: "所有能看到这条动态的人都可以评论。" },
    { value: "friends", title: "仅好友", description: "只有双方互相关注的好友可以评论。" }
  ];

  return (
    <SelectorLayout
      footer={<SelectorConfirmButton onClick={onBack} />}
      onBack={onBack}
      subtitle="选择本条动态的评论权限"
      title="谁可以评论"
    >
      <div className="space-y-3">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              className={cn(
                "w-full rounded-[24px] border px-4 py-4 text-left transition",
                active
                  ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]"
                  : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]"
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-[color:var(--client-text)]">{option.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{option.description}</p>
                </div>
                <span
                  className={cn(
                    "mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    active
                      ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] text-transparent"
                  )}
                >
                  ✓
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </SelectorLayout>
  );
}

export function ComposerMentionSelector({
  profiles,
  query,
  selectedKeys,
  onQueryChange,
  onToggle,
  onBack
}: {
  profiles: SocialProfile[];
  query: string;
  selectedKeys: string[];
  onQueryChange: (value: string) => void;
  onToggle: (profileKeyValue: string) => void;
  onBack: () => void;
}) {
  return (
    <SelectorLayout
      footer={<SelectorConfirmButton onClick={onBack} />}
      onBack={onBack}
      subtitle="支持搜索并多选提醒对象"
      title="提醒谁看"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">搜索提醒对象</span>
          <input
            className="w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] px-4 py-3 text-sm text-[color:var(--client-text)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_72%,var(--client-bg))]"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索用户、技师或店铺"
            value={query}
          />
        </label>

        <div className="space-y-2">
          {profiles.length > 0 ? (
            profiles.map((profile) => {
              const key = profileKey(profile);
              const active = selectedKeys.includes(key);

              return (
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition",
                    active
                      ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]"
                  )}
                  key={profile.id}
                  onClick={() => onToggle(key)}
                  type="button"
                >
                  <AvatarImage alt={profile.displayName} className="h-12 w-12" src={profile.avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[color:var(--client-text)]">{profile.displayName}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs",
                      active
                        ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] text-transparent"
                    )}
                  >
                    ✓
                  </span>
                </button>
              );
            })
          ) : (
            <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] px-4 py-5 text-sm text-[color:var(--client-muted)]">
              没有匹配的提醒对象。
            </div>
          )}
        </div>
      </div>
    </SelectorLayout>
  );
}

export function ComposerLocationSelector({
  query,
  selectedValue,
  authorLocation,
  options,
  onQueryChange,
  onSelect,
  onBack
}: {
  query: string;
  selectedValue?: string;
  authorLocation?: string;
  options: string[];
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
  onBack: () => void;
}) {
  return (
    <SelectorLayout
      footer={<SelectorConfirmButton onClick={onBack} />}
      onBack={onBack}
      subtitle="可从常用地点里快速选择，也可搜索"
      title="所在位置"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">搜索地点</span>
          <input
            className="w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] px-4 py-3 text-sm text-[color:var(--client-text)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_72%,var(--client-bg))]"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索地点或商圈"
            value={query}
          />
        </label>

        {authorLocation ? (
          <button
            className={cn(
              "flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition",
              selectedValue === authorLocation
                ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]"
            )}
            onClick={() => onSelect(authorLocation)}
            type="button"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-primary)]">
                <AppIcon name="map" />
              </span>
              <div>
                <p className="text-sm font-black text-[color:var(--client-text)]">使用当前所在地区</p>
                <p className="mt-1 text-sm text-[color:var(--client-muted)]">{authorLocation}</p>
              </div>
            </div>
            <span className="text-[color:var(--client-muted)]">
              <ChevronRightIcon />
            </span>
          </button>
        ) : null}

        <div className="space-y-2">
          {options.map((option) => {
            const active = option === selectedValue;

            return (
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-[20px] border px-4 py-4 text-left transition",
                  active
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]"
                    : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]"
                )}
                key={option}
                onClick={() => onSelect(option)}
                type="button"
              >
                <span className="text-sm font-semibold text-[color:var(--client-text)]">{option}</span>
                <span className="text-[color:var(--client-muted)]">
                  <ChevronRightIcon />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </SelectorLayout>
  );
}

export function summarizeAudience(profiles: SocialProfile[], selectedKeys: string[]) {
  if (selectedKeys.length === 0) {
    return "";
  }

  const selectedProfiles = selectedKeys
    .map((key) => profiles.find((profile) => profileKey(profile) === key))
    .filter((profile): profile is SocialProfile => Boolean(profile));

  if (selectedProfiles.length === 0) {
    return `${selectedKeys.length} 人`;
  }

  if (selectedProfiles.length === 1) {
    return selectedProfiles[0].displayName;
  }

  return `${selectedProfiles[0].displayName} 等 ${selectedProfiles.length} 人`;
}

export function summarizeVisibility(value: SocialVisibility) {
  return formatSocialVisibilityLabel(value);
}

export function summarizeCommentPermission(value: SocialCommentPermission) {
  return formatSocialCommentPermissionLabel(value);
}

function SelectorConfirmButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="focus-ring inline-flex min-h-14 w-full items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:var(--client-primary)] px-7 text-[15px] font-black text-[#090806] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_34%,transparent)] transition hover:-translate-y-0.5"
      onClick={onClick}
      type="button"
    >
      确定并返回
    </button>
  );
}
