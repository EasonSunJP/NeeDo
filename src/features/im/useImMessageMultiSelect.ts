import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { ConversationMessage } from "./model";

export const MAX_SELECTED_MESSAGES = 100;
export const POINTER_SCROLL_THRESHOLD_PX = 8;

export type ImMultiSelectState = {
  active: boolean;
  anchorId: string | null;
  selectedIds: Set<string>;
};

export type ImMessageMultiSelectRow = {
  centerY: number | null;
  eligible: boolean;
  id: string;
};

export type ImMultiSelectRangeResult =
  | { status: "selected"; selectedIds: string[] }
  | { status: "overflow"; max: number }
  | { status: "unavailable" };

export type ImPointerReleaseKind = "cancel-selection" | "control" | "scroll-end";

type PointerGesture = {
  didScroll: boolean;
  pointerId: number;
  scrollTop: number;
  x: number;
  y: number;
};

function isAuthoritativeMessageId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return false;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2_147_483_647;
}

export function isImMessageMultiSelectEligible(message: ConversationMessage) {
  return (
    isAuthoritativeMessageId(message.id)
    && message.type !== "system"
    && message.type !== "recalled"
    && message.status !== "sending"
    && message.status !== "failed"
    && message.status !== "recalled"
    && message.serverState !== "recalled"
    && !message.recalledAt
    && !message.contentPurgedAt
    && !message.ext?.disappearing
  );
}

const snapshotMediaMimeTypes: Record<string, Set<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/webm"]),
  voice: new Set(["audio/webm", "audio/mp4", "audio/ogg"]),
  file: new Set(["application/pdf"]),
};

export function isImMessageChatRecordSnapshotEligible(message: ConversationMessage) {
  if (!isImMessageMultiSelectEligible(message)) return false;
  if (message.type === "text" || message.type === "emoji") return true;
  if (["image", "video", "voice", "file"].includes(message.type)) {
    const ext = message.ext;
    return Boolean(
      ext && typeof ext.url === "string" && ext.url.trim() &&
      typeof ext.mimeType === "string" && snapshotMediaMimeTypes[message.type]?.has(ext.mimeType) &&
      Number.isSafeInteger(ext.fileSize) && (ext.fileSize ?? 0) > 0 && (ext.fileSize ?? 0) <= 8 * 1024 * 1024,
    );
  }
  if (message.type === "location") {
    const location = message.ext?.location;
    return Boolean(
      location?.title.trim() && location.address.trim() &&
      Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90 &&
      Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180,
    );
  }
  if (message.type === "contact-card") {
    const card = message.ext?.contactCard;
    return Boolean(card?.userId.trim() && card.displayName.trim() && card.profileKind);
  }
  if (message.type === "service-card") {
    const card = message.ext?.serviceCard;
    return Boolean(card?.serviceId.trim() && card.name.trim() && card.priceLabel.trim());
  }
  if (message.type === "schedule-invite") {
    const invite = message.ext?.scheduleInvite;
    return Boolean(invite?.scheduleId.trim() && invite.title.trim() && invite.date.trim() && invite.timeRange.trim());
  }
  return false;
}

export function selectRangeToViewportPoint({
  anchorId,
  pointY,
  rows,
}: {
  anchorId: string;
  pointY: number;
  rows: readonly ImMessageMultiSelectRow[];
}) {
  const eligibleRows = rows.filter((row) => row.eligible);
  const anchorIndex = eligibleRows.findIndex((row) => row.id === anchorId);
  const renderedRows = eligibleRows.filter((row): row is ImMessageMultiSelectRow & { centerY: number } => (
    typeof row.centerY === "number" && Number.isFinite(row.centerY)
  ));

  if (anchorIndex < 0 || renderedRows.length === 0) {
    return [];
  }

  const endpoint = renderedRows.reduce((nearest, row) => (
    Math.abs(row.centerY - pointY) < Math.abs(nearest.centerY - pointY) ? row : nearest
  ));
  const endpointIndex = eligibleRows.findIndex((row) => row.id === endpoint.id);
  const first = Math.min(anchorIndex, endpointIndex);
  const last = Math.max(anchorIndex, endpointIndex);
  return eligibleRows.slice(first, last + 1).map((row) => row.id);
}

export function classifyPointerRelease({
  movedPx,
  scrollChanged,
  targetKind,
}: {
  movedPx: number;
  scrollChanged: boolean;
  targetKind: "control" | "message";
}): ImPointerReleaseKind {
  if (movedPx >= POINTER_SCROLL_THRESHOLD_PX || scrollChanged) {
    return "scroll-end";
  }
  return targetKind === "control" ? "control" : "cancel-selection";
}

function getMultiSelectCopyBody(
  message: ConversationMessage,
  displayedText: string | undefined,
  translate: (value: string) => string,
) {
  if (typeof displayedText === "string" && displayedText.trim()) return displayedText;
  if (message.type === "text" || message.type === "emoji") return message.content;
  if (message.type === "image") return translate("[图片]");
  if (message.type === "video") return translate("[视频]");
  if (message.type === "voice") return translate("[语音]");
  if (message.type === "file") {
    return `${translate("[文件]")}${message.ext?.fileName?.trim() ? ` ${message.ext.fileName.trim()}` : ""}`;
  }
  if (message.type === "location") {
    const title = message.ext?.location?.title?.trim();
    return `${translate("[位置]")}${title ? ` ${title}` : ""}`;
  }
  if (message.type === "contact-card") {
    const name = message.ext?.contactCard?.displayName?.trim();
    return `${translate("[名片]")}${name ? ` ${name}` : ""}`;
  }
  if (message.type === "service-card") {
    const name = message.ext?.serviceCard?.name?.trim();
    return `${translate("[服务]")}${name ? ` ${name}` : ""}`;
  }
  if (message.type === "schedule-invite") {
    const title = message.ext?.scheduleInvite?.title?.trim();
    return `${translate("[日程邀请]")}${title ? ` ${title}` : ""}`;
  }
  return message.content || message.ext?.previewText || translate("媒体消息");
}

