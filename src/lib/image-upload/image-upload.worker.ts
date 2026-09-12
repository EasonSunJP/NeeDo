import { createBrowserImageCodec } from "./browser-codec";
import { optimizeImageUploadWithCodec } from "./optimizer";
import type { ImageUploadPurpose, ImageUploadStage } from "./types";

type WorkerInput = {
  bytes: ArrayBuffer;
  lastModified: number;
  name: string;
  purpose: ImageUploadPurpose;
  type: string;
};

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  try {
    const input = event.data;
    const source = new File([input.bytes], input.name, {
      lastModified: input.lastModified,
      type: input.type
    });
    const result = await optimizeImageUploadWithCodec(
      source,
      input.purpose,
      createBrowserImageCodec(),
      {
        onStage(stage: ImageUploadStage) {
          self.postMessage({ kind: "stage", stage });
        }
      }
    );
    const bytes = await result.file.arrayBuffer();
    self.postMessage({
      ...result,
      bytes,
      file: undefined,
      fileName: result.file.name,
      kind: "result"
    }, { transfer: [bytes] });
  } catch (error) {
    self.postMessage({
      kind: "error",
      message: error instanceof Error ? error.message : "error.image_upload.unsupported"
    });
  }
};
