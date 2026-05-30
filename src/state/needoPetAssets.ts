import { useSyncExternalStore } from "react";

export type XiaobaiPetSpriteKey =
  | "angry"
  | "death"
  | "enter"
  | "exit"
  | "failed"
  | "happy"
  | "grave"
  | "hungry"
  | "idle"
  | "jumping"
  | "notice"
  | "phone"
  | "revive"
  | "running"
  | "sleeping"
  | "waiting"
  | "waving";

export type XiaobaiPetOneShotSpriteKey = "death" | "enter" | "exit" | "revive";

export type NeedoPetMotionClip = {
  durationMs: number;
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
export const xiaobaiPetAssetVersion = "20260521h";

export function getVersionedNeedoPetAsset(src: string) {
  return `${src}?v=${xiaobaiPetAssetVersion}`;
}

export const petSpriteSrc: Record<XiaobaiPetSpriteKey, string> = {
  angry: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-angry.png"),
  death: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-death.png"),
  enter: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-enter.png"),
  exit: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-exit.png"),
  failed: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-failed.png"),
  happy: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-happy.png"),
  grave: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-grave.png"),
  hungry: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-hungry.png"),
  idle: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle.png"),
  jumping: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-jumping.png"),
  notice: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-notice.png"),
  phone: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-phone.png"),
  revive: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-revive.png"),
  running: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-running.png"),
  sleeping: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-sleeping.png"),
  waiting: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-waiting.png"),
  waving: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-waving.png")
};

export const xiaobaiIdleClips = [
  { durationMs: 6_600, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-question-cheer.png") },
  { durationMs: 3_600, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-sparkle.png") },
  { durationMs: 6_600, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-heart-thanks.png") },
  { durationMs: 4_950, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-angry.png") },
  { durationMs: 5_850, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-sad.png") },
  { durationMs: 5_200, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-sleepy.png") },
  { durationMs: 6_350, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-excited.png") },
  { durationMs: 5_000, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-idle-thinking.png") }
] as const satisfies readonly NeedoPetMotionClip[];

export const xiaobaiRunningClips = [
  { durationMs: 6_400, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-run-dash.png") },
  { durationMs: 8_400, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-run-sprint.png") }
] as const satisfies readonly NeedoPetMotionClip[];

export const xiaobaiOneShotClips: Record<XiaobaiPetOneShotSpriteKey, NeedoPetMotionClip> = {
  death: { durationMs: 7_450, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-death.png") },
  enter: { durationMs: 3_000, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-enter.png") },
  exit: { durationMs: 4_800, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-exit.png") },
  revive: { durationMs: 6_550, src: getVersionedNeedoPetAsset("/images/needo-pet/xiao-bai-revive.png") }
};

export const xiaobaiPetAssetManifest = Array.from(
  new Set([
    ...Object.values(petSpriteSrc),
    ...xiaobaiIdleClips.map((clip) => clip.src),
    ...xiaobaiRunningClips.map((clip) => clip.src),
    ...Object.values(xiaobaiOneShotClips).map((clip) => clip.src)
  ])
);

const listeners = new Set<() => void>();
const defaultReadiness: NeedoPetAssetReadiness = {
  loaded: 0,
  ready: false,
  status: "idle",
  total: xiaobaiPetAssetManifest.length,
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
        loaded: xiaobaiPetAssetManifest.length,
        ready: true,
        status: "ready",
        total: xiaobaiPetAssetManifest.length,
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

    for (const [index, src] of xiaobaiPetAssetManifest.entries()) {
      try {
        await loadImageAsset(src);
      } catch {
        const failedReadiness = {
          failedSrc: src,
          loaded: index,
          ready: false,
          status: "error" as const,
          total: xiaobaiPetAssetManifest.length,
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
        total: xiaobaiPetAssetManifest.length,
        updatedAt: Date.now(),
        version: xiaobaiPetAssetVersion
      });
    }

    const readyReadiness = {
      loaded: xiaobaiPetAssetManifest.length,
      ready: true,
      status: "ready" as const,
      total: xiaobaiPetAssetManifest.length,
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
