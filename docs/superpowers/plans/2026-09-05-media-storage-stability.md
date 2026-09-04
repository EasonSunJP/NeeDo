# Media Storage Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore existing IM and Social media across linked worktrees and render explicit expired versus load-failed states without changing media records or deleting files.

**Architecture:** The formal launcher will resolve IM and Content directories to absolute paths rooted at the shared Git common checkout, then inject those paths into every API process. IM and Social media elements will own a small `loading | ready | failed` state, while only the formal `mediaState: "expired"` contract can produce an expired placeholder.

**Tech Stack:** Node.js 22, TypeScript, React 19, Vite, Vitest, Jest, Express.

## Execution record (2026-09-05)

- Implementation: `ac3c11c7` on `codex/media-storage-stability`. Tasks 1-4 were committed together as one reversible media-delivery microstep, rather than the suggested per-task commits below.
- RED/GREEN observed for the missing resolver, production relative-path rejection, and IM/Social failure/retry rendering. Focused tests were added in `components.media.test.tsx` and `media-failure.test.tsx` rather than enlarging the pre-existing test files suggested below.
- Final frontend check: 11 files / 252 tests passed, including launcher configuration, IM mapping/components/pages, Social tiles/detail pages and all five App languages. Backend: 5 suites / 106 tests passed (production config, translation config, voice upload, Content media and Social media).
- Root `npm run lint`, root/backend `npm run build`, changed backend-file ESLint and `git diff --check` passed. Vite still reports the existing mixed static/dynamic SocialProfile import and bundle-size warnings. The global i18n audit exits 0 but reports 7,242 existing missing entries; it is not a globally clean translation audit. The five new feedback entries are covered by the passing translation test.
- Isolated runtime uses the real `createApp` and formal environment/database, without starting scheduled workers. Backend PID 16631, port 57244, cwd ending in `media-storage-stability/backend`; Vite PID 14918, port 5184, cwd ending in `media-storage-stability`; frontend API/media proxy points to 57244. Both media roots resolve to the primary checkout's `backend/runtime`. A process-only CORS entry permits the isolated frontend origin. Health and readiness both passed with MySQL and Redis healthy. These are observed PIDs, not reusable startup configuration.
- Read-only database inspection found IM messages 10802/10803 in conversation 2571 and Social post 64774. The IM expiry/purge fields and Social deletion field are null. No record, migration or media file was modified.
- All four original files returned HTTP 200 through both the isolated backend and frontend proxy, and response SHA-256 matched original disk bytes (114297, 233436, 114297 and 108950 bytes). Missing valid Content hash returned 404 at both origins. JPEG responses are `image/jpeg`; the pre-existing Express WebM MIME is `video/webm`.
- Real browser direct-resource acceptance: original IM image and the second Social image decoded to 1024 x 1024. Original voice playback reached `ended=true`, `readyState=4`, `error=null`, with native duration/currentTime 14.460013 seconds (the stored rounded message label is 15 seconds). This establishes file decoding/playback, not authenticated chat-page acceptance.
- Authenticated conversation/post acceptance, mobile layout/console acceptance and browser-only failure/expiry fixtures remain pending login. Component tests cover failure/retry and explicit-expired states; no test-only business data or API was added to the application.
- Main integration, standard-port activation, remote push and deployment were NOT performed. Another task restarted standard-port services during verification; their running state is not proof of this branch's fix.
- Important contract boundary: current formal API has no authoritative ordinary-media-expiry projection. Sender-supplied `ext.mediaState` is explicitly stripped. The expired renderer is compatibility groundwork only; mapping authoritative expiry and encrypted opened-media caching remain the separately approved lifecycle follow-up. HTTP 404, network errors and age never synthesize expiry.

The remaining unchecked browser acceptance step must be completed with the user's authenticated session before claiming full acceptance.

### Integration preflight (2026-09-05)

- Synced current `main@288cf0ec` into this repair branch as `09401922`, without conflicts. The latest notification schema and Exchange implementation remain unchanged relative to main; no main worktree files or running standard services were modified.
- Regenerated this branch's Prisma client only. No migration was applied and no database records were written.
- Repeated compatibility checks on the combined tree: frontend 15 files / 291 tests passed, backend 7 suites / 161 tests passed (including notification schema and realtime service). Frontend lint and frontend/backend builds passed; existing Vite warnings remain.
- Standard-port baseline was rechecked: the original IM image still returns 404 on port 3000 while readiness is healthy. Running service cwd is `main-agent-admin-integration`, not this repair branch. Switching to this fix requires local-main integration and restarting the formal launcher so its media-directory environment is updated.
- The previous browser tab is no longer available in the browser session; authenticated page acceptance is still unproven. Local-main merge/restart approval was requested separately; no remote push or deployment is authorized by this preflight.

