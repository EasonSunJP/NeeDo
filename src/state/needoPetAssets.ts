import { useSyncExternalStore } from "react";

export type XiaobaiPetSpriteKey =
  | "death"
  | "enter"
  | "exit"
  | "happy"
  | "grave"
  | "idle"
  | "revive"
  | "running";

export type XiaobaiPetOneShotSpriteKey = "death" | "enter" | "exit" | "revive";
export type XiaobaiPetStaticSpriteKey = Exclude<XiaobaiPetSpriteKey, XiaobaiPetOneShotSpriteKey>;

export type NeedoPetMotionClip = {
  columns: number;
  durationMs: number;
  frameCount: number;
  frameDurationMs: number;
  frameHeight: number;
  frameWidth: number;
  src: string;
};

export type NeedoPetAssetStatus = "error" | "idle" | "loading" | "ready";

export type NeedoPetAssetReadiness = {
  failedSrc?: string;
  loaded: number;
  ready: boolean;
  status: NeedoPetAssetStatus;
  total: number;
  updatedAt: number;
  version: string;
};

const assetStorageKey = "needo.digital-pet.assets.v1";
export const xiaobaiPetAssetVersion = "20260921d";

export function getVersionedNeedoPetAsset(src: string) {
  return `${src}?v=${xiaobaiPetAssetVersion}`;
}

export const petSpriteSrc: Record<XiaobaiPetStaticSpriteKey, string> = {
  happy: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-happy.png"),
  grave: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-grave.png"),
  idle: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle.png"),
  running: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-running.png")
};

const xiaobaiFrameDurationMs = 1_000 / 6;

function getXiaobaiMotionClip(name: string, frameCount: number, durationMs: number): NeedoPetMotionClip {
  return {
    columns: 10,
    durationMs,
    frameCount,
    frameDurationMs: xiaobaiFrameDurationMs,
    frameHeight: 143,
    frameWidth: 132,
    src: getVersionedNeedoPetAsset(`/images/needo-pet/${name}-atlas.png`)
  };
}

export const xiaobaiIdleClips = [
  getXiaobaiMotionClip("xiao-bai-idle-question-cheer", 40, 6_667),
  getXiaobaiMotionClip("xiao-bai-idle-sparkle", 22, 3_667),
  getXiaobaiMotionClip("xiao-bai-idle-heart-thanks", 40, 6_667),
  getXiaobaiMotionClip("xiao-bai-idle-angry", 30, 5_000),
  getXiaobaiMotionClip("xiao-bai-idle-sad", 35, 5_833),
  getXiaobaiMotionClip("xiao-bai-idle-sleepy", 31, 5_167),
  getXiaobaiMotionClip("xiao-bai-idle-excited", 38, 6_333),
  getXiaobaiMotionClip("xiao-bai-idle-thinking", 30, 5_000)
] as const satisfies readonly NeedoPetMotionClip[];

export const xiaobaiRunningClips = [
  getXiaobaiMotionClip("xiao-bai-run-dash", 10, 6_667),
  getXiaobaiMotionClip("xiao-bai-run-sprint", 17, 8_500)
] as const satisfies readonly NeedoPetMotionClip[];

export const xiaobaiOneShotClips: Record<XiaobaiPetOneShotSpriteKey, NeedoPetMotionClip> = {
  death: getXiaobaiMotionClip("xiao-bai-death", 45, 7_500),
  enter: getXiaobaiMotionClip("xiao-bai-enter", 18, 3_000),
  exit: getXiaobaiMotionClip("xiao-bai-exit", 29, 4_833),
  revive: getXiaobaiMotionClip("xiao-bai-revive", 39, 6_500)
};

export const xiaobaiPetAssetManifest = Array.from(
  new Set([
    ...Object.values(petSpriteSrc),
    ...xiaobaiIdleClips.map((clip) => clip.src),
    ...xiaobaiRunningClips.map((clip) => clip.src),
    ...Object.values(xiaobaiOneShotClips).map((clip) => clip.src)
  ])
);

export const xiaobaiPetCoreAssetManifest = [
  petSpriteSrc.idle,
  petSpriteSrc.running,
  xiaobaiOneShotClips.enter.src
] as const;

