import { fileURLToPath } from "node:url";

function assetPath(file) {
  return fileURLToPath(new URL(`../../assets/needo-roadshow-premium/ai/${file}`, import.meta.url));
}

export const AI_ASSETS = Object.freeze({
  cover: assetPath("cover-network.png"),
  coordination: assetPath("coordination-network.png"),
  scheduling: assetPath("scheduling-space.png"),
  ordering: assetPath("transparent-ordering.png"),
  cps: assetPath("cps-loop.png"),
});
