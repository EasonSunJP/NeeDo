import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

export const TECHNICIAN_SERVICE_COVER_MAX_BYTES = 8 * 1024 * 1024;
export const TECHNICIAN_SERVICE_COVER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export interface TechnicianServiceCoverFieldProps {
  disabled: boolean;
  persistedUrl: string | null;
  selectedFile: File | null;
  removePersisted: boolean;
  onFileChange: (file: File | null) => void;
  onRemovePersisted: (remove: boolean) => void;
  onValidationError: (message: string) => void;
}

export function TechnicianServiceCoverField({
  disabled,
  persistedUrl,
  selectedFile,
  removePersisted,
  onFileChange,
  onRemovePersisted,
  onValidationError
}: TechnicianServiceCoverFieldProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setObjectUrl(null);
      return;
    }

    const nextObjectUrl = URL.createObjectURL(selectedFile);
    setObjectUrl(nextObjectUrl);
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [selectedFile]);

  const previewUrl = selectedFile ? objectUrl : removePersisted ? null : persistedUrl;
  const hasCover = Boolean(previewUrl);

  return (
    <section className="space-y-2" data-testid="technician-service-cover-field">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[color:var(--client-muted)]">服务封面</p>
          <p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">JPEG / PNG / WebP，最大 8 MiB</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <label className={cn(
            "cursor-pointer rounded-full border border-[color:var(--client-line)] px-3 py-2 text-xs font-black",
            disabled ? "pointer-events-none opacity-50" : undefined
          )}>
            {hasCover ? "更换图片" : "上传服务封面"}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (!file) return;
                if (!TECHNICIAN_SERVICE_COVER_MIME_TYPES.includes(file.type as typeof TECHNICIAN_SERVICE_COVER_MIME_TYPES[number])) {
                  onValidationError("仅支持 JPEG、PNG 或 WebP 图片");
                  return;
                }
                if (file.size > TECHNICIAN_SERVICE_COVER_MAX_BYTES) {
                  onValidationError("图片不能超过 8 MiB");
                  return;
                }
                onRemovePersisted(false);
                onFileChange(file);
              }}
              type="file"
            />
          </label>
          {hasCover ? (
            <button
              className="rounded-full border border-red-500/40 px-3 py-2 text-xs font-black text-red-500 disabled:opacity-50"
              disabled={disabled}
              onClick={() => selectedFile ? onFileChange(null) : onRemovePersisted(true)}
              type="button"
            >
              移除图片
            </button>
          ) : null}
          {!selectedFile && removePersisted && persistedUrl ? (
            <button
              className="rounded-full border border-[color:var(--client-line)] px-3 py-2 text-xs font-black disabled:opacity-50"
              disabled={disabled}
              onClick={() => onRemovePersisted(false)}
              type="button"
            >
              恢复当前封面
            </button>
          ) : null}
        </div>
      </div>
      {previewUrl ? (
        <img alt="服务封面" className="aspect-[16/9] w-full rounded-[16px] object-cover" src={previewUrl} />
      ) : (
        <div aria-label="服务封面" className="grid aspect-[16/9] w-full place-items-center rounded-[16px] border border-dashed border-[color:var(--client-line)] text-xs font-bold text-[color:var(--client-muted)]">
          上传服务封面
        </div>
      )}
    </section>
  );
}