## Global Constraints

- One reversible Step 13 microstep only; do not merge `codex/im-message-lifecycle`.
- Do not modify database rows, create a Prisma migration, move media files, or add mock data.
- Explicit media directories must be absolute; production must use explicit persistent-volume paths.
- HTTP 404, element `error`, message age, and filenames must never be interpreted as expiry.
- All user-visible copy must use the existing i18n translation table.
- Local encrypted opened-media caching remains a separate follow-up microstep.

---

### Task 1: Resolve stable absolute media directories for the formal launcher

**Files:**
- Create: `scripts/formal-media-storage.mjs`
- Create: `scripts/formal-media-storage.test.mjs`
- Modify: `scripts/dev-formal.mjs:1-190`

**Interfaces:**
- Consumes: `process.env`, the absolute project root, and the absolute Git common directory returned by `git rev-parse --path-format=absolute --git-common-dir`.
- Produces: `resolveFormalMediaStorage({ env, projectRoot, gitCommonDirectory }) -> { contentMediaStorageDir, imMediaStorageDir, source }` and `readGitCommonDirectory(projectRoot) -> string | undefined`.

- [x] **Step 1: Write failing resolver tests**

```js
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFormalMediaStorage } from "./formal-media-storage.mjs";

describe("formal media storage", () => {
  it("maps linked worktrees to the shared checkout runtime", () => {
    expect(resolveFormalMediaStorage({
      env: {},
      gitCommonDirectory: "/repo/.git",
      projectRoot: "/repo/.worktrees/feature"
    })).toEqual({
      contentMediaStorageDir: path.normalize("/repo/backend/runtime/content-media"),
      imMediaStorageDir: path.normalize("/repo/backend/runtime/im-media"),
      source: "git-common-directory"
    });
  });

  it("accepts explicit absolute directories", () => {
    expect(resolveFormalMediaStorage({
      env: {
        CONTENT_MEDIA_STORAGE_DIR: "/mnt/needo/content",
        IM_MEDIA_STORAGE_DIR: "/mnt/needo/im"
      },
      gitCommonDirectory: "/repo/.git",
      projectRoot: "/repo/.worktrees/feature"
    })).toMatchObject({
      contentMediaStorageDir: "/mnt/needo/content",
      imMediaStorageDir: "/mnt/needo/im",
      source: "explicit"
    });
  });

  it("rejects an explicit relative directory", () => {
    expect(() => resolveFormalMediaStorage({
      env: { IM_MEDIA_STORAGE_DIR: "runtime/im-media" },
      projectRoot: "/repo"
    })).toThrow("IM_MEDIA_STORAGE_DIR must be an absolute path");
  });

  it("falls back to the current project outside Git", () => {
    expect(resolveFormalMediaStorage({ env: {}, projectRoot: "/srv/needo" }))
      .toMatchObject({
        contentMediaStorageDir: path.normalize("/srv/needo/backend/runtime/content-media"),
        imMediaStorageDir: path.normalize("/srv/needo/backend/runtime/im-media"),
        source: "project-root-fallback"
      });
  });
});
```

- [x] **Step 2: Run the resolver tests and verify RED**

Run: `npx vitest run scripts/formal-media-storage.test.mjs`
Expected: FAIL because `scripts/formal-media-storage.mjs` does not exist.

- [x] **Step 3: Implement the resolver**

```js
import { execFileSync } from "node:child_process";
import path from "node:path";

function explicitAbsolutePath(env, field) {
  const value = env[field]?.trim();
  if (!value) return undefined;
  if (!path.isAbsolute(value)) throw new Error(`${field} must be an absolute path`);
  return path.normalize(value);
}

export function readGitCommonDirectory(projectRoot) {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function resolveFormalMediaStorage({ env, projectRoot, gitCommonDirectory }) {
  if (!path.isAbsolute(projectRoot)) throw new Error("projectRoot must be an absolute path");
  const explicitIm = explicitAbsolutePath(env, "IM_MEDIA_STORAGE_DIR");
  const explicitContent = explicitAbsolutePath(env, "CONTENT_MEDIA_STORAGE_DIR");
  const sharedRoot = gitCommonDirectory
    ? path.dirname(path.resolve(gitCommonDirectory))
    : projectRoot;
  const runtimeRoot = path.join(sharedRoot, "backend", "runtime");
  return {
    contentMediaStorageDir: explicitContent ?? path.join(runtimeRoot, "content-media"),
    imMediaStorageDir: explicitIm ?? path.join(runtimeRoot, "im-media"),
    source: explicitIm || explicitContent
      ? "explicit"
      : gitCommonDirectory
        ? "git-common-directory"
        : "project-root-fallback"
  };
}
```

