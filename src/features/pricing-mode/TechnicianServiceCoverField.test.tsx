// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TechnicianServiceCoverField } from "./TechnicianServiceCoverField";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

function CoverFieldHarness({
  initialFile = null,
  initialRemovePersisted = false,
  onFileChange = vi.fn(),
  onRemovePersisted = vi.fn(),
  onValidationError = vi.fn(),
  persistedUrl = "/persisted-cover.jpg"
}: {
  initialFile?: File | null;
  initialRemovePersisted?: boolean;
  onFileChange?: (file: File | null) => void;
  onRemovePersisted?: (remove: boolean) => void;
  onValidationError?: (message: string) => void;
  persistedUrl?: string | null;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
  const [removePersisted, setRemovePersisted] = useState(initialRemovePersisted);

  return (
    <TechnicianServiceCoverField
      disabled={false}
      onFileChange={(file) => { setSelectedFile(file); onFileChange(file); }}
      onRemovePersisted={(remove) => { setRemovePersisted(remove); onRemovePersisted(remove); }}
      onValidationError={onValidationError}
      persistedUrl={persistedUrl}
      removePersisted={removePersisted}
      selectedFile={selectedFile}
    />
  );
}

async function renderCoverField(props: Parameters<typeof CoverFieldHarness>[0] = {}) {
  await act(async () => root.render(<CoverFieldHarness {...props} />));
}

async function selectFile(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
}

describe("TechnicianServiceCoverField", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:cover-one")
      .mockReturnValueOnce("blob:cover-two");
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("previews a valid image and revokes each component-created URL on replacement and unmount", async () => {
    const readAsDataURL = vi.spyOn(FileReader.prototype, "readAsDataURL");
    const onFileChange = vi.fn();
    await renderCoverField({ onFileChange });

    const first = new File([new Uint8Array([1])], "first.jpg", { type: "image/jpeg" });
    const second = new File([new Uint8Array([2])], "second.webp", { type: "image/webp" });
    await selectFile(first);
    expect(onFileChange).toHaveBeenLastCalledWith(first);
    expect(container.querySelector<HTMLImageElement>('img[alt="服务封面"]')?.src).toContain("blob:cover-one");

    await selectFile(second);
    expect(container.querySelector<HTMLImageElement>('img[alt="服务封面"]')?.src).toContain("blob:cover-two");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-one");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("/persisted-cover.jpg");
    expect(readAsDataURL).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-two");
  });

  it("clears a selected replacement before marking a persisted cover for removal", async () => {
    const onFileChange = vi.fn();
    const onRemovePersisted = vi.fn();
    await renderCoverField({ onFileChange, onRemovePersisted });
    await selectFile(new File([new Uint8Array([1])], "replacement.png", { type: "image/png" }));

    const removeSelected = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "移除图片");
    await act(async () => removeSelected?.click());
    expect(onFileChange).toHaveBeenLastCalledWith(null);
    expect(onRemovePersisted).not.toHaveBeenCalledWith(true);
    expect(container.querySelector<HTMLImageElement>('img[alt="服务封面"]')?.src).toContain("/persisted-cover.jpg");

    const removePersisted = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "移除图片");
    await act(async () => removePersisted?.click());
    expect(onRemovePersisted).toHaveBeenCalledWith(true);
    expect(container.querySelector('img[alt="服务封面"]')).toBeNull();
  });

  it("restores the current persisted cover after removal intent", async () => {
    const onRemovePersisted = vi.fn();
    await renderCoverField({ initialRemovePersisted: true, onRemovePersisted });

    const restore = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "恢复当前封面");
    expect(restore).toBeDefined();
    await act(async () => restore?.click());

    expect(onRemovePersisted).toHaveBeenCalledWith(false);
    expect(container.querySelector<HTMLImageElement>('img[alt="服务封面"]')?.src).toContain("/persisted-cover.jpg");
  });

  it.each([
    [new File(["text"], "cover.txt", { type: "text/plain" }), "仅支持 JPEG、PNG 或 WebP 图片"],
    [new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }), "图片不能超过 8 MiB"]
  ])("rejects an invalid file", async (file, message) => {
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    await renderCoverField({ onFileChange, onValidationError });

    await selectFile(file);

    expect(onValidationError).toHaveBeenCalledWith(message);
    expect(onFileChange).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
