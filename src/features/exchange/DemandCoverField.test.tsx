// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Language } from "../../i18n/translations";
import { uploadExchangeDemandCover } from "./api";
import { DemandCoverField } from "./DemandCoverField";
import type { DemandCoverDraft } from "./exchange-composer-model";

vi.mock("./api", () => ({ uploadExchangeDemandCover: vi.fn() }));
vi.mock("../../components/ui/ImageAdjustmentEditor", () => ({
  ImageAdjustmentEditor: ({ onApply, onCancel, source, aspectRatio, outputMimeType, outputQuality, outputWidth }: {
    onApply: (dataUrl: string) => void;
    onCancel: () => void;
    source: string;
    aspectRatio: number;
    outputMimeType: string;
    outputQuality: number;
    outputWidth: number;
  }) => (
    <div data-testid="cover-editor" data-source={source} data-aspect={aspectRatio} data-mime={outputMimeType} data-quality={outputQuality} data-width={outputWidth}>
      <button data-action="apply-cover" onClick={() => onApply("data:image/webp;base64,YQ==")}>Apply</button>
      <button data-action="cancel-cover" onClick={onCancel}>Cancel</button>
    </div>
  )
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const uploaded = { publicId: "a".repeat(64), url: "/media/content/exchange/aa.webp", mimeType: "image/webp", width: 1280, height: 720 };

describe("DemandCoverField", () => {
  let container: HTMLDivElement;
  let root: Root;
  let lastCover: DemandCoverDraft | null;
  let setCover: ((cover: DemandCoverDraft | null) => void) | undefined;
  let revoke: ReturnType<typeof vi.fn>;

  function Harness({ language }: { language: Language }) {
    const [cover, updateCover] = useState<DemandCoverDraft | null>(null);
    lastCover = cover;
    setCover = updateCover;
    return <DemandCoverField language={language} value={cover} onChange={updateCover} />;
  }

  async function chooseImage() {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["image"], "cover.png", { type: "image/png" });
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function applyImage() {
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="apply-cover"]')!.click());
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:source"),
      revokeObjectURL: (revoke = vi.fn())
    });
    vi.mocked(uploadExchangeDemandCover).mockResolvedValue(uploaded);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each(["zh", "zh-Hant", "ja", "en", "ko"] as const)("uses one shared cover in %s across language changes", async (language) => {
    await act(async () => root.render(<Harness language={language} />));
    expect(container.querySelectorAll('[data-testid="exchange-demand-cover-field"]')).toHaveLength(1);
    await chooseImage();
    expect(container.querySelector('[data-testid="cover-editor"]')?.getAttribute("data-aspect")).toBe(String(16 / 9));
    expect(container.querySelector('[data-testid="cover-editor"]')?.getAttribute("data-mime")).toBe("image/webp");
    expect(container.querySelector('[data-testid="cover-editor"]')?.getAttribute("data-quality")).toBe("0.84");
    expect(container.querySelector('[data-testid="cover-editor"]')?.getAttribute("data-width")).toBe("1280");
    await applyImage();
    expect(uploadExchangeDemandCover).toHaveBeenCalledTimes(1);
    expect(lastCover?.publicId).toBe(uploaded.publicId);
    await act(async () => root.render(<Harness language={language === "zh" ? "ja" : "zh"} />));
    expect(container.querySelector('img[src="/media/content/exchange/aa.webp"]')).not.toBeNull();
    expect(uploadExchangeDemandCover).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:source");
  });

  it("aborts a replaced upload and ignores its late result", async () => {
    let completeFirst: ((value: typeof uploaded) => void) | undefined;
    vi.mocked(uploadExchangeDemandCover)
      .mockImplementationOnce(() => new Promise((resolve) => { completeFirst = resolve; }))
      .mockResolvedValueOnce({ ...uploaded, publicId: "b".repeat(64), url: "/second.webp" });
    await act(async () => root.render(<Harness language="en" />));
    await chooseImage();
    await applyImage();
    const signal = vi.mocked(uploadExchangeDemandCover).mock.calls[0][1]!;
    expect(lastCover?.status).toBe("uploading");
    await chooseImage();
    expect(signal.aborted).toBe(true);
    await applyImage();
    await act(async () => completeFirst!(uploaded));
    expect(lastCover?.publicId).toBe("b".repeat(64));
  });

  it("keeps a failed upload unpublishable, retries, and removes the cover", async () => {
    vi.mocked(uploadExchangeDemandCover).mockRejectedValueOnce(new Error("network"));
    await act(async () => root.render(<Harness language="ja" />));
    await chooseImage();
    await applyImage();
    expect(lastCover).toMatchObject({ status: "failed", publicId: null });
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="retry-cover"]')!.click());
    expect(lastCover).toMatchObject({ status: "ready", publicId: uploaded.publicId });
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="remove-cover"]')!.click());
    expect(lastCover).toBeNull();
  });
});