- [x] **Step 4: Run the resolver tests and verify GREEN**

Run: `npx vitest run scripts/formal-media-storage.test.mjs`
Expected: 4 tests pass.

- [x] **Step 5: Wire the resolver into every formal API process**

In `scripts/dev-formal.mjs`, resolve once from `process.cwd()` and add the same `mediaStorageEnv` to the client, operations, and merchant process environments:

```js
import {
  readGitCommonDirectory,
  resolveFormalMediaStorage
} from "./formal-media-storage.mjs";

const projectRoot = path.resolve(".");
const mediaStorage = resolveFormalMediaStorage({
  env: process.env,
  gitCommonDirectory: readGitCommonDirectory(projectRoot),
  projectRoot
});
const mediaStorageEnv = {
  CONTENT_MEDIA_STORAGE_DIR: mediaStorage.contentMediaStorageDir,
  IM_MEDIA_STORAGE_DIR: mediaStorage.imMediaStorageDir
};
console.log(`[dev:formal] media storage (${mediaStorage.source})`);
console.log(`[dev:formal] IM media      ${mediaStorage.imMediaStorageDir}`);
console.log(`[dev:formal] Content media ${mediaStorage.contentMediaStorageDir}`);
```

Each API `start(..., { env })` call must spread `mediaStorageEnv` before its service-specific fields.

- [x] **Step 6: Re-run launcher tests**

Run: `npx vitest run scripts/formal-media-storage.test.mjs scripts/dev-formal-config.test.mjs`
Expected: both test files pass with no warnings.

- [x] **Step 7: Commit Task 1**

```bash
git add scripts/formal-media-storage.mjs scripts/formal-media-storage.test.mjs scripts/dev-formal.mjs
git commit -m "fix: share formal media storage across worktrees"
```

---

### Task 2: Reject relative media storage in production

**Files:**
- Modify: `backend/src/config/env.ts:1-320`
- Modify: `backend/tests/production-safety.test.ts:1-110`
- Modify: `backend/.env.dev.example:48-57`

**Interfaces:**
- Consumes: the absolute directories injected by Task 1 or deployment environment variables.
- Produces: startup validation that rejects relative IM/Content media directories when `NODE_ENV=production`.

- [x] **Step 1: Write the failing production configuration test**

Add explicit absolute paths to `setValidProductionEnv`, then assert each relative override is rejected:

```ts
process.env.IM_MEDIA_STORAGE_DIR = "/var/lib/needo/im-media";
process.env.CONTENT_MEDIA_STORAGE_DIR = "/var/lib/needo/content-media";

it.each(["IM_MEDIA_STORAGE_DIR", "CONTENT_MEDIA_STORAGE_DIR"])(
  "rejects relative %s in production",
  async (field) => {
    setValidProductionEnv();
    process.env[field] = "runtime/media";
    await expect(importEnv()).rejects.toThrow(`${field} must be an absolute path`);
  }
);
```

- [x] **Step 2: Run the production test and verify RED**

Run: `npm test -- --runInBand tests/production-safety.test.ts` from `backend/`.
Expected: the two new cases fail because relative paths are currently accepted.

- [x] **Step 3: Add production-only absolute path validation**

Import `isAbsolute` from `node:path` and add this block inside the existing production refinement:

```ts
for (const field of ["IM_MEDIA_STORAGE_DIR", "CONTENT_MEDIA_STORAGE_DIR"] as const) {
  if (!isAbsolute(value[field])) {
    addProductionIssue(context, field, `${field} must be an absolute path in production`);
  }
}
```

Update `backend/.env.dev.example` comments to explain that `npm run dev:formal` injects shared absolute directories and that direct/production launches must provide persistent absolute paths.

- [x] **Step 4: Run the production test and verify GREEN**

Run: `npm test -- --runInBand tests/production-safety.test.ts` from `backend/`.
Expected: all cases pass.

- [x] **Step 5: Commit Task 2**

```bash
git add backend/src/config/env.ts backend/tests/production-safety.test.ts backend/.env.dev.example
git commit -m "fix: require persistent production media paths"
```

---

