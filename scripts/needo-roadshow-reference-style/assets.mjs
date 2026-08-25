import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetDir = path.resolve(here, "../../assets/needo-roadshow-reference-style");

export const SCENE_ASSETS = Object.freeze({
  cover: path.join(assetDir, "ecosystem-cover.png"),
  market: path.join(assetDir, "market-network.png"),
  supply: path.join(assetDir, "supply-awakening.png"),
  coordination: path.join(assetDir, "five-party-coordination.png"),
  scheduling: path.join(assetDir, "ai-scheduling.png"),
  dualEngine: path.join(assetDir, "dual-engine.png"),
  ordering: path.join(assetDir, "transparent-ordering.png"),
  cps: path.join(assetDir, "cps-loop.png"),
  roadmap: path.join(assetDir, "tokyo-roadmap.png"),
});
