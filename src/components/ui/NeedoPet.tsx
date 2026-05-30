import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { ImRoleType } from "../../features/im/model";
import { useImStore } from "../../features/im/store";
import { useSocial } from "../../features/social/context";
import type { SocialPortalScope } from "../../features/social/types";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { readNeedoExternalInfoPosts, subscribeNeedoExternalInfoPosts, type NeedoExternalInfoPost } from "../../lib/needoExchangeBridge";
import { cn } from "../../lib/utils";
import {
  petSpriteSrc,
  useNeedoPetAssetReadiness,
  xiaobaiIdleClips,
  xiaobaiOneShotClips,
  xiaobaiRunningClips,
  type NeedoPetMotionClip,
  type XiaobaiPetOneShotSpriteKey,
  type XiaobaiPetSpriteKey
} from "../../state/needoPetAssets";
import { setNeedoPetEnabled, setNeedoPetFreeRoam, useNeedoPetSettings } from "../../state/needoPetSettings";
import { getClientThemeClassName, getClientThemeModeClassName, useClientTheme } from "../../theme/ClientThemeProvider";
import { NotificationBadge } from "./NotificationBadge";

type PetCareState = {
  alive: boolean;
  energy: number;
  fun: number;
  hunger: number;
  hungerEmptySinceAt: number | null;
  hygiene: number;
  lastUpdatedAt: number;
  version: 1;
};

type PetMotionMode = "anchor" | "roam" | "climb" | "peek" | "rest" | "dead";
type PetAnimationState = "dying" | "entering" | "exiting" | "failed" | "grave" | "idle" | "reviving" | "running-left" | "running-right" | "waiting" | "waving";
type PetFacing = "left" | "right";
type PetExpression = "happy" | "notice" | "tired" | "sad" | "dead";
type PetTransitionState = "death" | "enter" | "exit" | "revive" | null;
type PetSpriteKey = XiaobaiPetSpriteKey;
type PetOneShotSpriteKey = XiaobaiPetOneShotSpriteKey;

type ReminderItem = {
  count: number;
  label: string;
  path: string;
  type: "contacts" | "messages" | "moments";
};

type PetBubbleHighlight = {
  id: string;
  label: string;
  value: string;
};

type PetBubble = {
  actionLabel?: string;
  actionPath?: string;
  highlights?: PetBubbleHighlight[];
  id: string;
  infoTitle?: string;
  text?: string;
  title: string;
  tone: "care" | "danger" | "happy" | "notice";
};

type PetMotionClip = NeedoPetMotionClip;

type MotionPosition = {
  x: number;
  y: number;
};

type MotionVelocity = {
  x: number;
  y: number;
};

type PetMotionState = {
  facing: PetFacing;
  mode: PetMotionMode;
  moving: boolean;
};

type FloatingPlacement = {
  arrowX?: number;
  maxHeight: number;
  originX?: number;
  width: number;
  x: number;
  y: number;
};

type PetDragSession = {
  moved: boolean;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

const petStorageKey = "needo.digital-pet.v1";
const petPositionStorageKey = "needo.digital-pet.position.v1";
const petSize = { width: 132, height: 158 };
const petPeekVisible = 38;
const idleRoamDelay = 10_000;
const hungerDeathDelay = 10 * 60_000;
const dragEdgeThreshold = 34;
const floatingViewportPadding = 12;
const bubblePreferredWidth = 268;
const bubbleCompactWidth = 252;
const bubbleMaxHeight = 220;
const panelPreferredWidth = 282;
const panelCompactWidth = 300;
const panelEstimatedHeight = 522;
const panelMaxHeight = 560;
const initialCare: PetCareState = {
  alive: true,
  energy: 78,
  fun: 76,
  hunger: 82,
  hungerEmptySinceAt: null,
  hygiene: 86,
  lastUpdatedAt: Date.now(),
  version: 1
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function getAnchorPosition(): MotionPosition {
  if (typeof window === "undefined") {
    return { x: 24, y: 380 };
  }

  const navPanel = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-client-bottom-nav-panel='true']");
  const navRect = navPanel?.getBoundingClientRect();

  if (navRect && navRect.width > 120 && navRect.height > 36) {
    const maxX = Math.max(8, window.innerWidth - petSize.width - 8);
    const maxY = Math.max(8, window.innerHeight - petSize.height - 8);

    return {
      x: clamp(navRect.right - petSize.width - 6, 8, maxX),
      y: clamp(navRect.top - petSize.height + 10, 8, maxY)
    };
  }

  return {
    x: Math.max(8, window.innerWidth - petSize.width - 16),
    y: Math.max(8, window.innerHeight - petSize.height - 104)
  };
}

function getDragBounds() {
  if (typeof window === "undefined") {
    return {
      maxX: 320,
      maxY: 640,
      minX: -petSize.width + petPeekVisible,
      minY: -petSize.height + petPeekVisible
    };
  }

  return {
    maxX: window.innerWidth - petPeekVisible,
    maxY: window.innerHeight - petPeekVisible,
    minX: -petSize.width + petPeekVisible,
    minY: -petSize.height + petPeekVisible
  };
}

function clampDragPosition(position: MotionPosition) {
  const bounds = getDragBounds();

  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY)
  };
}

function getBubblePlacement(position: MotionPosition, facing: PetFacing): FloatingPlacement {
  if (typeof window === "undefined") {
    return {
      arrowX: 20,
      maxHeight: bubbleMaxHeight,
      originX: 20,
      width: bubblePreferredWidth,
      x: 104,
      y: -84
    };
  }

  const padding = floatingViewportPadding;
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const width = Math.max(180, Math.min(viewportWidth - padding * 2, viewportWidth <= 520 ? bubbleCompactWidth : bubblePreferredWidth));
  const maxHeight = Math.min(bubbleMaxHeight, Math.max(96, viewportHeight - padding * 2));
  const pointerX = facing === "left" ? position.x + 10 : position.x + petSize.width - 10;
  const preferredViewportX = facing === "left" ? pointerX - width + 20 : pointerX - 20;
  const minViewportX = padding;
  const maxViewportX = Math.max(minViewportX, viewportWidth - width - padding);
  const viewportX = clamp(preferredViewportX, minViewportX, maxViewportX);
  const minViewportY = padding;
  const maxViewportY = Math.max(minViewportY, viewportHeight - maxHeight - padding - 10);
  const viewportY = clamp(position.y - 84, minViewportY, maxViewportY);
  const arrowX = clamp(pointerX - viewportX, 18, width - 18);

  return {
    arrowX,
    maxHeight,
    originX: arrowX,
    width,
    x: viewportX - position.x,
    y: viewportY - position.y
  };
}