### Task 3: Render formal IM expired and load-failed states

**Files:**
- Modify: `src/features/im/model.ts:291-305`
- Modify: `src/features/im/components.tsx:2949-3090`
- Modify: `src/features/im/components.action-menu.test.tsx:600-1050`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `MessageExt.mediaState?: "available" | "expired"`, media URL/thumbnail URL, and server-provided `duration`.
- Produces: `data-im-media-state="expired|failed|ready"` UI with retry behavior and generic localized labels.

- [x] **Step 1: Write failing IM component tests**

Render image, expired image, and voice messages through `MessageBubble`. Dispatch the native element `error` event and assert:

```tsx
expect(container.textContent).toContain("图片加载失败，点击重试");
expect(container.textContent).not.toContain("private-name.jpeg");
expect(container.querySelector("img")).toBeNull();

expect(expiredContainer.textContent).toContain("图片已过期");
expect(expiredContainer.textContent).not.toContain("图片加载失败");

expect(voiceContainer.textContent).toContain('15"');
expect(voiceContainer.textContent).toContain("语音加载失败，点击重试");
```

Click the failure button and assert a fresh element with the same formal URL is rendered.

- [x] **Step 2: Run the IM test and verify RED**

Run: `npx vitest run src/features/im/components.action-menu.test.tsx`
Expected: new assertions fail because the raw media elements remain visible and no expired/failure states exist.

- [x] **Step 3: Add the formal media state and minimal stateful renderers**

Add the optional contract:

```ts
export type MessageExt = {
  mediaState?: "available" | "expired";
  // existing fields remain unchanged
};
```

Inside `components.tsx`, use a small keyed retry renderer. Its error path must remove the failed native element and render a button; its expired path must never mount the URL:

```tsx
function ImMediaFailure({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <button data-im-media-state="failed" onClick={onRetry} type="button">{label}</button>;
}
```

For image/video, track `failed` and `retryKey`, reset on URL change, use a generic translated alt label, and call `setFailed(true)` from `onError`. For voice, use the same state around `<audio>` and always render `message.ext?.duration ?? 0` from the formal message metadata.

The explicit expired branch is evaluated first:

```tsx
if (message.ext?.mediaState === "expired") {
  return <div data-im-media-state="expired">
    {message.type === "image" ? "图片已过期" : "视频已过期"}
  </div>;
}
```

- [x] **Step 4: Add exact translations**

```ts
"图片已过期": { "zh-Hant": "圖片已過期", ja: "画像の有効期限が切れました", en: "Image expired", ko: "이미지가 만료되었습니다" },
"图片加载失败，点击重试": { "zh-Hant": "圖片載入失敗，點擊重試", ja: "画像を読み込めませんでした。タップして再試行", en: "Image failed to load. Tap to retry", ko: "이미지를 불러오지 못했습니다. 탭하여 다시 시도하세요" },
"视频已过期": { "zh-Hant": "影片已過期", ja: "動画の有効期限が切れました", en: "Video expired", ko: "동영상이 만료되었습니다" },
"视频加载失败，点击重试": { "zh-Hant": "影片載入失敗，點擊重試", ja: "動画を読み込めませんでした。タップして再試行", en: "Video failed to load. Tap to retry", ko: "동영상을 불러오지 못했습니다. 탭하여 다시 시도하세요" },
"语音加载失败，点击重试": { "zh-Hant": "語音載入失敗，點擊重試", ja: "音声を読み込めませんでした。タップして再試行", en: "Audio failed to load. Tap to retry", ko: "음성을 불러오지 못했습니다. 탭하여 다시 시도하세요" },
```

- [x] **Step 5: Run IM and i18n verification**

Run: `npx vitest run src/features/im/components.action-menu.test.tsx src/features/im/formal-api.test.ts`
Expected: both files pass.
Run: `npm run i18n:audit`
Expected: exit 0 with no missing entries introduced by this task.

- [x] **Step 6: Commit Task 3**

```bash
git add src/features/im/model.ts src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/i18n/translations.ts
git commit -m "fix: distinguish expired and failed IM media"
```

---

### Task 4: Replace broken Social tiles with a retry state

**Files:**
- Modify: `src/features/social/components/UnifiedSocialUi.tsx:1297-1370`
- Modify: `src/features/social/components/UnifiedSocialUi.test.ts`

**Interfaces:**
- Consumes: existing `SocialMediaItem`, thumbnail URL resolver, and `onOpen` callback.
- Produces: exported `SocialMediaTileButton` used by `UnifiedMediaBlock`, with `data-social-media-state="failed|ready"` and no expiry inference.

