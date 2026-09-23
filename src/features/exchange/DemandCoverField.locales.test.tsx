// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageAdjustmentEditor } from "../../components/ui/ImageAdjustmentEditor";
import { DemandCoverField } from "./DemandCoverField";
import { uploadExchangeDemandCover } from "./api";

vi.mock("./api", () => ({ uploadExchangeDemandCover: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe("demand cover editor localization", () => {
  it.each([
    ["zh", ["缩放", "亮度", "对比度", "取消裁剪", "还原", "套用图片", "关闭图片编辑"], "拖动图片调整位置"],
    ["zh-Hant", ["縮放", "亮度", "對比度", "取消裁剪", "還原", "套用圖片", "關閉圖片編輯"], "拖動圖片調整位置"],
    ["ja", ["ズーム", "明るさ", "コントラスト", "キャンセル", "リセット", "画像を適用", "画像編集を閉じる"], "画像をドラッグして位置を調整"],
    ["en", ["Zoom", "Brightness", "Contrast", "Cancel crop", "Reset", "Apply image", "Close image editor"], "Drag the image to adjust its position"],
    ["ko", ["확대/축소", "밝기", "대비", "자르기 취소", "초기화", "이미지 적용", "이미지 편집 닫기"], "이미지를 드래그하여 위치를 조정"]
  ] as const)("renders real editor controls and instructions in %s without uploading on language change", async (language, labels, instruction) => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:cover"), revokeObjectURL: vi.fn() });
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = vi.fn();
    try {
      await act(async () => root.render(<DemandCoverField language="zh" value={null} onChange={onChange} />));
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      await act(async () => {
        Object.defineProperty(input, "files", { value: [new File(["image"], "cover.png", { type: "image/png" })] });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => root.render(<DemandCoverField language={language} value={null} onChange={onChange} />));
      const dialog = container.querySelector('[role="dialog"]')!;
      for (const label of labels.slice(0, 3)) expect(dialog.querySelector(`input[aria-label="${label}"]`)).not.toBeNull();
      for (const label of labels.slice(3, 6)) expect(dialog.textContent).toContain(label);
      expect(dialog.querySelector(`button[aria-label="${labels[6]}"]`)).not.toBeNull();
      expect(dialog.textContent).toContain(instruction);
      expect(dialog.querySelector("img")?.getAttribute("src")).toBe("blob:cover");
      expect(uploadExchangeDemandCover).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("preserves shared editor defaults for existing callers", () => {
    const markup = renderToStaticMarkup(<ImageAdjustmentEditor source="/cover.webp" onApply={() => undefined} onCancel={() => undefined} />);
    for (const text of ["图片编辑", "关闭图片编辑", "缩放", "亮度", "对比度", "取消裁剪", "还原", "套用图片"])
      expect(markup).toContain(text);
  });
});