const listeners = new Set<() => void>();
const defaultReadiness: NeedoPetAssetReadiness = {
  loaded: 0,
  ready: false,
  status: "idle",
  total: xiaobaiPetCoreAssetManifest.length,
  updatedAt: 0,
  version: xiaobaiPetAssetVersion
};
let cachedReadiness = readStoredReadiness();
let preloadPromise: Promise<NeedoPetAssetReadiness> | null = null;

function readStoredReadiness(): NeedoPetAssetReadiness {
  if (typeof window === "undefined") {
    return defaultReadiness;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(assetStorageKey) ?? "null") as Partial<NeedoPetAssetReadiness> | null;

    if (stored?.status === "ready" && stored.version === xiaobaiPetAssetVersion) {
      return {
        loaded: xiaobaiPetCoreAssetManifest.length,
        ready: true,
        status: "ready",
        total: xiaobaiPetCoreAssetManifest.length,
        updatedAt: Number(stored.updatedAt) || Date.now(),
        version: xiaobaiPetAssetVersion
      };
    }
  } catch {
    return defaultReadiness;
  }

  return defaultReadiness;
}

function writeReadySnapshot(readiness: NeedoPetAssetReadiness) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(assetStorageKey, JSON.stringify(readiness));
}

function clearReadySnapshot() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(assetStorageKey);
}

function emitReadiness(nextReadiness: NeedoPetAssetReadiness) {
  cachedReadiness = nextReadiness;
  listeners.forEach((listener) => listener());
}

function readReadinessSnapshot() {
  return cachedReadiness;
}

function loadImageAsset(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (failed = false) => {
      if (settled) {
        return;
      }

      settled = true;

      if (failed) {
        reject(new Error(src));
        return;
      }

      resolve();
    };

    image.decoding = "async";
    image.onload = () => finish();
    image.onerror = () => finish(true);
    image.src = src;

    if (image.complete && image.naturalWidth > 0) {
      finish();
    }
  });
}

export function getNeedoPetAssetReadiness() {
  return cachedReadiness;
}

export function getNeedoPetAssetProgress(readiness: NeedoPetAssetReadiness) {
  if (readiness.ready) {
    return 100;
  }

  if (readiness.total <= 0) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round((readiness.loaded / readiness.total) * 100)));
}

export function preloadNeedoPetAssets(options: { force?: boolean } = {}) {
  if (typeof window === "undefined") {
    return Promise.resolve(cachedReadiness);
  }

  if (!options.force && cachedReadiness.ready) {
    return Promise.resolve(cachedReadiness);
  }

  if (!options.force && preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    const startedAt = Date.now();
    emitReadiness({
      ...defaultReadiness,
      status: "loading",
      updatedAt: startedAt
    });

    for (const [index, src] of xiaobaiPetCoreAssetManifest.entries()) {
      try {
        await loadImageAsset(src);
      } catch {
        const failedReadiness = {
          failedSrc: src,
          loaded: index,
          ready: false,
          status: "error" as const,
          total: xiaobaiPetCoreAssetManifest.length,
          updatedAt: Date.now(),
          version: xiaobaiPetAssetVersion
        };

        clearReadySnapshot();
        emitReadiness(failedReadiness);
        return failedReadiness;
      }

      emitReadiness({
        loaded: index + 1,
        ready: false,
        status: "loading",
        total: xiaobaiPetCoreAssetManifest.length,
        updatedAt: Date.now(),
        version: xiaobaiPetAssetVersion
      });
    }

    const readyReadiness = {
      loaded: xiaobaiPetCoreAssetManifest.length,
      ready: true,
      status: "ready" as const,
      total: xiaobaiPetCoreAssetManifest.length,
      updatedAt: Date.now(),
      version: xiaobaiPetAssetVersion
    };

    writeReadySnapshot(readyReadiness);
    emitReadiness(readyReadiness);
    return readyReadiness;
  })().finally(() => {
    preloadPromise = null;
  });

  return preloadPromise;
}

export function subscribeNeedoPetAssetReadiness(listener: () => void) {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === assetStorageKey) {
      emitReadiness(readStoredReadiness());
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function useNeedoPetAssetReadiness() {
  if (typeof window !== "undefined" && cachedReadiness.status === "idle") {
    cachedReadiness = readStoredReadiness();
  }

  return useSyncExternalStore(subscribeNeedoPetAssetReadiness, readReadinessSnapshot, () => defaultReadiness);
}