export function buildImMessageMultiSelectCopyText({
  messages,
  resolveDisplayedText = () => undefined,
  resolveSenderName,
  translate,
}: {
  messages: readonly ConversationMessage[];
  resolveDisplayedText?: (message: ConversationMessage) => string | undefined;
  resolveSenderName: (message: ConversationMessage) => string;
  translate: (value: string) => string;
}) {
  return [...messages]
    .sort((left, right) => (
      new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime()
      || left.clientSeq - right.clientSeq
      || Number(left.id) - Number(right.id)
    ))
    .map((message) => `${resolveSenderName(message)}:${getMultiSelectCopyBody(message, resolveDisplayedText(message), translate)}`)
    .join("\n");
}

function targetIsMultiSelectControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-im-multiselect-control="true"]'));
}

export function useImMessageMultiSelect({
  messages,
  messageRefs,
  scrollRoot,
}: {
  messages: readonly ConversationMessage[];
  messageRefs: RefObject<Record<string, HTMLDivElement | null>>;
  scrollRoot: RefObject<HTMLDivElement | null>;
}) {
  const [state, setState] = useState<ImMultiSelectState>(() => ({
    active: false,
    anchorId: null,
    selectedIds: new Set(),
  }));
  const gestureRef = useRef<PointerGesture | null>(null);
  const eligibleMessages = useMemo(
    () => messages.filter(isImMessageMultiSelectEligible),
    [messages],
  );
  const eligibleIds = useMemo(
    () => new Set(eligibleMessages.map((message) => message.id)),
    [eligibleMessages],
  );

  useEffect(() => {
    setState((current) => {
      if (!current.active) return current;
      const selectedIds = new Set([...current.selectedIds].filter((id) => eligibleIds.has(id)));
      if (selectedIds.size === current.selectedIds.size) return current;
      return { ...current, selectedIds };
    });
  }, [eligibleIds]);

  const exit = useCallback(() => {
    gestureRef.current = null;
    setState({ active: false, anchorId: null, selectedIds: new Set() });
  }, []);

  const enter = useCallback((anchorId: string) => {
    if (!eligibleIds.has(anchorId)) {
      return false;
    }
    window.getSelection()?.removeAllRanges();
    setState({ active: true, anchorId, selectedIds: new Set([anchorId]) });
    return true;
  }, [eligibleIds]);

  const toggle = useCallback((id: string): ImMultiSelectRangeResult => {
    if (!state.active || !eligibleIds.has(id)) return { status: "unavailable" };
    const selectedIds = new Set(state.selectedIds);
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      if (selectedIds.size >= MAX_SELECTED_MESSAGES) {
        return { status: "overflow", max: MAX_SELECTED_MESSAGES };
      }
      selectedIds.add(id);
    }
    setState((current) => ({ ...current, selectedIds }));
    return { status: "selected", selectedIds: [...selectedIds] };
  }, [eligibleIds, state.active, state.selectedIds]);

  const selectToPoint = useCallback((pointY: number): ImMultiSelectRangeResult => {
    if (!state.active || !state.anchorId) return { status: "unavailable" };
    const rows = messages.map((message): ImMessageMultiSelectRow => {
      const rect = messageRefs.current?.[message.id]?.getBoundingClientRect();
      return {
        centerY: rect ? rect.top + (rect.height / 2) : null,
        eligible: isImMessageMultiSelectEligible(message),
        id: message.id,
      };
    });
    const selectedIds = selectRangeToViewportPoint({ anchorId: state.anchorId, pointY, rows });
    if (selectedIds.length === 0) return { status: "unavailable" };
    if (selectedIds.length > MAX_SELECTED_MESSAGES) {
      return { status: "overflow", max: MAX_SELECTED_MESSAGES };
    }
    setState((current) => ({ ...current, selectedIds: new Set(selectedIds) }));
    return { status: "selected", selectedIds };
  }, [messageRefs, messages, state.active, state.anchorId]);

  const onPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!state.active) return;
    gestureRef.current = {
      didScroll: false,
      pointerId: event.pointerId,
      scrollTop: scrollRoot.current?.scrollTop ?? 0,
      x: event.clientX,
      y: event.clientY,
    };
  }, [scrollRoot, state.active]);

  const onPointerMoveCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const movedPx = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    const scrollChanged = (scrollRoot.current?.scrollTop ?? 0) !== gesture.scrollTop;
    if (movedPx >= POINTER_SCROLL_THRESHOLD_PX || scrollChanged) {
      gesture.didScroll = true;
    }
  }, [scrollRoot]);

  const onPointerUpCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return null;
    const movedPx = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    const result = classifyPointerRelease({
      movedPx,
      scrollChanged: gesture.didScroll || (scrollRoot.current?.scrollTop ?? 0) !== gesture.scrollTop,
      targetKind: targetIsMultiSelectControl(event.target) ? "control" : "message",
    });
    gestureRef.current = null;
    if (result === "cancel-selection") exit();
    return result;
  }, [exit, scrollRoot]);

  const onPointerCancelCapture = useCallback(() => {
    gestureRef.current = null;
  }, []);

  const selectedMessages = useMemo(
    () => eligibleMessages.filter((message) => state.selectedIds.has(message.id)),
    [eligibleMessages, state.selectedIds],
  );

  return {
    ...state,
    enter,
    exit,
    onPointerCancelCapture,
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    selectToPoint,
    selectedMessages,
    toggle,
  };
}