function getPanelPlacement(position: MotionPosition, facing: PetFacing): FloatingPlacement {
  if (typeof window === "undefined") {
    return {
      maxHeight: panelMaxHeight,
      width: panelPreferredWidth,
      x: 140,
      y: -312
    };
  }

  const padding = floatingViewportPadding;
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const width = Math.max(244, Math.min(viewportWidth - padding * 2, viewportWidth <= 520 ? panelCompactWidth : panelPreferredWidth));
  const maxHeight = Math.min(panelMaxHeight, Math.max(240, viewportHeight - padding * 2));
  const preferredViewportX = facing === "left" ? position.x - width - 8 : position.x + petSize.width + 8;
  const minViewportX = padding;
  const maxViewportX = Math.max(minViewportX, viewportWidth - width - padding);
  const viewportX = clamp(preferredViewportX, minViewportX, maxViewportX);
  const estimatedHeight = Math.min(panelEstimatedHeight, maxHeight);
  const minViewportY = padding;
  const maxViewportY = Math.max(minViewportY, viewportHeight - maxHeight - padding);
  const viewportY = clamp(position.y + petSize.height - estimatedHeight, minViewportY, maxViewportY);

  return {
    maxHeight,
    width,
    x: viewportX - position.x,
    y: viewportY - position.y
  };
}

function getEdgePeekTarget(position: MotionPosition): MotionPosition | null {
  if (typeof window === "undefined") {
    return null;
  }

  const innerMaxX = window.innerWidth - petSize.width - 8;
  const innerMaxY = window.innerHeight - petSize.height - 8;
  const edgeCandidates = [
    {
      distance: position.x - 8,
      target: { x: -petSize.width + petPeekVisible, y: clamp(position.y, 8, innerMaxY) }
    },
    {
      distance: innerMaxX - position.x,
      target: { x: window.innerWidth - petPeekVisible, y: clamp(position.y, 8, innerMaxY) }
    },
    {
      distance: position.y - 8,
      target: { x: clamp(position.x, 8, innerMaxX), y: -petSize.height + petPeekVisible }
    },
    {
      distance: innerMaxY - position.y,
      target: { x: clamp(position.x, 8, innerMaxX), y: window.innerHeight - petPeekVisible }
    }
  ].sort((left, right) => left.distance - right.distance);
  const closest = edgeCandidates[0];

  return closest && closest.distance <= dragEdgeThreshold ? closest.target : null;
}

function normalizeCareState(input: Partial<PetCareState> | null | undefined): PetCareState {
  const base = {
    ...initialCare,
    ...input,
    version: 1 as const
  };

  return {
    alive: Boolean(base.alive),
    energy: clamp(Number(base.energy)),
    fun: clamp(Number(base.fun)),
    hunger: clamp(Number(base.hunger)),
    hungerEmptySinceAt: Number.isFinite(base.hungerEmptySinceAt)
      ? Number(base.hungerEmptySinceAt)
      : Number(base.hunger) <= 0
        ? Number.isFinite(base.lastUpdatedAt)
          ? Number(base.lastUpdatedAt)
          : Date.now()
        : null,
    hygiene: clamp(Number(base.hygiene)),
    lastUpdatedAt: Number.isFinite(base.lastUpdatedAt) ? Number(base.lastUpdatedAt) : Date.now(),
    version: 1
  };
}

function decayCareState(state: PetCareState, now = Date.now()): PetCareState {
  const elapsedHours = Math.max(0, (now - state.lastUpdatedAt) / 3_600_000);

  if (elapsedHours < 0.01) {
    return state.hunger > 0 && state.hungerEmptySinceAt
      ? {
          ...state,
          hungerEmptySinceAt: null
        }
      : state;
  }

  const rawHunger = state.hunger - elapsedHours * 2.4;
  const nextHunger = clamp(rawHunger);
  let hungerEmptySinceAt = nextHunger <= 0 ? state.hungerEmptySinceAt : null;

  if (nextHunger <= 0 && !hungerEmptySinceAt) {
    if (state.hunger > 0) {
      const hoursUntilEmpty = state.hunger / 2.4;
      hungerEmptySinceAt = state.lastUpdatedAt + Math.min(elapsedHours, hoursUntilEmpty) * 3_600_000;
    } else {
      hungerEmptySinceAt = state.lastUpdatedAt;
    }
  }

  const next = {
    ...state,
    hunger: nextHunger,
    hungerEmptySinceAt,
    hygiene: clamp(state.hygiene - elapsedHours * 1.6),
    fun: clamp(state.fun - elapsedHours * 2.0),
    energy: clamp(state.energy - elapsedHours * 1.2),
    lastUpdatedAt: now
  };

  return next;
}

function readCareState() {
  if (typeof window === "undefined") {
    return initialCare;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(petStorageKey) ?? "null") as Partial<PetCareState> | null;
    return decayCareState(normalizeCareState(parsed));
  } catch {
    return initialCare;
  }
}

function persistCareState(state: PetCareState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(petStorageKey, JSON.stringify(state));
}

function readMotionPosition(): MotionPosition {
  if (typeof window === "undefined") {
    return { x: 24, y: 380 };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(petPositionStorageKey) ?? "null") as Partial<MotionPosition> | null;
    const anchor = getAnchorPosition();

    return clampDragPosition({
      x: Number(parsed?.x ?? anchor.x),
      y: Number(parsed?.y ?? anchor.y)
    });
  } catch {
    return getAnchorPosition();
  }
}

function persistMotionPosition(position: MotionPosition) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(petPositionStorageKey, JSON.stringify(position));
}

function getClientRole(pathname: string, sessionPortal?: string): ImRoleType | null {
  if (pathname.startsWith("/merchant-admin") || pathname === "/merchant" || pathname.startsWith("/merchant/")) {
    return "merchant";
  }

  if (pathname === "/technician" || pathname.startsWith("/technician/")) {
    return "technician";
  }

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/NDA-admin") ||
    pathname.startsWith("/nda-admin") ||
    pathname.startsWith("/afirieito") ||
    pathname.startsWith("/business") ||
    pathname.startsWith("/cps")
  ) {
    return sessionPortal === "merchant" || sessionPortal === "technician" ? sessionPortal : null;
  }

  return "user";
}

function getRolePrefix(role: ImRoleType) {
  return role === "user" ? "" : `/${role}`;
}

function buildReminderHighlights(reminders: ReminderItem[]) {
  return reminders.slice(0, 3).map((item) => ({
    id: item.type,
    label: item.label,
    value: `${item.count} 条`
  }));
}

function getLatestExternalInfoTitle(posts: NeedoExternalInfoPost[]) {
  const now = Date.now();
  const latestActivePost = posts.find((post) => {
    const expiresAt = new Date(post.expiresAt).getTime();
    return Number.isNaN(expiresAt) || expiresAt > now;
  });
  const latestPost = latestActivePost ?? posts[0];

  return latestPost?.title.trim() ?? "";
}

