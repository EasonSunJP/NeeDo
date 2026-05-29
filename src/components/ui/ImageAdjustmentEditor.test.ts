import { describe, expect, it } from "vitest";
import { clampImageAdjustmentState, getImageAdjustmentCoverSize, getImageAdjustmentOffsetBounds, getImageAdjustmentRenderSize, type ImageAdjustmentFrame, type ImageAdjustmentState } from "./ImageAdjustmentEditor";
import editorSource from "./ImageAdjustmentEditor.tsx?raw";

describe("ImageAdjustmentEditor UI contract", () => {
  it("uses the shared fullscreen close button and shows adjustment values as percentages", () => {
    expect(editorSource).toContain("MobileFullscreenCloseButton");
    expect(editorSource).toContain("formatImageAdjustmentPercent");
    expect(editorSource).toContain("Math.round(state.scale * 100)");
    expect(editorSource).toContain('aria-label="缩放"');
    expect(editorSource).toContain('aria-label="亮度"');
    expect(editorSource).toContain('aria-label="对比度"');
  });

  it("renders the editor title as a large client title", () => {
    expect(editorSource).toContain('className="text-[20px] font-black leading-none text-[color:var(--client-text)]"');
    expect(editorSource).not.toContain('className="text-sm font-black">{title}');
  });

  it("keeps drag bounds based on the latest loaded image state", () => {
    expect(editorSource).toContain("setState((currentState) => clampImageAdjustmentState(");
    expect(editorSource).toContain("getImageAdjustmentOffsetBounds({ ...state, scale }, frame)");
    expect(editorSource).toContain("if (!currentState.drag || currentState.drag.pointerId !== event.pointerId)");
    expect(editorSource).toContain("originX: currentState.offsetX");
    expect(editorSource).toContain("height: `${renderHeight}px`");
    expect(editorSource).toContain("width: `${renderWidth}px`");
    expect(editorSource).toContain("left: `calc(50% + ${state.offsetX}px)`");
    expect(editorSource).toContain("top: `calc(50% + ${state.offsetY}px)`");
    expect(editorSource).toContain('transform: "translate(-50%, -50%)"');
    expect(editorSource).toContain('visibility: imageReady ? "visible" : "hidden"');
    expect(editorSource).toContain("const { naturalHeight, naturalWidth } = event.currentTarget;");
    expect(editorSource).toContain("naturalHeight,");
    expect(editorSource).toContain("naturalWidth");
    expect(editorSource).toContain("naturalHeight: currentState.naturalHeight");
    expect(editorSource).toContain("naturalWidth: currentState.naturalWidth");
    expect(editorSource).toContain("useLayoutEffect(() =>");
    expect(editorSource).toContain('className="absolute block max-w-none select-none"');
    expect(editorSource).not.toContain("naturalHeight: event.currentTarget.naturalHeight");
    expect(editorSource).not.toContain("backgroundSize");
    expect(editorSource).not.toContain("object-cover");
    expect(editorSource).not.toContain('className="block h-full w-full max-w-none select-none"');
    expect(editorSource).not.toContain("transform: `scale(${state.scale})`");
    expect(editorSource).not.toContain('transformOrigin: "center center"');
    expect(editorSource).not.toContain("useEffect(() =>");
    expect(editorSource).not.toContain("setState({ ...state, drag: undefined });");
  });

  it("renders wide menu images without changing the uploaded image ratio", () => {
    const menuFrame: ImageAdjustmentFrame = { height: 140, width: 344 };
    const uploadedImageState: ImageAdjustmentState = {
      brightness: 100,
      contrast: 100,
      naturalHeight: 1024,
      naturalWidth: 1536,
      offsetX: 999,
      offsetY: 999,
      scale: 1
    };
    const coverSize = getImageAdjustmentCoverSize(uploadedImageState, menuFrame);
    const renderSize = getImageAdjustmentRenderSize(uploadedImageState, menuFrame);
    const bounds = getImageAdjustmentOffsetBounds(uploadedImageState, menuFrame);
    const clampedBottomEdge = clampImageAdjustmentState(uploadedImageState, menuFrame);
    const clampedTopEdge = clampImageAdjustmentState({ ...uploadedImageState, offsetY: -999 }, menuFrame);

    expect(coverSize.coverWidth / coverSize.coverHeight).toBeCloseTo(uploadedImageState.naturalWidth / uploadedImageState.naturalHeight, 5);
    expect(renderSize.renderWidth / renderSize.renderHeight).toBeCloseTo(uploadedImageState.naturalWidth / uploadedImageState.naturalHeight, 5);
    expect(coverSize.coverWidth).toBeCloseTo(344, 2);
    expect(coverSize.coverHeight).toBeCloseTo(229.33, 2);
    expect(renderSize.renderWidth).toBeCloseTo(344, 2);
    expect(renderSize.renderHeight).toBeCloseTo(229.33, 2);
    expect(bounds.maxOffsetX).toBe(0);
    expect(bounds.maxOffsetY).toBeCloseTo(44.17, 2);
    expect(clampedBottomEdge.offsetX).toBe(0);
    expect(clampedBottomEdge.offsetY).toBeCloseTo(bounds.maxOffsetY, 2);
    expect(clampedTopEdge.offsetY).toBeCloseTo(-bounds.maxOffsetY, 2);
  });

  it("enlarges the real image box without distortion and keeps edge limits after zooming", () => {
    const menuFrame: ImageAdjustmentFrame = { height: 140, width: 344 };
    const zoomedImageState: ImageAdjustmentState = {
      brightness: 100,
      contrast: 100,
      naturalHeight: 1024,
      naturalWidth: 1536,
      offsetX: -999,
      offsetY: 999,
      scale: 2
    };
    const coverSize = getImageAdjustmentCoverSize(zoomedImageState, menuFrame);
    const renderSize = getImageAdjustmentRenderSize(zoomedImageState, menuFrame);
    const bounds = getImageAdjustmentOffsetBounds(zoomedImageState, menuFrame);
    const clampedState = clampImageAdjustmentState(zoomedImageState, menuFrame);

    expect(coverSize.coverWidth / coverSize.coverHeight).toBeCloseTo(zoomedImageState.naturalWidth / zoomedImageState.naturalHeight, 5);
    expect(renderSize.renderWidth / renderSize.renderHeight).toBeCloseTo(zoomedImageState.naturalWidth / zoomedImageState.naturalHeight, 5);
    expect(coverSize.coverWidth).toBeCloseTo(344, 2);
    expect(coverSize.coverHeight).toBeCloseTo(229.33, 2);
    expect(renderSize.renderWidth).toBeCloseTo(688, 2);
    expect(renderSize.renderHeight).toBeCloseTo(458.67, 2);
    expect(bounds.maxOffsetX).toBeCloseTo(171.5, 2);
    expect(bounds.maxOffsetY).toBeCloseTo(158.83, 2);
    expect(clampedState.offsetX).toBeCloseTo(-bounds.maxOffsetX, 2);
    expect(clampedState.offsetY).toBeCloseTo(bounds.maxOffsetY, 2);
  });
});
