export interface CsvExportEnvelope {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  csv?: string;
  content?: string;
}

type CsvDownloadEnvironment = {
  BlobCtor?: typeof Blob;
  document?: Document;
  url?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
};

export function downloadCsvExport(
  payload: CsvExportEnvelope,
  environment: CsvDownloadEnvironment = {}
) {
  const documentRef =
    environment.document ?? (typeof document === "undefined" ? undefined : document);
  const urlRef = environment.url ?? (typeof URL === "undefined" ? undefined : URL);
  const BlobCtor = environment.BlobCtor ?? (typeof Blob === "undefined" ? undefined : Blob);

  if (!documentRef || !urlRef || !BlobCtor) {
    return false;
  }

  const rawCsv = payload.csv ?? payload.content ?? "";
  const csv = rawCsv.startsWith("\uFEFF") ? rawCsv : `\uFEFF${rawCsv}`;
  const blob = new BlobCtor([csv], { type: payload.contentType });
  const objectUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = objectUrl;
  anchor.download = payload.filename;
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  urlRef.revokeObjectURL(objectUrl);
  return true;
}
