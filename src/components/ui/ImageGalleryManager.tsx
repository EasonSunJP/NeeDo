import { useState, type ChangeEvent } from "react";
import { Button } from "./Button";
import { ImageAdjustmentEditor } from "./ImageAdjustmentEditor";
import { readImageFilesAsDataUrls } from "../../lib/imageUpload";
import { cn } from "../../lib/utils";

type PendingImageEdit = {
  acceptedImages: string[];
  index?: number;
  mode: "append" | "replace";
  queue: string[];
  source: string;
};

export function ImageGalleryManager({
  images,
  maxImages,
  label,
  description,
  emptyHint = "暂时还没有图片，新增后会立即参与轮播。",
  coverHint = "第 1 张会作为首图。",
  className,
  editorAspectRatio = 4 / 3,
  editorDescription = "拖动图片调整位置，用滑块放大缩小。保存后会套用到当前图片。",
  editorFrameClassName,
  editorFrameWidth,
  editorTitle = "图片编辑",
  previewAspectRatio = editorAspectRatio,
  previewFrameClassName,
  onChange
}: {
  images: string[];
  maxImages: number;
  label: string;
  description?: string;
  emptyHint?: string;
  coverHint?: string;
  className?: string;
  editorAspectRatio?: number;
  editorDescription?: string;
  editorFrameClassName?: string;
  editorFrameWidth?: number;
  editorTitle?: string;
  previewAspectRatio?: number;
  previewFrameClassName?: string;
  onChange: (next: string[]) => void;
}) {
  const remainingSlots = Math.max(0, maxImages - images.length);
  const [pendingImageEdit, setPendingImageEdit] = useState<PendingImageEdit | null>(null);

  const openPendingImageEdit = (mode: PendingImageEdit["mode"], sources: string[], index?: number) => {
    const [source, ...queue] = sources.filter(Boolean);

    if (!source) {
      return;
    }

    setPendingImageEdit({
      acceptedImages: [],
      index,
      mode,
      queue,
      source
    });
  };

  const applyPendingImageEdit = (editedImage: string) => {
    if (!pendingImageEdit) {
      return;
    }

    if (pendingImageEdit.mode === "replace") {
      onChange(images.map((image, imageIndex) => (imageIndex === pendingImageEdit.index ? editedImage : image)));
      setPendingImageEdit(null);
      return;
    }

    const acceptedImages = [...pendingImageEdit.acceptedImages, editedImage];
    const [nextSource, ...nextQueue] = pendingImageEdit.queue;

    if (nextSource) {
      setPendingImageEdit({
        ...pendingImageEdit,
        acceptedImages,
        queue: nextQueue,
        source: nextSource
      });
      return;
    }

    onChange([...images, ...acceptedImages].slice(0, maxImages));
    setPendingImageEdit(null);
  };

  const handleAppendImages = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const nextImages = await readImageFilesAsDataUrls(event.target.files, remainingSlots);

      if (nextImages.length > 0) {
        openPendingImageEdit("append", nextImages);
      }
    } finally {
      event.target.value = "";
    }
  };

  const handleReplaceImage = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    try {
      const [nextImage] = await readImageFilesAsDataUrls(event.target.files, 1);

      if (nextImage) {
        openPendingImageEdit("replace", [nextImage], index);
      }
    } finally {
      event.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, imageIndex) => imageIndex !== index));
  };

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-[color:var(--client-text)]">{label}</h3>
            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary)]">
              {images.length} / {maxImages}
            </span>
          </div>
          {description ? <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{description}</p> : null}
          <p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">{coverHint}</p>
        </div>

        <label
          aria-disabled={remainingSlots <= 0}
          className={cn(
            "focus-ring inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink transition hover:border-moss",
            remainingSlots <= 0 && "pointer-events-none cursor-not-allowed opacity-60"
          )}
        >
          上传图片
          <input accept="image/*" className="hidden" disabled={remainingSlots <= 0} multiple onChange={handleAppendImages} type="file" />
        </label>
      </div>

      {images.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-5 text-sm text-[color:var(--client-muted)]">
          {emptyHint}
        </div>
      ) : (
        <div className="grid gap-3">
          {images.map((image, index) => {
            return (
              <article
                className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] p-3"
                key={`${label}-${index}`}
              >
                <div className="grid gap-3 md:grid-cols-[124px,1fr]">
                  <div
                    className={cn("overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-black/5", previewFrameClassName)}
                    style={{ aspectRatio: `${previewAspectRatio}` }}
                  >
                    {image ? (
                      <img alt={`${label}-${index + 1}`} className="h-full w-full object-cover" src={image} />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[color:var(--client-muted)]">
                        上传图片后预览
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-[color:var(--client-text)]">第 {index + 1} 张</span>
                        {index === 0 ? (
                          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2 py-1 text-[11px] font-black text-[color:var(--client-primary)]">
                            首图
                          </span>
                        ) : null}
                      </div>

                      <Button size="sm" variant="ghost" onClick={() => removeImage(index)}>
                        删除
                      </Button>
                    </div>

                    <label className="focus-ring inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-white/80 px-4 text-sm font-black text-[color:var(--client-text)] transition hover:border-[color:var(--client-primary)]">
                      上传新图片
                      <input accept="image/*" className="hidden" onChange={(event) => handleReplaceImage(index, event)} type="file" />
                    </label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pendingImageEdit ? (
        <ImageAdjustmentEditor
          aspectRatio={editorAspectRatio}
          description={editorDescription}
          frameClassName={editorFrameClassName}
          frameWidth={editorFrameWidth}
          onApply={applyPendingImageEdit}
          onCancel={() => setPendingImageEdit(null)}
          previewAlt={`${label}图片编辑预览`}
          source={pendingImageEdit.source}
          title={editorTitle}
        />
      ) : null}
    </section>
  );
}
