import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AvatarImage } from "../ui/AvatarImage";
import { cn } from "../../lib/utils";
import { ContactGroupIcon } from "./ContactGroupIcon";
import { ConversationListCard } from "./ConversationListCard";
import { SectionTitle } from "./SectionTitle";
import { Badge, type BadgeTone } from "../ui/Badge";
import { NotificationBadge } from "../ui/NotificationBadge";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { SocialProfileMiniCard, type InfoCardData, type InfoCardVariant, type SocialProfileMiniActionLabel } from "../../shared/profile-card";

export type ContactShortcut = {
  id: string;
  title: string;
  caption: string;
  icon: string;
  tone: string;
  badge?: string | number;
  active?: boolean;
  onClick?: () => void;
};

export type CustomContactCategory = {
  id: string;
  title: string;
  ruleTags: string[];
  createdAt: number;
  updatedAt: number;
};

export type ContactShortcutPanelItem = {
  id: string;
  title: string;
  caption: string;
  meta?: string;
  avatar?: string;
  icon?: string;
  badge?: string;
  to?: string;
  onClick?: () => void;
  entityCardData?: InfoCardData;
  entityCardVariant?: InfoCardVariant;
};

export type DirectoryContactItem = {
  id: string;
  systemId?: string;
  name: string;
  username?: string;
  remark: string;
  avatar: string;
  title: string;
  badgeTone?: BadgeTone;
  tags: string[];
  meta: string;
  todayPriority?: boolean;
  to: string;
  entityCardData?: InfoCardData;
  entityCardVariant?: InfoCardVariant;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    tone?: "primary" | "secondary";
  };
};

const directoryActionRevealWidth = 192;

function getMiniCardActionLabel(label?: string): SocialProfileMiniActionLabel | undefined {
  if (!label) {
    return undefined;
  }

  if (label.includes("好友")) {
    return "好友";
  }

  if (label.includes("取消") || label.includes("已") || label.includes("关注中")) {
    return "关注中";
  }

  return "关注";
}

function getPinnedDirectoryContactsKey(storageKey: string) {
  return `needo-directory-pinned-${storageKey}`;
}

function getDeletedDirectoryContactsKey(storageKey: string) {
  return `needo-directory-deleted-${storageKey}`;
}

function getCustomCategoriesKey(storageKey: string) {
  return `needo-directory-custom-categories-${storageKey}`;
}