function getLowCareBubble(care: PetCareState): PetBubble | null {
  if (!care.alive) {
    return {
      id: "dead",
      title: "我已经死亡",
      text: "长时间没有照顾，生命值归零了。可以点击复活，让我重新开始陪你看消息。",
      tone: "danger"
    };
  }

  const lows = [
    { key: "hunger", label: "我有点饿，喂一下会更有精神。", value: care.hunger },
    { key: "hygiene", label: "身上有点脏，清扫一下我会清爽很多。", value: care.hygiene },
    { key: "fun", label: "有点无聊，陪我玩一下吧。", value: care.fun },
    { key: "energy", label: "电量有点低，我想休息一下。", value: care.energy }
  ].filter((item) => item.value < 34);

  if (lows.length === 0) {
    return null;
  }

  return {
    id: `care-${lows.map((item) => item.key).join("-")}`,
    title: "照顾提醒",
    text: lows[0].label,
    tone: "care"
  };
}

function getCareExpression(care: PetCareState, hasNotice: boolean): PetExpression {
  if (!care.alive) {
    return "dead";
  }

  if (hasNotice) {
    return "notice";
  }

  if (care.energy < 28) {
    return "tired";
  }

  if (care.hunger < 28 || care.hygiene < 24 || care.fun < 24) {
    return "sad";
  }

  return "happy";
}

function getPetAnimationState({
  expression,
  facing,
  moving,
  mode,
  panelOpen,
  transition
}: {
  expression: PetExpression;
  facing: PetFacing;
  moving: boolean;
  mode: PetMotionMode;
  panelOpen: boolean;
  transition: PetTransitionState;
}): PetAnimationState {
  if (transition === "death") {
    return "dying";
  }

  if (transition === "enter") {
    return "entering";
  }

  if (transition === "exit") {
    return "exiting";
  }

  if (transition === "revive") {
    return "reviving";
  }

  if (expression === "dead" || mode === "dead") {
    return "grave";
  }

  if (panelOpen || mode === "rest") {
    return "idle";
  }

  if (moving) {
    return facing === "left" ? "running-left" : "running-right";
  }

  return "idle";
}

function getPetSpriteKey({
  care,
  expression,
  moving,
  panelOpen,
  transition
}: {
  care: PetCareState;
  expression: PetExpression;
  moving: boolean;
  panelOpen: boolean;
  transition: PetTransitionState;
}): PetSpriteKey {
  if (transition === "death") {
    return "death";
  }

  if (transition === "enter") {
    return "enter";
  }

  if (transition === "exit") {
    return "exit";
  }

  if (transition === "revive") {
    return "revive";
  }

  if (!care.alive || expression === "dead") {
    return "grave";
  }

  if (!panelOpen && moving) {
    return "running";
  }

  return "idle";
}

function isOneShotSprite(sprite: PetSpriteKey): sprite is PetOneShotSpriteKey {
  return sprite === "death" || sprite === "enter" || sprite === "exit" || sprite === "revive";
}

function getNextMotionClipIndex(currentIndex: number, clipCount: number) {
  if (clipCount <= 1) {
    return 0;
  }

  const offset = 1 + Math.floor(Math.random() * (clipCount - 1));
  return (currentIndex + offset) % clipCount;
}

function NeedoPetMotionSequence({
  clips,
  sprite
}: {
  clips: readonly PetMotionClip[];
  sprite: "idle" | "running";
}) {
  const [clipIndex, setClipIndex] = useState(() => Math.floor(Math.random() * clips.length));
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const clip = clips[clipIndex] ?? clips[0];

  useEffect(() => {
    clips.forEach((item) => {
      const image = new Image();
      image.src = item.src;
    });
  }, [clips]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const nextIndex = getNextMotionClipIndex(clipIndex, clips.length);
      const nextClip = clips[nextIndex] ?? clips[0];
      const image = new Image();
      const switchClip = () => {
        if (cancelled) {
          return;
        }
        setFallbackSrc(clip.src);
        setClipIndex(nextIndex);
      };

      image.onload = switchClip;
      image.src = nextClip.src;

      if (image.complete && image.naturalWidth > 0) {
        switchClip();
      }
    }, clip.durationMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clip.durationMs, clip.src, clipIndex, clips]);

  return (
    <span className={cn("needo-pet-sprite-shell is-motion", sprite === "idle" ? "is-idle-motion" : "is-running-motion")} data-sprite={sprite}>
      {fallbackSrc ? <img alt="" className="needo-pet-motion-image is-fallback" draggable={false} src={fallbackSrc} /> : null}
      <img
        key={clip.src}
        alt=""
        className="needo-pet-motion-image is-active"
        draggable={false}
        onLoad={() => setFallbackSrc(null)}
        src={clip.src}
      />
    </span>
  );
}

function NeedoPetOneShotMotion({ runId, sprite }: { runId: number; sprite: PetOneShotSpriteKey }) {
  const clip = xiaobaiOneShotClips[sprite];

  return (
    <span className={cn("needo-pet-sprite-shell is-motion is-one-shot-motion", `is-${sprite}-motion`)} data-sprite={sprite}>
      <img
        key={`${clip.src}-${runId}`}
        alt=""
        className="needo-pet-motion-image is-active"
        draggable={false}
        src={clip.src}
      />
    </span>
  );
}

function NeedoPetSprite({ runId, sprite }: { runId: number; sprite: PetSpriteKey }) {
  if (sprite === "idle") {
    return <NeedoPetMotionSequence key="idle" clips={xiaobaiIdleClips} sprite="idle" />;
  }

  if (sprite === "running") {
    return <NeedoPetMotionSequence key="running" clips={xiaobaiRunningClips} sprite="running" />;
  }

  if (isOneShotSprite(sprite)) {
    return <NeedoPetOneShotMotion key={sprite} runId={runId} sprite={sprite} />;
  }

  return (
    <span className="needo-pet-sprite-shell" data-sprite={sprite}>
      <img alt="" className="needo-pet-sprite-frame" draggable={false} src={petSpriteSrc[sprite]} />
    </span>
  );
}

export function NeedoPetRunningSprite() {
  const assetReadiness = useNeedoPetAssetReadiness();

  if (!assetReadiness.ready) {
    return null;
  }

  return <NeedoPetMotionSequence key="running" clips={xiaobaiRunningClips} sprite="running" />;
}

function findClimbSurface(position: MotionPosition) {
  const selectors = [
    "main",
    "section",
    "article",
    "[data-needo-pet-surface='true']",
    ".rounded-2xl",
    ".rounded-3xl",
    ".admin-card",
    ".mobile-shell"
  ];
  const centerX = position.x + petSize.width / 2;
  const footY = position.y + petSize.height;

  return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 150 && rect.height > 64 && rect.top > 24 && rect.bottom > 90)
    .find((rect) => centerX > rect.left + 12 && centerX < rect.right - 12 && Math.abs(footY - rect.top) < 76);
}

