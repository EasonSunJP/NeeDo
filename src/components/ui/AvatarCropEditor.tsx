import { type PointerEvent } from "react";
import { cn } from "../../lib/utils";

const avatarCropDialogClassName =
  "max-h-[calc(100dvh-48px)] w-full max-w-[360px] overflow-y-auto rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_26%,var(--client-line))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_92%,var(--client-primary)_8%),var(--client-bg))] p-4 text-[color:var(--client-text)] shadow-[0_28px_68px_rgba(0,0,0,0.42)]";
const avatarCropSecondaryButtonClassName =
  "border-[color:color-mix(in_srgb,var(--client-line)_78%,var(--client-primary)_10%)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-primary)_12%)] text-[color:var(--client-text)]";
const avatarCropPrimaryButtonClassName =
  "border-[color:color-mix(in_srgb,var(--client-primary)_72%,var(--client-line))] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_14px_28px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]";
const avatarCropFrameClassName =
  "relative h-[240px] w-[240px] touch-none overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_58%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_82%,var(--client-primary)_18%)] shadow-[0_18px_36px_rgba(0,0,0,0.24)] ring-1 ring-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)]";
type AvatarCropDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};
export type AvatarCropState = {
  source: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  naturalWidth: number;
  naturalHeight: number;
  drag?: AvatarCropDrag;
};
const avatarCropFrameSize = 240;
const avatarCropOutputSize = 512;
function clampCropNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAvatarCropBaseScale(crop: AvatarCropState) {
  if (crop.naturalWidth <= 0 || crop.naturalHeight <= 0) {
    return 1;
  }

  return Math.max(
    avatarCropFrameSize / crop.naturalWidth,
    avatarCropFrameSize / crop.naturalHeight,
  );
}

function clampAvatarCrop(crop: AvatarCropState): AvatarCropState {
  if (crop.naturalWidth <= 0 || crop.naturalHeight <= 0) {
    return crop;
  }

  const baseScale = getAvatarCropBaseScale(crop);
  const displayWidth = crop.naturalWidth * baseScale * crop.scale;
  const displayHeight = crop.naturalHeight * baseScale * crop.scale;
  const maxOffsetX = Math.max(0, (displayWidth - avatarCropFrameSize) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - avatarCropFrameSize) / 2);

  return {
    ...crop,
    offsetX: clampCropNumber(crop.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampCropNumber(crop.offsetY, -maxOffsetY, maxOffsetY),
  };
}

function loadCropImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load avatar image."));
    image.src = source;
  });
}

export async function createCroppedAvatarDataUrl(crop: AvatarCropState) {
  const image = await loadCropImage(crop.source);
  const baseScale = getAvatarCropBaseScale({
    ...crop,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  });
  const effectiveScale = baseScale * crop.scale;
  const sourceSize = avatarCropFrameSize / effectiveScale;
  const centerX = image.naturalWidth / 2 - crop.offsetX / effectiveScale;
  const centerY = image.naturalHeight / 2 - crop.offsetY / effectiveScale;
  const sourceX = clampCropNumber(
    centerX - sourceSize / 2,
    0,
    Math.max(0, image.naturalWidth - sourceSize),
  );
  const sourceY = clampCropNumber(
    centerY - sourceSize / 2,
    0,
    Math.max(0, image.naturalHeight - sourceSize),
  );
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = avatarCropOutputSize;
  canvas.height = avatarCropOutputSize;

  if (!context) {
    return crop.source;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    avatarCropOutputSize,
    avatarCropOutputSize,
  );
  return canvas.toDataURL("image/jpeg", 0.84);
}

export function AvatarCropEditor({
  crop,
  onApply,
  onCancel,
  onChange,
}: {
  crop: AvatarCropState;
  onApply: () => void;
  onCancel: () => void;
  onChange: (crop: AvatarCropState) => void;
}) {
  const baseScale = getAvatarCropBaseScale(crop);
  const imageWidth =
    crop.naturalWidth > 0 ? crop.naturalWidth * baseScale : avatarCropFrameSize;
  const imageHeight =
    crop.naturalHeight > 0
      ? crop.naturalHeight * baseScale
      : avatarCropFrameSize;
  const imageStyle = {
    height: `${imageHeight}px`,
    transform: `translate(-50%, -50%) translate(${crop.offsetX}px, ${crop.offsetY}px) scale(${crop.scale})`,
    width: `${imageWidth}px`,
  };
  const updateCrop = (nextCrop: AvatarCropState) =>
    onChange(clampAvatarCrop(nextCrop));
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onChange({
      ...crop,
      drag: {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: crop.offsetX,
        originY: crop.offsetY,
      },
    });
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop.drag || crop.drag.pointerId !== event.pointerId) {
      return;
    }

    updateCrop({
      ...crop,
      offsetX: crop.drag.originX + event.clientX - crop.drag.startX,
      offsetY: crop.drag.originY + event.clientY - crop.drag.startY,
    });
  };
  const clearDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (crop.drag?.pointerId === event.pointerId) {
      onChange({ ...crop, drag: undefined });
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/68 px-4 py-[calc(env(safe-area-inset-top)+24px)] backdrop-blur-sm"
      role="dialog"
    >
      <div className={avatarCropDialogClassName}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black">头像裁剪</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
              拖动图片调整位置，用滑块放大缩小。保存后会按圆角正方形头像框显示。
            </p>
          </div>
          <button
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-black",
              avatarCropSecondaryButtonClassName,
            )}
            onClick={onCancel}
            type="button"
          >
            关闭
          </button>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="shrink-0">
            <div
              className={avatarCropFrameClassName}
              onPointerCancel={clearDrag}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={clearDrag}
            >
              <img
                alt="头像裁剪预览"
                className="absolute left-1/2 top-1/2 max-w-none select-none object-cover"
                draggable={false}
                onLoad={(event) => {
                  updateCrop({
                    ...crop,
                    naturalHeight: event.currentTarget.naturalHeight,
                    naturalWidth: event.currentTarget.naturalWidth,
                  });
                }}
                src={crop.source}
                style={imageStyle}
              />
              <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-2 ring-inset ring-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)]" />
              <div className="pointer-events-none absolute inset-x-1/3 top-0 h-full border-x border-[color:color-mix(in_srgb,var(--client-text)_32%,transparent)]" />
              <div className="pointer-events-none absolute inset-y-1/3 left-0 w-full border-y border-[color:color-mix(in_srgb,var(--client-text)_32%,transparent)]" />
            </div>
          </div>
          <div className="w-full min-w-0 space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">
                缩放
              </span>
              <input
                className="w-full accent-[color:var(--client-primary)]"
                max="3"
                min="1"
                onChange={(event) =>
                  updateCrop({ ...crop, scale: Number(event.target.value) })
                }
                step="0.01"
                type="range"
                value={crop.scale}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={cn(
                  "rounded-[18px] border px-4 py-3 text-sm font-black",
                  avatarCropSecondaryButtonClassName,
                )}
                onClick={onCancel}
                type="button"
              >
                取消裁剪
              </button>
              <button
                className={cn(
                  "rounded-[18px] border px-4 py-3 text-sm font-black",
                  avatarCropPrimaryButtonClassName,
                )}
                onClick={onApply}
                type="button"
              >
                套用头像
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
