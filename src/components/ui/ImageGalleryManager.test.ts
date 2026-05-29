import { describe, expect, it } from "vitest";
import managerSource from "./ImageGalleryManager.tsx?raw";

describe("ImageGalleryManager upload editing flow", () => {
  it("routes appended and replaced images through the adjustment editor before saving", () => {
    expect(managerSource).toContain("ImageAdjustmentEditor");
    expect(managerSource).toContain("pendingImageEdit");
    expect(managerSource).toContain("applyPendingImageEdit");
    expect(managerSource).not.toContain("onChange([...images, ...nextImages].slice(0, maxImages));");
    expect(managerSource).not.toContain("imageIndex === index ? nextImage : image");
  });

  it("lets callers match gallery previews and editor frames to the rendered carousel", () => {
    expect(managerSource).toContain("previewAspectRatio = editorAspectRatio");
    expect(managerSource).toContain("editorFrameClassName");
    expect(managerSource).toContain("editorFrameWidth");
    expect(managerSource).toContain('style={{ aspectRatio: `${previewAspectRatio}` }}');
    expect(managerSource).toContain("frameClassName={editorFrameClassName}");
    expect(managerSource).toContain("frameWidth={editorFrameWidth}");
    expect(managerSource).not.toContain('className="h-[104px] w-full object-cover"');
  });
});