function NeedoPetMascot({ expression }: { expression: PetExpression }) {
  const isDead = expression === "dead";
  const isTired = expression === "tired";
  const isSad = expression === "sad";
  const isNotice = expression === "notice";

  return (
    <svg aria-hidden="true" className="needo-pet-svg" viewBox="0 0 160 190">
      <defs>
        <radialGradient cx="38%" cy="24%" id="needoPetBody" r="74%">
          <stop offset="0%" stopColor="#fffef9" />
          <stop offset="58%" stopColor="#f4f0e8" />
          <stop offset="100%" stopColor="#dfd9cf" />
        </radialGradient>
        <radialGradient cx="44%" cy="30%" id="needoPetCheek" r="56%">
          <stop offset="0%" stopColor="#ff9c97" stopOpacity="0.68" />
          <stop offset="100%" stopColor="#ffbab5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="needoPetMouth" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5f1e13" />
          <stop offset="100%" stopColor="#d66a31" />
        </linearGradient>
      </defs>
      <ellipse className="needo-pet-shadow" cx="82" cy="174" rx="45" ry="9" />
      <g className="needo-pet-body-group">
        <path className="needo-pet-arm needo-pet-arm-left" d="M45 103c-20 0-34-18-28-32 3-8 12-7 15 1 4 9 9 15 19 17 8 1 10 13-6 14Z" />
        <path className="needo-pet-arm needo-pet-arm-right" d="M117 104c21-2 31-22 23-35-5-7-13-4-14 4-2 10-8 16-18 18-8 2-8 15 9 13Z" />
        <ellipse className="needo-pet-body" cx="82" cy="119" rx="43" ry="55" />
        <ellipse className="needo-pet-head" cx="80" cy="64" rx="55" ry="53" />
        <ellipse className="needo-pet-cheek needo-pet-cheek-left" cx="42" cy="70" rx="15" ry="12" />
        <ellipse className="needo-pet-cheek needo-pet-cheek-right" cx="116" cy="70" rx="15" ry="12" />
        <path className="needo-pet-leg" d="M51 159c-9 12-5 22 9 22 11 0 18-8 15-21Z" />
        <path className="needo-pet-leg" d="M91 160c-4 14 3 22 15 21 14-1 18-11 8-23Z" />
        {isDead ? (
          <>
            <path className="needo-pet-eye-x" d="M47 51l13 13m0-13L47 64" />
            <path className="needo-pet-eye-x" d="M99 51l13 13m0-13L99 64" />
          </>
        ) : (
          <>
            <ellipse className={cn("needo-pet-eye", isTired && "is-tired")} cx="54" cy="58" rx="8" ry={isTired ? 3 : 11} />
            <ellipse className={cn("needo-pet-eye", isTired && "is-tired")} cx="106" cy="58" rx="8" ry={isTired ? 3 : 11} />
          </>
        )}
        {isDead || isSad ? (
          <path className="needo-pet-mouth-line" d="M64 88c8-9 23-9 31 0" />
        ) : isTired ? (
          <path className="needo-pet-mouth-line" d="M66 83c9 5 20 5 29 0" />
        ) : (
          <path
            className={cn("needo-pet-mouth", isNotice && "is-notice")}
            d={isNotice ? "M70 80c0-11 20-11 20 0 0 14-20 14-20 0Z" : "M58 78c12 20 36 20 48 0 1-3-1-6-4-6H62c-4 0-6 3-4 6Z"}
          />
        )}
        {isNotice ? <path className="needo-pet-notice-mark" d="M118 26v21m0 12v3" /> : null}
      </g>
    </svg>
  );
}

function NeedoPetBubbleBody({ bubble }: { bubble: PetBubble }) {
  const highlights = bubble.highlights ?? [];

  return (
    <div className="needo-pet-bubble-body">
      {highlights.length > 0 ? (
        <p className="needo-pet-bubble-summary">
          {highlights.map((item, index) => (
            <span className="needo-pet-bubble-highlight" key={item.id}>
              {index > 0 ? <span className="needo-pet-bubble-separator">，</span> : null}
              <strong className="needo-pet-bubble-emphasis is-number">{item.value}</strong>
              <span>{item.label}</span>
            </span>
          ))}
        </p>
      ) : null}
      {bubble.infoTitle ? (
        <p className="needo-pet-bubble-info">
          <span>最新情报：</span>
          <strong className="needo-pet-bubble-emphasis">{bubble.infoTitle}</strong>
        </p>
      ) : null}
      {bubble.text ? <p className="needo-pet-bubble-copy">{bubble.text}</p> : null}
    </div>
  );
}

function CareMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="needo-pet-meter">
      <div className="needo-pet-meter-row">
        <span>{label}</span>
        <strong>{Math.round(value)}</strong>
      </div>
      <div className="needo-pet-meter-track">
        <span style={{ width: `${clamp(value)}%` }} />
      </div>
    </div>
  );
}

