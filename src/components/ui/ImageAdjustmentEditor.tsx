import { useLayoutEffect, useState, type CSSProperties, type PointerEvent } from "react";
import { MobileFullscreenCloseButton } from "../mobile/MobileFullscreenHeader";
import { cn } from "../../lib/utils";

type ImageAdjustmentDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export type ImageAdjustmentState = {
  brightness: number;
  contrast: number;
  drag?: ImageAdjustmentDrag;
  naturalHeight: number;
  naturalWidth: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type ImageAdjustmentFrame = {
  height: number;
  width: number;
};

export type ImageAdjustmentEditorProps = {
  applyLabel?: string;
  aspectRatio?: number;
  description?: string;
  frameClassName?: string;
  frameWidth?: number;
  onApply: (dataUrl: string) => void | Promise<void>;
  onCancel: () => void;
  outputMimeType?: string;
  outputQuality?: number;
  outputWidth?: number;
  previewAlt?: string;
  source: string;
  title?: string;
};

const imageAdjustmentFrameWidth = 288;
const imageAdjustmentMaxFrameHeight = 288;
const imageAdjustmentMinAspectRatio = 0.72;
const imageAdjustmentMaxAspectRatio = 3.2;
const imageAdjustmentEdgeGuard = 0.5;

const imageAdjustmentDialogClassName =
  "max-h-[calc(100dvh-48px)] w-full max-w-[380px] overflow-y-auto rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_26%,var(--client-line))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_92%,var(--client-primary)_8%),var(--client-bg))] p-4 text-[color:var(--client-text)] shadow-[0_28px_68px_rgba(0,0,0,0.42)]";
const imageAdjustmentSecondaryButtonClassName =
  "border-[color:color-mix(in_srgb,var(--client-line)_78%,var(--client-primary)_10%)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-primary)_12%)] text-[color:var(--client-text)]";
const imageAdjustmentPrimaryButtonClassName =
  "border-[color:color-mix(in_srgb,var(--client-primary)_72%,var(--client-line))] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_14px_28px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]";

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAspectRatio(aspectRatio: number) {
  return clampNumber(aspectRatio || 1, imageAdjustmentMinAspectRatio, imageAdjustmentMaxAspectRatio);
}

function formatImageAdjustmentPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getImageAdjustmentFrame(aspectRatio = 1, frameWidth = imageAdjustmentFrameWidth): ImageAdjustmentFrame {
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  const resolvedFrameWidth = clampNumber(frameWidth || imageAdjustmentFrameWidth, 240, 344);

  return {
    height: Math.min(imageAdjustmentMaxFrameHeight, Math.round(resolvedFrameWidth / normalizedAspectRatio)),
    width: resolvedFrameWidth
  };
}

function createInitialImageAdjustmentState(): ImageAdjustmentState {
  return {
    brightness: 100,
    contrast: 100,
    naturalHeight: 0,
    naturalWidth: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1
  };
}

function getImageAdjustmentBaseScale(state: ImageAdjustmentState, frame: ImageAdjustmentFrame) {
  if (state.naturalWidth <= 0 || state.naturalHeight <= 0) {
    return 1;
  }

  return Math.max(frame.width / state.naturalWidth, frame.height / state.naturalHeight);
}

export function getImageAdjustmentCoverSize(state: ImageAdjustmentState, frame: ImageAdjustmentFrame) {
  const baseScale = getImageAdjustmentBaseScale(state, frame);

  return {
    coverHeight: state.naturalHeight > 0 ? state.naturalHeight * baseScale : frame.height,
    coverWidth: state.naturalWidth > 0 ? state.naturalWidth * baseScale : frame.width
  };
}

export function getImageAdjustmentRenderSize(state: ImageAdjustmentState, frame: ImageAdjustmentFrame) {
  const scale = clampNumber(state.scale, 1, 3);
  const { coverHeight, coverWidth } = getImageAdjustmentCoverSize(state, frame);

  return {
    renderHeight: coverHeight * scale,
    renderWidth: coverWidth * scale
  };
}

export function getImageAdjustmentOffsetBounds(state: ImageAdjustmentState, frame: ImageAdjustmentFrame) {
  if (state.naturalWidth <= 0 || state.naturalHeight <= 0) {
    return {
      maxOffsetX: 0,
      maxOffsetY: 0
    };
  }

  const { renderHeight, renderWidth } = getImageAdjustmentRenderSize(state, frame);

  return {
    maxOffsetX: Math.max(0, (renderWidth - frame.width) / 2 - imageAdjustmentEdgeGuard),
    maxOffsetY: Math.max(0, (renderHeight - frame.height) / 2 - imageAdjustmentEdgeGuard)
  };
}

export function clampImageAdjustmentState(state: ImageAdjustmentState, frame: ImageAdjustmentFrame): ImageAdjustmentState {
  if (state.naturalWidth <= 0 || state.naturalHeight <= 0) {
    return state;
  }

  const scale = clampNumber(state.scale, 1, 3);
  const { maxOffsetX, maxOffsetY } = getImageAdjustmentOffsetBounds({ ...state, scale }, frame);

  return {
    ...state,
    brightness: clampNumber(state.brightness, 70, 130),
    contrast: clampNumber(state.contrast, 70, 140),
    offsetX: clampNumber(state.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampNumber(state.offsetY, -maxOffsetY, maxOffsetY),
    scale
  };
}

function loadEditableImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}

async function createAdjustedImageDataUrl({
  aspectRatio,
  outputMimeType,
  outputQuality,
  outputWidth,
  source,
  state,
  frameWidth
}: {
  aspectRatio: number;
  frameWidth?: number;
  outputMimeType: string;
  outputQuality: number;
  outputWidth: number;
  source: string;
  state: ImageAdjustmentState;
}) {
  const image = await loadEditableImage(source);
  const frame = getImageAdjustmentFrame(aspectRatio, frameWidth);
  const resolvedState = clampImageAdjustmentState(
    {
      ...state,
      naturalHeight: image.naturalHeight,
      naturalWidth: image.naturalWidth
    },
    frame
  );
  const baseScale = getImageAdjustmentBaseScale(resolvedState, frame);
  const effectiveScale = baseScale * resolvedState.scale;
  const sourceWidth = frame.width / effectiveScale;
  const sourceHeight = frame.height / effectiveScale;
  const centerX = image.naturalWidth / 2 - resolvedState.offsetX / effectiveScale;
  const centerY = image.naturalHeight / 2 - resolvedState.offsetY / effectiveScale;
  const sourceX = clampNumber(centerX - sourceWidth / 2, 0, Math.max(0, image.naturalWidth - sourceWidth));
  const sourceY = clampNumber(centerY - sourceHeight / 2, 0, Math.max(0, image.naturalHeight - sourceHeight));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = Math.max(1, Math.round(outputWidth));
  canvas.height = Math.max(1, Math.round(outputWidth / normalizeAspectRatio(aspectRatio)));

  if (!context) {
    return source;
  }

  context.filter = `brightness(${resolvedState.brightness}%) contrast(${resolvedState.contrast}%)`;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL(outputMimeType, outputQuality);
}

export function ImageAdjustmentEditor({
  applyLabel = "套用图片",
  aspectRatio = 1,
  description = "拖动图片调整位置，用滑块放大缩小。保存后会套用到当前图片。",
  frameClassName = "rounded-[28px]",
  frameWidth,
  onApply,
  onCancel,
  outputMimeType = "image/jpeg",
  outputQuality = 0.84,
  outputWidth = 1024,
  previewAlt = "图片编辑预览",
  source,
  title = "图片编辑"
}: ImageAdjustmentEditorProps) {
  const frame = getImageAdjustmentFrame(aspectRatio, frameWidth);
  const [state, setState] = useState<ImageAdjustmentState>(() => createInitialImageAdjustmentState());
  const [applying, setApplying] = useState(false);
  const imageReady = state.naturalWidth > 0 && state.naturalHeight > 0;
  const { renderHeight, renderWidth } = getImageAdjustmentRenderSize(state, frame);
  const scalePercent = Math.round(state.scale * 100);
  const brightnessPercent = Math.round(state.brightness);
  const contrastPercent = Math.round(state.contrast);
  const imageStyle: CSSProperties = {
    filter: `brightness(${state.brightness}%) contrast(${state.contrast}%)`,
    height: `${renderHeight}px`,
    left: `calc(50% + ${state.offsetX}px)`,
    top: `calc(50% + ${state.offsetY}px)`,
    transform: "translate(-50%, -50%)",
    visibility: imageReady ? "visible" : "hidden",
    width: `${renderWidth}px`
  };
  const updateState = (resolveNextState: (currentState: ImageAdjustmentState) => ImageAdjustmentState) =>
    setState((currentState) => clampImageAdjustmentState(resolveNextState(currentState), frame));
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateState((currentState) => ({
      ...currentState,
      drag: {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: currentState.offsetX,
        originY: currentState.offsetY
      }
    }));
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    updateState((currentState) => {
      if (!currentState.drag || currentState.drag.pointerId !== event.pointerId) {
        return currentState;
      }

      return {
        ...currentState,
        offsetX: currentState.drag.originX + event.clientX - currentState.drag.startX,
        offsetY: currentState.drag.originY + event.clientY - currentState.drag.startY
      };
    });
  };
  const clearDrag = (event: PointerEvent<HTMLDivElement>) => {
    updateState((currentState) => (currentState.drag?.pointerId === event.pointerId ? { ...currentState, drag: undefined } : currentState));
  };
  const resetAdjustments = () =>
    updateState((currentState) => ({
      ...createInitialImageAdjustmentState(),
      naturalHeight: currentState.naturalHeight,
      naturalWidth: currentState.naturalWidth
    }));
  const applyAdjustments = async () => {
    setApplying(true);

    try {
      const adjustedImage = await createAdjustedImageDataUrl({
        aspectRatio,
        outputMimeType,
        outputQuality,
        outputWidth,
        source,
        state,
        frameWidth
      });

      await onApply(adjustedImage);
    } finally {
      setApplying(false);
    }
  };

  useLayoutEffect(() => {
    setState(createInitialImageAdjustmentState());
  }, [source]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/68 px-4 py-[calc(env(safe-area-inset-top)+24px)] backdrop-blur-sm"
      role="dialog"
    >
      <div className={imageAdjustmentDialogClassName}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[20px] font-black leading-none text-[color:var(--client-text)]">{title}</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{description}</p>
          </div>
          <MobileFullscreenCloseButton
            className="h-10 w-10 shrink-0 border-[color:color-mix(in_srgb,var(--client-line)_78%,var(--client-primary)_10%)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-primary)_12%)] text-[color:var(--client-primary)]"
            label="关闭图片编辑"
            onClose={onCancel}
          />
        </div>
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn("relative touch-none overflow-hidden border border-[color:color-mix(in_srgb,var(--client-primary)_58%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_82%,var(--client-primary)_18%)] shadow-[0_18px_36px_rgba(0,0,0,0.24)] ring-1 ring-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)]", frameClassName)}
            onPointerCancel={clearDrag}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearDrag}
            style={{ height: `${frame.height}px`, width: `${frame.width}px` }}
          >
            <img
              alt={previewAlt}
              className="absolute block max-w-none select-none"
              draggable={false}
              onLoad={(event) => {
                const { naturalHeight, naturalWidth } = event.currentTarget;

                updateState((currentState) => ({
                  ...currentState,
                  naturalHeight,
                  naturalWidth
                }));
              }}
              src={source}
              style={imageStyle}
            />
            <div className={cn("pointer-events-none absolute inset-0 ring-2 ring-inset ring-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)]", frameClassName)} />
            <div className="pointer-events-none absolute inset-x-1/3 top-0 h-full border-x border-[color:color-mix(in_srgb,var(--client-text)_32%,transparent)]" />
            <div className="pointer-events-none absolute inset-y-1/3 left-0 w-full border-y border-[color:color-mix(in_srgb,var(--client-text)_32%,transparent)]" />
          </div>
          <div className="w-full min-w-0 space-y-3">
            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-[color:var(--client-muted)]">
                <span>缩放</span>
                <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2 py-0.5 text-[color:var(--client-primary)]">
                  {formatImageAdjustmentPercent(scalePercent)}
                </span>
              </span>
              <input
                aria-label="缩放"
                className="w-full accent-[color:var(--client-primary)]"
                max="3"
                min="1"
                onChange={(event) => updateState((currentState) => ({ ...currentState, scale: Number(event.target.value) }))}
                step="0.01"
                type="range"
                value={state.scale}
              />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-[color:var(--client-muted)]">
                <span>亮度</span>
                <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2 py-0.5 text-[color:var(--client-primary)]">
                  {formatImageAdjustmentPercent(brightnessPercent)}
                </span>
              </span>
              <input
                aria-label="亮度"
                className="w-full accent-[color:var(--client-primary)]"
                max="130"
                min="70"
                onChange={(event) => updateState((currentState) => ({ ...currentState, brightness: Number(event.target.value) }))}
                step="1"
                type="range"
                value={state.brightness}
              />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-[color:var(--client-muted)]">
                <span>对比度</span>
                <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2 py-0.5 text-[color:var(--client-primary)]">
                  {formatImageAdjustmentPercent(contrastPercent)}
                </span>
              </span>
              <input
                aria-label="对比度"
                className="w-full accent-[color:var(--client-primary)]"
                max="140"
                min="70"
                onChange={(event) => updateState((currentState) => ({ ...currentState, contrast: Number(event.target.value) }))}
                step="1"
                type="range"
                value={state.contrast}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button className={cn("rounded-[18px] border px-3 py-3 text-sm font-black", imageAdjustmentSecondaryButtonClassName)} onClick={onCancel} type="button">
                取消裁剪
              </button>
              <button className={cn("rounded-[18px] border px-3 py-3 text-sm font-black", imageAdjustmentSecondaryButtonClassName)} onClick={resetAdjustments} type="button">
                还原
              </button>
              <button className={cn("rounded-[18px] border px-3 py-3 text-sm font-black", imageAdjustmentPrimaryButtonClassName)} disabled={applying} onClick={() => void applyAdjustments()} type="button">
                {applying ? "套用中..." : applyLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
