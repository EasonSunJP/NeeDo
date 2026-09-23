import { useEffect, useRef, useState } from "react";
import { ImageAdjustmentEditor } from "../../components/ui/ImageAdjustmentEditor";
import type { Language } from "../../i18n/translations";
import { uploadExchangeDemandCover } from "./api";
import type { DemandCoverDraft } from "./exchange-composer-model";
import { exchangeText } from "./i18n";

function webpDataUrlToBlob(dataUrl: string): Blob {
  const encoded = dataUrl.split(",", 2)[1];
  if (!dataUrl.startsWith("data:image/webp;base64,") || !encoded) throw new Error("Invalid edited cover");
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: "image/webp" });
}

export function DemandCoverField({
  language,
  value,
  onChange
}: {
  language: Language;
  value: DemandCoverDraft | null;
  onChange: (cover: DemandCoverDraft | null) => void;
}) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [invalidSelection, setInvalidSelection] = useState(false);
  const sourceObjectUrl = useRef<string | null>(null);
  const editorSession = useRef(0);
  const croppedBlob = useRef<Blob | null>(null);
  const activeUpload = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);

  const revokeSource = () => {
    if (sourceObjectUrl.current) URL.revokeObjectURL(sourceObjectUrl.current);
    sourceObjectUrl.current = null;
  };
  const abortUpload = () => {
    generation.current += 1;
    activeUpload.current?.abort();
    activeUpload.current = null;
  };

  useEffect(() => () => {
    editorSession.current += 1;
    abortUpload();
    revokeSource();
  }, []);

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setInvalidSelection(true);
      return;
    }
    setInvalidSelection(false);
    editorSession.current += 1;
    abortUpload();
    revokeSource();
    croppedBlob.current = null;
    onChange(null);
    const nextUrl = URL.createObjectURL(file);
    sourceObjectUrl.current = nextUrl;
    setSourceUrl(nextUrl);
  };

  const upload = async (blob: Blob, previewUrl: string) => {
    abortUpload();
    const currentGeneration = generation.current;
    const controller = new AbortController();
    activeUpload.current = controller;
    onChange({ previewUrl, publicId: null, status: "uploading", uploadedUrl: null });
    try {
      const result = await uploadExchangeDemandCover(blob, controller.signal);
      if (generation.current !== currentGeneration || controller.signal.aborted) return;
      onChange({ previewUrl: result.url, publicId: result.publicId, status: "ready", uploadedUrl: result.url });
      croppedBlob.current = null;
    } catch {
      if (generation.current !== currentGeneration || controller.signal.aborted) return;
      onChange({ previewUrl, publicId: null, status: "failed", uploadedUrl: null });
    } finally {
      if (activeUpload.current === controller) activeUpload.current = null;
    }
  };

  const applyImage = async (dataUrl: string, session: number) => {
    if (session !== editorSession.current) return;
    editorSession.current += 1;
    setSourceUrl(null);
    revokeSource();
    try {
      const blob = webpDataUrlToBlob(dataUrl);
      croppedBlob.current = blob;
      await upload(blob, dataUrl);
    } catch {
      onChange({ previewUrl: dataUrl, publicId: null, status: "failed", uploadedUrl: null });
    }
  };

  const remove = () => {
    editorSession.current += 1;
    abortUpload();
    revokeSource();
    croppedBlob.current = null;
    setSourceUrl(null);
    setInvalidSelection(false);
    onChange(null);
  };

  const currentEditorSession = editorSession.current;

  return (
    <section className="grid gap-3 rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel" data-testid="exchange-demand-cover-field">
      <h2 className="text-sm font-black text-[color:var(--client-text)]">{t("demandCover")}</h2>
      {value ? <img alt={t("demandCoverPreviewAlt")} className="aspect-video w-full rounded-2xl object-cover" src={value.previewUrl} /> : null}
      {value?.status === "uploading" ? <p role="status">{t("demandCoverUploading")}</p> : null}
      {value?.status === "failed" ? <p role="alert">{t("demandCoverFailed")}</p> : null}
      {invalidSelection ? <p role="alert">{t("demandCoverInvalidImage")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <label className="focus-within:ring-2 flex min-h-11 cursor-pointer items-center rounded-full border border-[color:var(--client-line)] px-4 text-sm font-bold text-[color:var(--client-text)]">
          {t(value ? "demandCoverReplace" : "demandCoverChoose")}
          <input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ""; }} type="file" />
        </label>
        {value?.status === "failed" && croppedBlob.current ? (
          <button className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-bold" data-action="retry-cover" onClick={() => void upload(croppedBlob.current!, value.previewUrl)} type="button">{t("retry")}</button>
        ) : null}
        {value || sourceUrl ? (
          <button className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-bold" data-action="remove-cover" onClick={remove} type="button">{t("demandCoverRemove")}</button>
        ) : null}
      </div>
      {sourceUrl ? (
        <ImageAdjustmentEditor
          aspectRatio={16 / 9}
          outputMimeType="image/webp"
          outputQuality={0.84}
          outputWidth={1280}
          onApply={(dataUrl) => applyImage(dataUrl, currentEditorSession)}
          onCancel={() => { editorSession.current += 1; revokeSource(); setSourceUrl(null); setInvalidSelection(false); }}
          source={sourceUrl}
          title={t("demandCoverEdit")}
        />
      ) : null}
    </section>
  );
}