export function NeedoPet({ disabled = false }: { disabled?: boolean }) {
  const { isAuthenticated, session } = useAuth();
  const { language } = useOptionalI18n();
  const { theme } = useClientTheme();
  const petSettings = useNeedoPetSettings();
  const petAssetReadiness = useNeedoPetAssetReadiness();
  const location = useLocation();
  const navigate = useNavigate();
  const social = useSocial();
  const clientRole = getClientRole(location.pathname, session?.portal);
  const imRole = clientRole ?? "user";
  const imStore = useImStore(imRole);
  const [care, setCare] = useState<PetCareState>(() => readCareState());
  const [externalInfoPosts, setExternalInfoPosts] = useState<NeedoExternalInfoPost[]>(() => readNeedoExternalInfoPosts());
  const [panelOpen, setPanelOpen] = useState(false);
  const [bubble, setBubble] = useState<PetBubble | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settled, setSettled] = useState(false);
  const [motion, setMotion] = useState<PetMotionState>({ facing: "right", mode: "anchor", moving: false });
  const [petTransition, setPetTransition] = useState<PetTransitionState>(null);
  const [petTransitionRunId, setPetTransitionRunId] = useState(0);
  const [, setViewportRevision] = useState(0);
  const petRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<MotionPosition>(readMotionPosition());
  const velocityRef = useRef<MotionVelocity>({ x: -0.42, y: 0.18 });
  const lastFrameRef = useRef(0);
  const lastWanderRef = useRef(0);
  const lastSurfaceCheckRef = useRef(0);
  const climbTargetRef = useRef<DOMRect | null>(null);
  const draggingRef = useRef(false);
  const animationFrameRef = useRef(0);
  const dragSessionRef = useRef<PetDragSession | null>(null);
  const lastInteractionRef = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const manualHoldUntilRef = useRef(0);
  const peekTargetRef = useRef<MotionPosition | null>(null);
  const careRef = useRef(care);
  const motionRef = useRef(motion);
  const petSettingsRef = useRef(petSettings);
  const petTransitionRef = useRef<PetTransitionState>(null);
  const petTransitionRunIdRef = useRef(0);
  const petTransitionTimerRef = useRef<number | null>(null);
  const animationTickTimerRef = useRef<number | null>(null);
  const anchorPositionRef = useRef<MotionPosition | null>(null);
  const anchorPositionUpdatedAtRef = useRef(0);
  const lastAppliedPositionRef = useRef<MotionPosition | null>(null);
  const settledRef = useRef(settled);
  const hasShownEntryRef = useRef(false);
  const petDisabled = disabled || !petSettings.enabled || !petAssetReadiness.ready;

  const readAnchorPosition = (time = typeof performance === "undefined" ? Date.now() : performance.now(), force = false) => {
    if (force || !anchorPositionRef.current || time - anchorPositionUpdatedAtRef.current > 1_000) {
      anchorPositionRef.current = getAnchorPosition();
      anchorPositionUpdatedAtRef.current = time;
    }

    return anchorPositionRef.current ?? getAnchorPosition();
  };

  const applyPosition = (force = false) => {
    const element = petRef.current;

    if (!element) {
      return;
    }

    const nextPosition = {
      x: Math.round(positionRef.current.x),
      y: Math.round(positionRef.current.y)
    };
    const lastPosition = lastAppliedPositionRef.current;

    if (!force && lastPosition?.x === nextPosition.x && lastPosition.y === nextPosition.y) {
      return;
    }

    element.style.setProperty("--needo-pet-x", `${nextPosition.x}px`);
    element.style.setProperty("--needo-pet-y", `${nextPosition.y}px`);
    lastAppliedPositionRef.current = nextPosition;
  };

  const updateMotionState = (nextMotion: PetMotionState) => {
    const currentMotion = motionRef.current;

    if (currentMotion.mode === nextMotion.mode && currentMotion.facing === nextMotion.facing && currentMotion.moving === nextMotion.moving) {
      return;
    }

    motionRef.current = nextMotion;
    setMotion(nextMotion);
  };

  const updateSettled = (nextSettled: boolean) => {
    if (settledRef.current === nextSettled) {
      return;
    }

    settledRef.current = nextSettled;
    setSettled(nextSettled);
  };

  const clearPetTransitionTimer = () => {
    if (petTransitionTimerRef.current !== null) {
      window.clearTimeout(petTransitionTimerRef.current);
      petTransitionTimerRef.current = null;
    }
  };

  const setPetTransitionState = (nextTransition: PetTransitionState) => {
    petTransitionRef.current = nextTransition;
    setPetTransition(nextTransition);

    if (nextTransition) {
      petTransitionRunIdRef.current += 1;
      setPetTransitionRunId(petTransitionRunIdRef.current);
    }
  };

  const stopPetMotion = (mode: PetMotionMode) => {
    draggingRef.current = false;
    dragSessionRef.current = null;
    setDragging(false);
    velocityRef.current = { x: 0, y: 0 };
    peekTargetRef.current = null;
    climbTargetRef.current = null;
    setMotion((current) => ({ facing: current.facing, mode, moving: false }));
  };

  const finishEntryTransition = () => {
    clearPetTransitionTimer();
    setPetTransitionState(null);
    setSettled(true);
    stopPetMotion("anchor");
    lastInteractionRef.current = performance.now();
    manualHoldUntilRef.current = performance.now() + 3_000;
  };

  const startEntryTransition = () => {
    clearPetTransitionTimer();
    positionRef.current = readAnchorPosition(undefined, true);
    applyPosition(true);
    setPanelOpen(false);
    stopPetMotion("rest");
    setSettled(false);
    setPetTransitionState("enter");
    petTransitionTimerRef.current = window.setTimeout(finishEntryTransition, xiaobaiOneShotClips.enter.durationMs);
  };

  const startReturnToAnchorTransition = () => {
    if (petTransitionRef.current || !careRef.current.alive) {
      return false;
    }

    clearPetTransitionTimer();
    setPanelOpen(false);
    setBubble(null);
    stopPetMotion("rest");
    setSettled(false);
    setPetTransitionState("exit");
    manualHoldUntilRef.current = performance.now() + xiaobaiOneShotClips.exit.durationMs + xiaobaiOneShotClips.enter.durationMs + 3_000;
    petTransitionTimerRef.current = window.setTimeout(() => {
      positionRef.current = getAnchorPosition();
      applyPosition();
      stopPetMotion("rest");
      setPetTransitionState("enter");
      petTransitionTimerRef.current = window.setTimeout(finishEntryTransition, xiaobaiOneShotClips.enter.durationMs);
    }, xiaobaiOneShotClips.exit.durationMs);

    return true;
  };

  const startExitAndDisable = () => {
    if (petTransitionRef.current) {
      return;
    }

    clearPetTransitionTimer();
    setPanelOpen(false);
    setBubble(null);
    stopPetMotion("rest");
    setSettled(false);
    setPetTransitionState("exit");
    petTransitionTimerRef.current = window.setTimeout(() => {
      clearPetTransitionTimer();
      setNeedoPetEnabled(false);
      setPetTransitionState(null);
    }, xiaobaiOneShotClips.exit.durationMs);
  };

  const startDeathTransition = () => {
    if (petTransitionRef.current || !careRef.current.alive) {
      return;
    }

    clearPetTransitionTimer();
    setPanelOpen(false);
    setBubble(null);
    stopPetMotion("dead");
    setSettled(true);
    setPetTransitionState("death");
    petTransitionTimerRef.current = window.setTimeout(() => {
      const now = Date.now();
      clearPetTransitionTimer();
      setCare((current) => ({
        ...current,
        alive: false,
        hunger: 0,
        hungerEmptySinceAt: current.hungerEmptySinceAt ?? now,
        lastUpdatedAt: now
      }));
      stopPetMotion("dead");
      setPetTransitionState(null);
    }, xiaobaiOneShotClips.death.durationMs);
  };

  const startReviveTransition = () => {
    if (petTransitionRef.current) {
      return;
    }

    clearPetTransitionTimer();
    setPanelOpen(false);
    setBubble(null);
    stopPetMotion("rest");
    setSettled(false);
    setPetTransitionState("revive");
    petTransitionTimerRef.current = window.setTimeout(() => {
      const now = Date.now();
      clearPetTransitionTimer();
      setCare({
        ...initialCare,
        hunger: 64,
        hungerEmptySinceAt: null,
        hygiene: 64,
        fun: 64,
        energy: 64,
        lastUpdatedAt: now
      });
      setPetTransitionState(null);
      setBubble({
        id: `revive-${now}`,
        text: "我回来了。这次要记得偶尔喂养、清扫和陪我玩。",
        title: "复活完成",
        tone: "happy"
      });
      stopPetMotion("anchor");
      setSettled(true);
      lastInteractionRef.current = performance.now();
      manualHoldUntilRef.current = performance.now() + 5_000;
    }, xiaobaiOneShotClips.revive.durationMs);
  };

  const reminders = useMemo<ReminderItem[]>(() => {
    if (!clientRole) {
      return [];
    }

    const prefix = getRolePrefix(clientRole);
    const socialRole: SocialPortalScope = clientRole;
    const socialActorKey = social.getActorForScope(socialRole);
    const items: ReminderItem[] = [
      {
        count: imStore.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
        label: "聊天未读",
        path: `${prefix}/messages`,
        type: "messages"
      },
      {
        count: imStore.friendRequests.filter((request) => request.status === "pending").length,
        label: "好友申请",
        path: `${prefix}/contacts/requests`,
        type: "contacts"
      },
      {
        count: social.getUnreadNotificationCount(socialActorKey),
        label: "动态提醒",
        path: `${prefix}/moments/notifications`,
        type: "moments"
      }
    ];

    return items
      .filter((item) => item.count > 0)
      .map((item) => ({ ...item }));
  }, [clientRole, imStore.conversations, imStore.friendRequests, social]);

  const latestExternalInfoTitle = useMemo(() => getLatestExternalInfoTitle(externalInfoPosts), [externalInfoPosts]);
  const totalReminderCount = reminders.reduce((sum, item) => sum + item.count, 0);
  const primaryReminder = reminders[0];
  const expression = getCareExpression(care, totalReminderCount > 0 || Boolean(latestExternalInfoTitle));
  const animationState = getPetAnimationState({ expression, facing: motion.facing, moving: motion.moving, mode: motion.mode, panelOpen, transition: petTransition });
  const spriteKey = getPetSpriteKey({ care, expression, moving: motion.moving, panelOpen, transition: petTransition });
  const bubbleVisible = Boolean(bubble && !panelOpen && !dragging && settled && !petTransition);
  const bubblePlacement = bubbleVisible ? getBubblePlacement(positionRef.current, motion.facing) : null;
  const panelPlacement = panelOpen ? getPanelPlacement(positionRef.current, motion.facing) : null;
  const goodbyeLabel = language === "ja" ? "バイバイ" : language === "en" ? "Bye" : language === "ko" ? "안녕" : language === "zh-Hant" ? "再見" : "再见";
  const panelSummaryText =
    totalReminderCount > 0
      ? `当前有 ${totalReminderCount} 条提醒，我会用气泡帮你归纳。`
      : petSettings.freeRoam
        ? "当前没有未读提醒，我会继续在界面上自由巡游。"
        : "当前没有未读提醒，我会在固定位置待机。";

  useEffect(() => {
    careRef.current = care;
  }, [care]);

  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useEffect(() => {
    settledRef.current = settled;
  }, [settled]);

  useEffect(() => {
    petSettingsRef.current = petSettings;
  }, [petSettings]);

  useEffect(() => {
    petTransitionRef.current = petTransition;
  }, [petTransition]);

  useEffect(() => {
    persistCareState(care);
  }, [care]);

  useEffect(() => {
    return subscribeNeedoExternalInfoPosts(() => {
      setExternalInfoPosts(readNeedoExternalInfoPosts());
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCare((current) => decayCareState(current));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshPlacement = () => {
      readAnchorPosition(undefined, true);
      positionRef.current = clampDragPosition(positionRef.current);
      applyPosition(true);
      setViewportRevision((current) => current + 1);
    };

    window.addEventListener("resize", refreshPlacement);
    window.addEventListener("orientationchange", refreshPlacement);

    return () => {
      window.removeEventListener("resize", refreshPlacement);
      window.removeEventListener("orientationchange", refreshPlacement);
    };
  }, []);

  useEffect(() => {
    if (petDisabled || !isAuthenticated || petTransition) {
      return;
    }

    if (totalReminderCount > 0 || latestExternalInfoTitle) {
      const highlights = buildReminderHighlights(reminders);
      setBubble({
        actionLabel: "查看",
        actionPath: primaryReminder?.path ?? "/needo?tab=reverse",
        highlights,
        id: `notice-${reminders.map((item) => `${item.type}:${item.count}`).join("-")}-${latestExternalInfoTitle}`,
        infoTitle: latestExternalInfoTitle || undefined,
        text: highlights.length > 0 ? "我先帮你归纳好了，点这里可以直接去处理。" : "我从情报页抓到了新的优惠标题，可以直接去看。",
        title: highlights.length > 0 ? "新提醒" : "新情报",
        tone: "notice"
      });
      return;
    }

    const careBubble = getLowCareBubble(care);

    if (careBubble && !panelOpen) {
      const timer = window.setTimeout(() => setBubble(careBubble), 900);
      return () => window.clearTimeout(timer);
    }
  }, [care, isAuthenticated, latestExternalInfoTitle, panelOpen, petDisabled, petTransition, primaryReminder?.path, reminders, totalReminderCount]);

  useEffect(() => {
    if (petDisabled || !isAuthenticated || location.pathname.startsWith("/login")) {
      hasShownEntryRef.current = false;
      return;
    }

    if (!hasShownEntryRef.current && care.alive) {
      hasShownEntryRef.current = true;
      startEntryTransition();
    }
  }, [care.alive, isAuthenticated, location.pathname, petDisabled]);

  useEffect(() => {
    if (petDisabled || !isAuthenticated || !care.alive || petTransition || care.hunger > 0 || !care.hungerEmptySinceAt) {
      return;
    }

    const remainingMs = hungerDeathDelay - (Date.now() - care.hungerEmptySinceAt);

    if (remainingMs <= 0) {
      startDeathTransition();
      return;
    }

    const timer = window.setTimeout(startDeathTransition, remainingMs);

    return () => window.clearTimeout(timer);
  }, [care.alive, care.hunger, care.hungerEmptySinceAt, isAuthenticated, petDisabled, petTransition]);

  useEffect(() => {
    if (petDisabled || !isAuthenticated) {
      return;
    }

    const markActive = (event: Event) => {
      if (event.target instanceof Node && petRef.current?.contains(event.target)) {
        return;
      }

      lastInteractionRef.current = performance.now();
      manualHoldUntilRef.current = 0;

      const currentMotion = motionRef.current;

      if (
        petSettingsRef.current.freeRoam &&
        careRef.current.alive &&
        !petTransitionRef.current &&
        (currentMotion.moving || currentMotion.mode === "roam" || currentMotion.mode === "climb" || currentMotion.mode === "peek")
      ) {
        startReturnToAnchorTransition();
      }
    };
    const activeEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"];

    activeEvents.forEach((eventName) => window.addEventListener(eventName, markActive, { passive: true }));

    return () => {
      activeEvents.forEach((eventName) => window.removeEventListener(eventName, markActive));
    };
  }, [isAuthenticated, petDisabled]);

  useEffect(() => {
    const element = petRef.current;

    if (!element || petDisabled || !isAuthenticated) {
      return;
    }

    const scheduleNextAnimationFrame = (callback: FrameRequestCallback, delayMs = 0) => {
      if (delayMs > 0) {
        animationTickTimerRef.current = window.setTimeout(() => {
          animationTickTimerRef.current = null;
          animationFrameRef.current = window.requestAnimationFrame(callback);
        }, delayMs);
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(callback);
    };

    const animate = (time: number) => {
      const dt = Math.min(32, time - (lastFrameRef.current || time)) / 16.67;
      lastFrameRef.current = time;
      let useIdleTick = false;

      if (!draggingRef.current) {
        if (petTransitionRef.current) {
          velocityRef.current = { x: 0, y: 0 };
          applyPosition();
          scheduleNextAnimationFrame(animate);
          return;
        }

        const position = positionRef.current;
        const previousX = position.x;
        const previousY = position.y;
        const velocity = velocityRef.current;
        const maxX = Math.max(8, window.innerWidth - petSize.width - 8);
        const maxY = Math.max(8, window.innerHeight - petSize.height - 8);
        const idleEnough = time - lastInteractionRef.current >= idleRoamDelay;
        const manualHold = time < manualHoldUntilRef.current;
        let mode: PetMotionMode = care.alive ? "anchor" : "dead";
        let anchorTarget: MotionPosition | null = null;

        if (peekTargetRef.current) {
          mode = "peek";
          position.x += (peekTargetRef.current.x - position.x) * 0.16;
          position.y += (peekTargetRef.current.y - position.y) * 0.16;
          velocity.x *= 0.86;
          velocity.y *= 0.86;
        } else if (!care.alive) {
          velocity.x = 0;
          velocity.y = 0;
        } else if (panelOpen) {
          mode = "rest";
          velocity.x *= 0.94;
          velocity.y *= 0.94;
        } else if (manualHold) {
          mode = "rest";
          velocity.x *= 0.86;
          velocity.y *= 0.86;
        } else if (!petSettings.freeRoam || !idleEnough) {
          const anchor = readAnchorPosition(time);
          anchorTarget = anchor;
          mode = "anchor";
          climbTargetRef.current = null;
          velocity.x *= 0.78;
          velocity.y *= 0.78;
          position.x += (anchor.x - position.x) * 0.085;
          position.y += (anchor.y - position.y) * 0.085;
        } else {
          mode = "roam";

          if (time - lastWanderRef.current > 7_800) {
            lastWanderRef.current = time;
            velocity.x = (Math.random() > 0.5 ? 1 : -1) * (0.16 + Math.random() * 0.22);
            velocity.y = (Math.random() - 0.5) * 0.18;
          }

          if (time - lastSurfaceCheckRef.current > 3_200) {
            lastSurfaceCheckRef.current = time;
            climbTargetRef.current = findClimbSurface(position) ?? null;
          }

          if (climbTargetRef.current) {
            const rect = climbTargetRef.current;
            const targetY = clamp(rect.top - petSize.height + 16, 8, maxY);
            mode = "climb";
            position.y += (targetY - position.y) * 0.055;

            if (position.x < rect.left - 34 || position.x > rect.right - petSize.width + 34 || Math.abs(position.y - targetY) < 7) {
              climbTargetRef.current = null;
            }
          } else {
            position.y += velocity.y * dt * 2.2;
          }

          position.x += velocity.x * dt * 2.8;

          if (position.x <= 8 || position.x >= maxX) {
            velocity.x *= -1;
            position.x = clamp(position.x, 8, maxX);
          }

          if (position.y <= 8 || position.y >= maxY) {
            velocity.y *= -1;
            position.y = clamp(position.y, 8, maxY);
          }
        }

        positionRef.current =
          mode === "peek"
            ? clampDragPosition(position)
            : {
                x: clamp(position.x, 8, maxX),
                y: clamp(position.y, 8, maxY)
              };

        const horizontalDelta = positionRef.current.x - previousX;
        const verticalDelta = positionRef.current.y - previousY;
        const distanceMoved = Math.hypot(horizontalDelta, verticalDelta);
        const anchorDistance = anchorTarget
          ? Math.hypot(positionRef.current.x - anchorTarget.x, positionRef.current.y - anchorTarget.y)
          : 0;
        const peekDistance = peekTargetRef.current
          ? Math.hypot(positionRef.current.x - peekTargetRef.current.x, positionRef.current.y - peekTargetRef.current.y)
          : 0;
        const nextMoving =
          !panelOpen &&
          mode !== "dead" &&
          mode !== "rest" &&
          (mode === "roam" ||
            mode === "climb" ||
            (mode === "anchor" && anchorDistance > 6) ||
            (mode === "peek" && peekDistance > 6) ||
            distanceMoved > 0.2);
        const nextFacing: PetFacing = Math.abs(horizontalDelta) > 0.08 ? (horizontalDelta >= 0 ? "right" : "left") : velocity.x >= 0 ? "right" : "left";
        updateMotionState({ facing: nextFacing, mode, moving: nextMoving });
        const nextSettled =
          mode === "rest" ||
          mode === "dead" ||
          (mode === "anchor" &&
            Math.hypot(positionRef.current.x - (anchorTarget ?? readAnchorPosition(time)).x, positionRef.current.y - (anchorTarget ?? readAnchorPosition(time)).y) < 10);
        updateSettled(nextSettled);
        useIdleTick =
          !petSettings.freeRoam &&
          !petTransitionRef.current &&
          !peekTargetRef.current &&
          !panelOpen &&
          mode === "anchor" &&
          nextSettled &&
          distanceMoved < 0.2;
        applyPosition();
      }

      scheduleNextAnimationFrame(animate, useIdleTick ? 250 : 0);
    };

    applyPosition(true);
    scheduleNextAnimationFrame(animate);
    const persist = () => persistMotionPosition(positionRef.current);
    const persistTimer = window.setInterval(persist, 4_000);
    window.addEventListener("beforeunload", persist);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      if (animationTickTimerRef.current !== null) {
        window.clearTimeout(animationTickTimerRef.current);
        animationTickTimerRef.current = null;
      }
      window.clearInterval(persistTimer);
      window.removeEventListener("beforeunload", persist);
      persist();
    };
  }, [care.alive, isAuthenticated, panelOpen, petDisabled, petSettings.freeRoam]);

  if (petDisabled || !isAuthenticated || location.pathname.startsWith("/login")) {
    return null;
  }

  const updateCare = (updater: (current: PetCareState) => PetCareState, bubbleText: string) => {
    setCare((current) => {
      const next = updater(decayCareState(current));
      return {
        ...next,
        hungerEmptySinceAt: next.hunger > 0 ? null : next.hungerEmptySinceAt ?? Date.now(),
        lastUpdatedAt: Date.now()
      };
    });
    setBubble({
      id: `care-action-${Date.now()}`,
      text: bubbleText,
      title: "照顾完成",
      tone: "happy"
    });
  };

  const feedPet = () => {
    updateCare(
      (current) => ({
        ...current,
        alive: current.alive,
        energy: clamp(current.energy + 5),
        fun: clamp(current.fun + 4),
        hunger: clamp(current.hunger + 32)
      }),
      "吃饱了。接下来我会更精神地帮你盯着消息。"
    );
  };

  const cleanPet = () => {
    updateCare(
      (current) => ({
        ...current,
        energy: clamp(current.energy - 2),
        hygiene: clamp(current.hygiene + 36)
      }),
      "清爽回来了。通知气泡也会继续保持干净利落。"
    );
  };

  const playPet = () => {
    updateCare(
      (current) => ({
        ...current,
        energy: clamp(current.energy - 8),
        fun: clamp(current.fun + 34),
        hunger: clamp(current.hunger - 7),
        hygiene: clamp(current.hygiene - 4)
      }),
      "玩得很开心。心情恢复了。"
    );
  };

  const restPet = () => {
    updateCare(
      (current) => ({
        ...current,
        energy: clamp(current.energy + 30),
        fun: clamp(current.fun - 3)
      }),
      "休息了一下，电量恢复。"
    );
  };

  const revivePet = () => {
    startReviveTransition();
  };

  const sayGoodbye = () => {
    startExitAndDisable();
  };

  const toggleFreeRoam = () => {
    setNeedoPetFreeRoam(!petSettings.freeRoam);
  };

  const openBubbleAction = () => {
    if (bubble?.actionPath) {
      navigate(bubble.actionPath);
    }
    setBubble(null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (petTransitionRef.current) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    setSettled(false);
    peekTargetRef.current = null;
    climbTargetRef.current = null;
    lastInteractionRef.current = performance.now();
    dragSessionRef.current = {
      moved: false,
      offsetX: event.clientX - positionRef.current.x,
      offsetY: event.clientY - positionRef.current.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    setMotion((current) => ({ ...current, mode: "rest", moving: false }));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const movedDistance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
    dragSessionRef.current = {
      ...session,
      moved: session.moved || movedDistance > 5
    };
    positionRef.current = clampDragPosition({
      x: event.clientX - session.offsetX,
      y: event.clientY - session.offsetY
    });
    applyPosition();
  };

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingRef.current = false;
    setDragging(false);
    dragSessionRef.current = null;
    lastInteractionRef.current = performance.now();

    if (!session.moved) {
      setPanelOpen((current) => !current);
      return;
    }

    const peekTarget = getEdgePeekTarget(positionRef.current);

    if (peekTarget) {
      peekTargetRef.current = peekTarget;
      manualHoldUntilRef.current = 0;
      return;
    }

    manualHoldUntilRef.current = performance.now() + 10_000;
  };

  const cancelPointerInteraction = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    draggingRef.current = false;
    setDragging(false);
    dragSessionRef.current = null;
    manualHoldUntilRef.current = performance.now() + 3_000;
  };

  const containerStyle = {
    "--needo-pet-x": `${Math.round(positionRef.current.x)}px`,
    "--needo-pet-y": `${Math.round(positionRef.current.y)}px`
  } as CSSProperties;
  const bubbleStyle = bubblePlacement
    ? ({
        "--needo-pet-bubble-arrow-x": `${Math.round(bubblePlacement.arrowX ?? 20)}px`,
        "--needo-pet-bubble-max-height": `${Math.round(bubblePlacement.maxHeight)}px`,
        "--needo-pet-bubble-origin-x": `${Math.round(bubblePlacement.originX ?? 20)}px`,
        "--needo-pet-bubble-width": `${Math.round(bubblePlacement.width)}px`,
        "--needo-pet-bubble-x": `${Math.round(bubblePlacement.x)}px`,
        "--needo-pet-bubble-y": `${Math.round(bubblePlacement.y)}px`
      } as CSSProperties)
    : undefined;
  const panelStyle = panelPlacement
    ? ({
        "--needo-pet-panel-max-height": `${Math.round(panelPlacement.maxHeight)}px`,
        "--needo-pet-panel-width": `${Math.round(panelPlacement.width)}px`,
        "--needo-pet-panel-x": `${Math.round(panelPlacement.x)}px`,
        "--needo-pet-panel-y": `${Math.round(panelPlacement.y)}px`
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={cn(
        "needo-pet-layer",
        getClientThemeModeClassName(theme),
        getClientThemeClassName(theme),
        panelOpen && "is-panel-open"
      )}
      data-animation={animationState}
      data-facing={motion.facing}
      data-motion={motion.mode}
      ref={petRef}
      style={containerStyle}
    >
      {bubbleVisible && bubble ? (
        <div className={cn("needo-pet-bubble", `is-${bubble.tone}`)} data-page-drag-ignore="true" style={bubbleStyle}>
          <button aria-label="关闭宠物气泡" className="needo-pet-bubble-close" onClick={() => setBubble(null)} type="button">
            ×
          </button>
          <strong className="needo-pet-bubble-title">{bubble.title}</strong>
          <NeedoPetBubbleBody bubble={bubble} />
          {bubble.actionPath ? (
            <button className="needo-pet-bubble-action" onClick={openBubbleAction} type="button">
              {bubble.actionLabel ?? "查看"}
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        aria-label="NeeDo 电子宠物"
        className="needo-pet-button"
        data-page-drag-ignore="true"
        draggable={false}
        onPointerCancel={cancelPointerInteraction}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        type="button"
      >
        <NeedoPetSprite runId={petTransitionRunId} sprite={spriteKey} />
      </button>
      {totalReminderCount > 0 ? <NotificationBadge className="needo-pet-count" count={totalReminderCount} size="sm" /> : null}
      {panelOpen ? (
        <div className="needo-pet-panel" data-page-drag-ignore="true" style={panelStyle}>
          <div className="needo-pet-panel-header">
            <div>
              <span>小白 / Xiaobai</span>
              <strong>{care.alive ? "陪伴中" : "已死亡"}</strong>
            </div>
            <span className={cn("needo-pet-panel-status", care.alive ? "is-alive" : "is-dead")}>{care.alive ? "ON" : "OFF"}</span>
            <button aria-label="收起电子宠物面板" onClick={() => setPanelOpen(false)} type="button">
              ×
            </button>
          </div>
          <div className="needo-pet-panel-summary">{panelSummaryText}</div>
          <div className="needo-pet-free-roam">
            <div>
              <span>自由活动</span>
              <strong>{petSettings.freeRoam ? "开启" : "关闭"}</strong>
            </div>
            <button
              aria-checked={petSettings.freeRoam}
              aria-label="自由活动"
              className={cn("needo-pet-switch", petSettings.freeRoam && "is-on")}
              onClick={toggleFreeRoam}
              role="switch"
              type="button"
            >
              <span />
            </button>
          </div>
          <div className="needo-pet-meters">
            <CareMeter label="饱腹" value={care.hunger} />
            <CareMeter label="清洁" value={care.hygiene} />
            <CareMeter label="心情" value={care.fun} />
            <CareMeter label="体力" value={care.energy} />
          </div>
          <div className="needo-pet-actions">
            {care.alive ? (
              <>
                <button onClick={feedPet} type="button">喂养</button>
                <button onClick={cleanPet} type="button">清扫</button>
                <button onClick={playPet} type="button">娱乐</button>
                <button onClick={restPet} type="button">休息</button>
              </>
            ) : (
              <button className="needo-pet-revive" onClick={revivePet} type="button">复活</button>
            )}
          </div>
          <div className="needo-pet-panel-footer">
            <button className="needo-pet-goodbye" onClick={sayGoodbye} type="button">
              {goodbyeLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