- [x] **Step 1: Write the failing Social tile test**

Render `SocialMediaTileButton`, dispatch `error` on its image, and verify the generic retry state replaces the element and suppresses the authored filename:

```tsx
expect(container.textContent).toContain("图片加载失败，点击重试");
expect(container.textContent).not.toContain("private-upload.jpeg");
expect(container.querySelector("img")).toBeNull();
```

Click once and assert the image remounts without calling `onOpen`; after a successful `load`, click again and assert `onOpen` is called once.

- [x] **Step 2: Run the Social test and verify RED**

Run: `npx vitest run src/features/social/components/UnifiedSocialUi.test.ts`
Expected: FAIL because `SocialMediaTileButton` is not exported.

- [x] **Step 3: Implement the stateful Social tile**

```tsx
export function SocialMediaTileButton({ className, media, onOpen }: {
  className?: string;
  media: SocialMediaItem;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retry = () => { setFailed(false); setRetryKey((value) => value + 1); };
  return (
    <button
      aria-label={failed
        ? media.type === "video" ? "视频加载失败，点击重试" : "图片加载失败，点击重试"
        : media.type === "video" ? "放大视频" : "放大图片"}
      className={className}
      data-social-media-state={failed ? "failed" : "ready"}
      onClick={failed ? retry : onOpen}
      type="button"
    >
      {failed ? <span>{media.type === "video" ? "视频加载失败，点击重试" : "图片加载失败，点击重试"}</span> : media.type === "video" ? (
        <video key={retryKey} muted onError={() => setFailed(true)} playsInline src={media.url} />
      ) : (
        <img alt="" key={retryKey} onError={() => setFailed(true)} src={getSocialMediaPreviewUrl(media)} />
      )}
    </button>
  );
}
```

Keep the existing grid classes, video play glyph, duration label, hidden-count overlay and lightbox callback inside this component. Replace the inline button in `UnifiedMediaBlock` with this component.

- [x] **Step 4: Run Social and combined component tests**

Run: `npx vitest run src/features/social/components/UnifiedSocialUi.test.ts src/features/im/components.action-menu.test.tsx`
Expected: both files pass with no React DOM nesting warning.

- [x] **Step 5: Commit Task 4**

```bash
git add src/features/social/components/UnifiedSocialUi.tsx src/features/social/components/UnifiedSocialUi.test.ts
git commit -m "fix: show retry state for failed social media"
```

---

### Task 5: Verify the exact regression and build

**Files:**
- Modify only if verification exposes a defect in Tasks 1-4.

**Interfaces:**
- Consumes: the current formal database, unchanged files under the primary checkout `backend/runtime`, and the branch implementation.
- Produces: fresh command and browser evidence; no fixture writes to the formal database.

- [x] **Step 1: Run focused automated checks**

```bash
npx vitest run scripts/formal-media-storage.test.mjs scripts/dev-formal-config.test.mjs src/features/im/components.action-menu.test.tsx src/features/im/formal-api.test.ts src/features/social/components/UnifiedSocialUi.test.ts
npm --prefix backend test -- --runInBand tests/production-safety.test.ts tests/im-voice-message-api.test.ts tests/content-media-api.test.ts tests/social-media-api.test.ts
npm run i18n:audit
npm run lint
npm run build
```

Expected: every command exits 0; no failing tests, type errors, missing translations, or build errors.

- [x] **Step 2: Start an isolated formal runtime and prove process ownership**

Start this branch on free nonstandard ports only for pre-integration verification. Record listener PID, cwd, branch, frontend proxy target and resolved media directories. Do not present alternate-port evidence as proof that the standard `main` runtime is fixed.

- [x] **Step 3: Verify the exact stored URLs**

Read the previously identified IM image, 15-second voice, and two Social image URLs from the formal database without mutating rows. Request each through the isolated backend and frontend proxy; expect HTTP 200 and the stored MIME type. Request an unknown valid hash; expect HTTP 404.

- [ ] **Step 4: Perform browser acceptance**

Open the original conversation and Social post using the formal authenticated session. Confirm the existing images render, the voice keeps the 15-second duration and plays, the generic failure fixture offers retry, and an explicit `mediaState=expired` fixture displays the expired placeholder. Inspect console errors and mobile overflow.

- [x] **Step 5: Review diff and commit any verification-only correction**

Run `git diff --check`, `git status --short`, and `git log --oneline main..HEAD`. If verification required a code correction, repeat its RED/GREEN cycle and commit only the related files.