function readDirectoryMeta<T>(storageKey: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function ContactShortcutGrid({ shortcuts }: { shortcuts: ContactShortcut[] }) {
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({});

  return (
    <div className="-mx-1 overflow-hidden">
      <div
        {...dragScrollProps}
        className="flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none]"
        ref={scrollRef}
        style={{ touchAction: "pan-y" }}
      >
      {shortcuts.map((shortcut) => (
        <button
          className={cn(
            "relative w-[112px] shrink-0 rounded-lg border px-2 py-3 text-center transition",
            shortcut.active ? "border-moss bg-mint/15 shadow-panel" : "border-transparent bg-paper"
          )}
          key={shortcut.id}
          onClick={shortcut.onClick}
          type="button"
        >
          {typeof shortcut.badge === "number" && shortcut.badge > 0 ? (
            <NotificationBadge className="absolute right-2 top-2" count={shortcut.badge} size="sm" />
          ) : shortcut.badge ? (
            <span className="absolute right-2 top-2 rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
              {shortcut.badge}
            </span>
          ) : null}
          <span className={cn("mx-auto grid h-12 w-12 place-items-center rounded-[16px] text-sm font-black", shortcut.tone)}>
            <ContactGroupIcon id={shortcut.icon} label={shortcut.title} />
          </span>
          <strong className="mt-2 block text-[11px] leading-4">{shortcut.title}</strong>
          <span className="mt-1 block text-[10px] leading-4 text-ink/45">{shortcut.caption}</span>
        </button>
      ))}
      </div>
    </div>
  );
}

export function ContactShortcutPanel({
  title,
  caption,
  items,
  onClose,
  actions
}: {
  title: string;
  caption: string;
  items: ContactShortcutPanelItem[];
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <SectionTitle caption={caption} title={title}>
        {actions}
        <button
          className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-black text-ink/65"
          onClick={onClose}
          type="button"
        >
          收起
        </button>
      </SectionTitle>

      <div className="mt-3 space-y-3">
        {items.map((item) => {
          if (item.entityCardData) {
            if (item.onClick) {
              return (
                <SocialProfileMiniCard
                  data={item.entityCardData}
                  key={item.id}
                  onOpenDetails={item.onClick}
                />
              );
            }

            return (
              <SocialProfileMiniCard
                data={item.entityCardData}
                detailTo={item.entityCardData.detailPath ?? item.to}
                key={item.id}
              />
            );
          }

          const content = (
            <div className="flex items-start gap-3">
              <span className="avatar-frame grid h-12 w-12 shrink-0 place-items-center bg-[#171717] text-lemon">
                {item.avatar ? (
                  <AvatarImage alt={item.title} className="h-full w-full" src={item.avatar} />
                ) : (
                  <ContactGroupIcon id={item.icon} label={item.title} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-black">{item.title}</h3>
                    <p className="mt-1 text-xs text-ink/50">{item.caption}</p>
                  </div>
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <NotificationBadge count={item.badge} size="sm" />
                  ) : item.badge ? (
                    <Badge tone="neutral">{item.badge}</Badge>
                  ) : null}
                </div>
                {item.meta ? <p className="mt-2 text-xs leading-5 text-ink/45">{item.meta}</p> : null}
              </div>
            </div>
          );

          if (item.to) {
            return (
              <Link className="block rounded-lg bg-paper p-3" key={item.id} to={item.to}>
                {content}
              </Link>
            );
          }

          if (item.onClick) {
            return (
              <button className="block w-full rounded-lg bg-paper p-3 text-left" key={item.id} onClick={item.onClick} type="button">
                {content}
              </button>
            );
          }

          return (
            <article className="rounded-lg bg-paper p-3" key={item.id}>
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function matchesCustomContactCategory(contact: DirectoryContactItem, category: CustomContactCategory) {
  if (category.ruleTags.length === 0) {
    return false;
  }

  return contact.tags.some((tag) => category.ruleTags.includes(tag));
}

export function useCustomContactCategories(storageKey: string) {
  const [categories, setCategories] = useState<CustomContactCategory[]>(() => readDirectoryMeta(getCustomCategoriesKey(storageKey), []));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getCustomCategoriesKey(storageKey), JSON.stringify(categories));
  }, [categories, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== getCustomCategoriesKey(storageKey)) {
        return;
      }

      setCategories(readDirectoryMeta(getCustomCategoriesKey(storageKey), []));
    };

    window.addEventListener("storage", handleStorage);

    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  return { categories, setCategories };
}

export function createCustomContactCategoryDraft() {
  return {
    title: "",
    ruleTags: [] as string[]
  };
}

export function CustomContactCategoryEditor({
  availableTags,
  initialValue,
  onCancel,
  onDelete,
  onSave
}: {
  availableTags: string[];
  initialValue: { title: string; ruleTags: string[] };
  onCancel: () => void;
  onDelete?: () => void;
  onSave: (next: { title: string; ruleTags: string[] }) => void;
}) {
  const [title, setTitle] = useState(initialValue.title);
  const [ruleTags, setRuleTags] = useState<string[]>(initialValue.ruleTags);

  useEffect(() => {
    setTitle(initialValue.title);
    setRuleTags(initialValue.ruleTags);
  }, [initialValue]);

  const toggleTag = (tag: string) => {
    setRuleTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const canSave = title.trim().length > 0 && ruleTags.length > 0;

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <SectionTitle caption="通过标签规则自动把联系人收入这个分类。" title="编辑自定义分类" />

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-black">分类名称</span>
          <input
            className="w-full rounded-lg border border-line bg-paper px-3 py-3 text-sm outline-none transition focus:border-moss"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：VIP 顾客 / 常合作店铺"
            type="text"
            value={title}
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-black">创建规则</span>
            <span className="text-xs text-ink/45">命中任意标签即加入</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const active = ruleTags.includes(tag);

              return (
                <button
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-black transition",
                    active ? "border-moss bg-mint/15 text-moss" : "border-line bg-paper text-ink/55"
                  )}
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  type="button"
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs leading-5 text-ink/45">
            当前规则：
            {ruleTags.length === 0 ? " 尚未选择标签" : ` ${ruleTags.join(" / ")}`}
          </div>
          <div className="flex items-center gap-2">
            {onDelete ? (
              <button
                className="rounded-full border border-[#e25555]/25 bg-[#fff1f1] px-3 py-2 text-xs font-black text-[#d34a4a]"
                onClick={onDelete}
                type="button"
              >
                删除
              </button>
            ) : null}
            <button
              className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-black text-ink/55"
              onClick={onCancel}
              type="button"
            >
              取消
            </button>
            <button
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black text-white transition",
                canSave ? "bg-moss" : "bg-ink/20"
              )}
              disabled={!canSave}
              onClick={() => onSave({ title: title.trim(), ruleTags })}
              type="button"
            >
              保存分类
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContactDirectorySection({
  title,
  caption,
  storageKey,
  contacts
}: {
  title: string;
  caption: string;
  storageKey: string;
  contacts: DirectoryContactItem[];
}) {
  const [pinnedContactMeta, setPinnedContactMeta] = useState<Record<string, number>>(() => readDirectoryMeta(getPinnedDirectoryContactsKey(storageKey), {}));
  const [deletedContactIds, setDeletedContactIds] = useState<string[]>(() => readDirectoryMeta(getDeletedDirectoryContactsKey(storageKey), []));
  const [swipedContactId, setSwipedContactId] = useState<string | null>(null);
  const [draggingContactId, setDraggingContactId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const swipeSession = useRef<{ id: string; pointerId: number; startX: number; startY: number; initialOffset: number; moved: boolean } | null>(null);
  const skipNextClickId = useRef<string | null>(null);
  const visibleContacts = useMemo(
    () =>
      contacts
        .filter((contact) => !deletedContactIds.includes(contact.id))
        .sort((left, right) => {
          const leftPinned = Boolean(pinnedContactMeta[left.id]);
          const rightPinned = Boolean(pinnedContactMeta[right.id]);

          if (leftPinned !== rightPinned) {
            return Number(rightPinned) - Number(leftPinned);
          }

          return (pinnedContactMeta[right.id] ?? 0) - (pinnedContactMeta[left.id] ?? 0);
        }),
    [contacts, deletedContactIds, pinnedContactMeta]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getPinnedDirectoryContactsKey(storageKey), JSON.stringify(pinnedContactMeta));
  }, [pinnedContactMeta, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getDeletedDirectoryContactsKey(storageKey), JSON.stringify(deletedContactIds));
  }, [deletedContactIds, storageKey]);

  const startSwipe = (event: ReactPointerEvent<HTMLElement>, contactId: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("a")) {
      // keep link clicks working; swipe will activate once horizontal movement passes threshold
    }

    swipeSession.current = {
      id: contactId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffset: swipedContactId === contactId ? -directoryActionRevealWidth : 0,
      moved: false
    };
    setDraggingContactId(contactId);
    setDragOffset(swipedContactId === contactId ? -directoryActionRevealWidth : 0);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const session = swipeSession.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (!session.moved && Math.abs(deltaY) > Math.abs(deltaX) + 3) {
      swipeSession.current = null;
      setDraggingContactId(null);
      setDragOffset(0);
      return;
    }

    if (Math.abs(deltaX) < 6) {
      return;
    }

    session.moved = true;
    skipNextClickId.current = session.id;
    const nextOffset = Math.max(-directoryActionRevealWidth, Math.min(0, session.initialOffset + deltaX));
    setDragOffset(nextOffset);
  };

  const endSwipe = (pointerId: number) => {
    const session = swipeSession.current;
    if (!session || session.pointerId !== pointerId) {
      return;
    }

    const shouldReveal = dragOffset <= -directoryActionRevealWidth * 0.4;
    setSwipedContactId(shouldReveal ? session.id : null);
    setDraggingContactId(null);
    setDragOffset(0);
    swipeSession.current = null;
  };

  const togglePinnedContact = (contactId: string) => {
    setPinnedContactMeta((current) => {
      const next = { ...current };

      if (next[contactId]) {
        delete next[contactId];
      } else {
        next[contactId] = Date.now();
      }

      return next;
    });
    setSwipedContactId(null);
  };

  const deleteContact = (contactId: string) => {
    setDeletedContactIds((current) => [...current, contactId]);
    setSwipedContactId(null);
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <SectionTitle caption={caption} title={title} />
      <div className="mt-3 space-y-3">
        {visibleContacts.map((contact) => {
          const isDragging = draggingContactId === contact.id;
          const offset = isDragging ? dragOffset : swipedContactId === contact.id ? -directoryActionRevealWidth : 0;

          return (
            <div
              className="relative overflow-hidden rounded-lg"
              key={contact.id}
              onPointerCancel={(event) => endSwipe(event.pointerId)}
              onPointerDown={(event) => startSwipe(event, contact.id)}
              onPointerMove={moveSwipe}
              onPointerUp={(event) => endSwipe(event.pointerId)}
              style={{ touchAction: "pan-y" }}
            >
              <div className="absolute inset-y-0 right-0 flex items-stretch justify-end" style={{ width: `${directoryActionRevealWidth}px` }}>
                <button
                  className={cn(
                    "w-24 text-sm font-black text-white transition",
                    pinnedContactMeta[contact.id]
                      ? "bg-[color:color-mix(in_srgb,var(--client-primary)_82%,black)]"
                      : "bg-[color:var(--client-primary)]"
                  )}
                  onClick={() => togglePinnedContact(contact.id)}
                  type="button"
                >
                  {pinnedContactMeta[contact.id] ? "取消置顶" : "置顶"}
                </button>
                <button
                  className="w-24 bg-[#e25555] text-sm font-black text-white"
                  onClick={() => deleteContact(contact.id)}
                  type="button"
                >
                  删除
                </button>
              </div>
              <article
                className="relative z-10 rounded-lg bg-paper p-3 transition"
                style={{
                  transform: `translateX(${offset}px)`,
                  transition: isDragging ? "none" : "transform 180ms ease"
                }}
              >
                {contact.entityCardData ? (
                  <SocialProfileMiniCard
                    actionLabel={getMiniCardActionLabel(contact.secondaryAction?.label)}
                    data={contact.entityCardData}
                    detailTo={contact.entityCardData.detailPath ?? contact.to}
                    onAction={contact.secondaryAction?.onClick}
                  />
                ) : (
                  <Link
                    className="block text-left"
                    onClick={(event) => {
                      if (skipNextClickId.current === contact.id) {
                        skipNextClickId.current = null;
                        event.preventDefault();
                        return;
                      }

                      if (swipedContactId === contact.id) {
                        event.preventDefault();
                        setSwipedContactId(null);
                      }
                    }}
                    to={contact.to}
                  >
                    <ConversationListCard
                      avatar={contact.avatar}
                      meta={`${pinnedContactMeta[contact.id] ? "置顶 · " : ""}${contact.title}${contact.remark ? ` · 备注：${contact.remark}` : ""}`}
                      name={contact.name}
                      preview={`${contact.todayPriority ? "今日联系优先 · " : ""}${contact.meta}${contact.tags.length > 0 ? ` · ${contact.tags.join(" / ")}` : ""}`}
                      trailing={contact.systemId || contact.username || ""}
                    />
                  </Link>
                )}
                {contact.secondaryAction && !contact.entityCardData && (
                  <button
                    className={cn(
                      "mt-3 w-full rounded-lg px-3 py-2 text-xs font-black",
                      contact.secondaryAction.tone === "primary" ? "bg-moss text-white" : "bg-white text-ink/55"
                    )}
                    onClick={contact.secondaryAction.onClick}
                    type="button"
                  >
                    {contact.secondaryAction.label}
                  </button>
                )}
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}
