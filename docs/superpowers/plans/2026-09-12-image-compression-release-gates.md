# NeeDo Image Compression Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress versioned runtime images locally, compress all public image uploads on the originating browser or App before transfer, retain server-side security validation without routine re-encoding, preserve sensitive originals, merge the verified batch into local `main`, and complete final acceptance on 5180 without modifying any remote system.

**Architecture:** Static assets use a deterministic Sharp-based local optimizer, a committed manifest, SSIM thresholds, and a read-only production gate. Browser/App uploads use one shared purpose-driven optimizer before existing API adapters; the server independently validates bytes, format, dimensions, frame count, ownership, and hashes, then stores the already-compressed bytes. Sensitive identity media uses an atomic original-plus-preview bundle: the client creates the preview, the server validates their relationship without persisting a server-generated derivative.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Web Worker/Canvas APIs, Node.js 22, Sharp/libvips, Express, Jest, Prisma/MySQL, existing AWS S3/SSM staging release scripts.

## Global Constraints

- Static photography and illustration candidates require SSIM `>= 0.99`.
- Critical UI, text, icon, ranking, and brand candidates are lossless or require SSIM `>= 0.995` plus visual review.
- Identity/OCR originals are never lossily compressed; client previews require server-side low-resolution relationship SSIM `>= 0.98`.
- Preserve static paths, dimensions, visual orientation, Alpha, and animation semantics.
- Do not replace a static file unless it saves at least 10% or 32 KiB; otherwise record `kept-original`.
- Public image uploads are compressed on the originating browser/App; the server never silently falls back to routine re-encoding.
- The server still enforces authentication, RBAC, ownership, byte, signature, decode, pixel, dimension, frame, purpose, and SHA-256 checks.
- Do not call TinyPNG or any other external image-processing service.
- Keep `/Users/eason/Documents/New project/.worktrees/main-runtime-5180` and ports `5180/3000/3001/3002` completely untouched during branch development; only after successful local-main merge may the exact local-main SHA be loaded there for final acceptance.
- Preserve old media URLs and database records; no historical media backfill is included.
- Do not push any branch, tag, or commit and do not create or merge a GitHub PR in this batch.
- Do not deploy, trigger CI/CD, SSH, or modify staging/production data, configuration, files, or services in this batch.

---

### Task 1: Build the deterministic static-image policy and quality library

**Files:**
- Create: `config/production-images.json`
- Create: `scripts/production-images-lib.mjs`
- Create: `scripts/production-images-lib.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: JPEG, PNG, and WebP bytes under `public/` and `src/assets/runtime/`.
- Produces: `loadProductionImagePolicy(root)`, `computeImageSsim(reference, candidate)`, `classifyProductionImage(path, metadata)`, and `optimizeProductionImage(input)`.
- `optimizeProductionImage(input)` returns `{ status, sourceSha256, resultSha256, sourceBytes, resultBytes, width, height, format, hasAlpha, pages, ssim, codec }`.

- [ ] **Step 1: Add the failing policy and SSIM tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  classifyProductionImage,
  computeImageSsim,
  optimizeProductionImage
} from "./production-images-lib.mjs";

test("critical UI paths require the 0.995 threshold", () => {
  assert.deepEqual(
    classifyProductionImage("public/images/needo-pet/xiao-bai-revive.png", {
      format: "png",
      hasAlpha: true
    }),
    { category: "critical", minSsim: 0.995 }
  );
});

test("identical decoded pixels have SSIM 1", () => {
  const rgba = Uint8Array.from([20, 40, 60, 255, 20, 40, 60, 255]);
  assert.equal(computeImageSsim(rgba, rgba, 2, 1), 1);
});

test("optimizer refuses a smaller candidate below its quality threshold", async () => {
  const source = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#ec4899" }
  }).jpeg({ quality: 100 }).toBuffer();
  const result = await optimizeProductionImage({
    bytes: source,
    relativePath: "public/images/generated/quality-test.jpg"
  });
  assert.ok(result.ssim >= 0.99 || result.status === "kept-original");
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `node --test scripts/production-images-lib.test.mjs`

Expected: FAIL because `production-images-lib.mjs` does not exist.

- [ ] **Step 3: Add Sharp and the locked policy**

Run: `npm install --save-dev sharp@0.35.4`

Create `config/production-images.json` with this contract:

```json
{
  "formatVersion": 1,
  "roots": ["public", "src/assets/runtime"],
  "extensions": [".jpg", ".jpeg", ".png", ".webp"],
  "criticalPatterns": [
    "public/apple-touch-icon.png",
    "public/images/needo-pet/",
    "icon",
    "logo",
    "rank",
    "badge",
    "qr"
  ],
  "photoMinSsim": 0.99,
  "criticalMinSsim": 0.995,
  "minimumSavingsRatio": 0.1,
  "minimumSavingsBytes": 32768,
  "jpegQualities": [88, 90, 92, 94, 96],
  "webpQualities": [86, 88, 90, 92, 94, 96],
  "pngQualities": [95, 97, 99, 100]
}
```

- [ ] **Step 4: Implement deterministic decode, block SSIM, classification, and codec attempts**

The exported optimizer must use Sharp with `failOn: "warning"`, `limitInputPixels: 25000000`, `sequentialRead: true`, and `animated: true`. Decode comparison buffers with `rotate().ensureAlpha().raw()`. For each 8x8 luminance block, calculate:

```js
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;
const blockSsim = ((2 * meanA * meanB + C1) * (2 * covariance + C2)) /
  ((meanA ** 2 + meanB ** 2 + C1) * (varianceA + varianceB + C2));
```

Use the first candidate that meets the category threshold and savings rule. Critical PNGs try lossless `png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })`; other PNGs try the configured palette qualities; JPEG uses `mozjpeg: true`; WebP uses `effort: 6`. Multi-frame assets return `kept-original` unless all frame metadata is preserved and verified.

- [ ] **Step 5: Run the library tests**

Run: `node --test scripts/production-images-lib.test.mjs`

Expected: PASS with no external network requests and no writes outside test temp directories.

- [ ] **Step 6: Commit the static optimizer core**

```bash
git add config/production-images.json scripts/production-images-lib.mjs scripts/production-images-lib.test.mjs package.json package-lock.json
git commit -m "feat(images): add deterministic static optimizer"
```

---

### Task 2: Add the static manifest, CLI commands, production gate, and development rule

**Files:**
- Create: `scripts/optimize-production-images.mjs`
- Create: `scripts/verify-production-images.mjs`
- Create: `scripts/production-images-cli.test.mjs`
- Create: `config/production-images.manifest.json`
- Modify: `scripts/audit-production-bundle-lib.mjs`
- Modify: `scripts/audit-production-bundle-lib.test.mjs`
- Modify: `scripts/aws-staging-package-application.mjs`
- Modify: `deploy/staging/runtime-contract.test.mjs`
- Modify: `package.json`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1 policy and optimizer.
- Produces: `npm run optimize:production-images` and read-only `npm run verify:production-images`.
- Manifest item shape: `{ path, status, sourceSha256, resultSha256, sourceBytes, resultBytes, width, height, format, hasAlpha, pages, codec, ssim, exceptionReason }`.

- [ ] **Step 1: Write failing CLI and build-gate tests**

```js
test("verification rejects an unregistered raster", async () => {
  await writeFile(join(root, "public/new.png"), validPng);
  await assert.rejects(
    () => verifyProductionImages({ root, manifestPath }),
    /not registered: public\/new\.png/
  );
});

test("verification rejects a changed result hash", async () => {
  await writeFile(join(root, "public/known.png"), Buffer.from("changed"));
  await assert.rejects(
    () => verifyProductionImages({ root, manifestPath }),
    /result SHA-256 mismatch/
  );
});
```

Add a staging contract assertion that the packager invokes `npm run verify:production-build`, not raw `npm run build`.

- [ ] **Step 2: Verify the new tests fail**

Run: `node --test scripts/production-images-cli.test.mjs scripts/audit-production-bundle-lib.test.mjs deploy/staging/runtime-contract.test.mjs`

Expected: FAIL because the CLIs and manifest gate do not exist.

- [ ] **Step 3: Implement atomic optimization and read-only verification**

`optimize-production-images.mjs` must walk only configured roots, write each accepted candidate to a mode-0600 same-directory temporary file, verify it, rename it atomically, and write the manifest last. `verify-production-images.mjs` must never mutate images or the manifest. Export the orchestration functions so the temp-directory tests do not spawn subprocesses.

Add these scripts:

```json
{
  "optimize:production-images": "node scripts/optimize-production-images.mjs",
  "verify:production-images": "node scripts/verify-production-images.mjs",
  "verify:production-build": "npm run verify:production-images && npm run build -- --mode formal && npm run audit:production-bundle"
}
```

Make the AWS packager run `npm run verify:production-build` so staging packaging cannot bypass the image gate.

- [ ] **Step 4: Add the development principle**

Append an `Image compression before push and deployment` subsection to `AGENTS.md` that requires:

```text
New or modified runtime raster images must be processed locally with
npm run optimize:production-images and must pass npm run verify:production-images.
Public upload entry points must use the shared client-side optimizer before transfer.
Servers validate uploaded bytes independently but do not perform routine compression.
Quality thresholds and sensitive-original exceptions are defined in
docs/superpowers/specs/2026-09-11-image-compression-release-gates-design.md.
Do not push or deploy when the manifest, automated quality gate, or required visual review fails.
```

- [ ] **Step 5: Run CLI, bundle, and packaging-contract tests**

Run: `node --test scripts/production-images-lib.test.mjs scripts/production-images-cli.test.mjs scripts/audit-production-bundle-lib.test.mjs deploy/staging/runtime-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the gate and rule**

```bash
git add AGENTS.md config/production-images.manifest.json package.json scripts/optimize-production-images.mjs scripts/verify-production-images.mjs scripts/production-images-cli.test.mjs scripts/audit-production-bundle-lib.mjs scripts/audit-production-bundle-lib.test.mjs scripts/aws-staging-package-application.mjs deploy/staging/runtime-contract.test.mjs
git commit -m "feat(images): enforce production image gate"
```

---

### Task 3: Optimize tracked runtime images and produce visual evidence

**Files:**
- Modify: eligible JPEG, PNG, and WebP files under `public/` and `src/assets/runtime/`
- Modify: `config/production-images.manifest.json`
- Create: `docs/qa/2026-09-12-image-compression.md`

**Interfaces:**
- Consumes: Tasks 1-2 CLIs.
- Produces: a versioned optimized static-image set and a manifest accepted by the production gate.

- [ ] **Step 1: Capture the baseline and confirm the empty manifest fails**

Run: `npm run verify:production-images`

Expected: FAIL listing unregistered runtime rasters.

- [ ] **Step 2: Run the local optimizer once**

Run: `npm run optimize:production-images -- --evidence-dir outputs/image-compression`

Expected: every eligible image reports `optimized`, `lossless`, or a machine-readable `kept-original` reason; no external request is made.

- [ ] **Step 3: Prove deterministic idempotency**

Run twice:

```bash
npm run verify:production-images
npm run optimize:production-images -- --check
```

Expected: both PASS and `--check` reports zero pending mutations.

- [ ] **Step 4: Review image comparisons before accepting binary changes**

Open `outputs/image-compression/index.html` and inspect the generated side-by-side set covering the 20 largest sources, 20 highest savings ratios, login/launch/error backgrounds, homepage carousel, avatars/profile cards, IM/Social samples, service cards, ranking/badge assets, and NeeDo pet assets. Reject and re-run any candidate showing blur, banding, text-edge damage, Alpha halos, animation loss, or crop changes.

- [ ] **Step 5: Generate the tracked evidence report**

Run: `node scripts/verify-production-images.mjs --write-report docs/qa/2026-09-12-image-compression.md`

Expected: report contains exact before/after totals, savings, status counts, threshold failures `0`, manifest SHA-256, and the reviewed comparison categories without embedding original sensitive data.

- [ ] **Step 6: Commit only accepted binaries, manifest, and evidence**

```bash
git add public src/assets/runtime config/production-images.manifest.json docs/qa/2026-09-12-image-compression.md
git diff --cached --check
git commit -m "perf(images): optimize production runtime assets"
```

---

### Task 4: Build the shared client-side optimizer and quality gate

**Files:**
- Create: `src/lib/image-upload/types.ts`
- Create: `src/lib/image-upload/profiles.ts`
- Create: `src/lib/image-upload/ssim.ts`
- Create: `src/lib/image-upload/browser-codec.ts`
- Create: `src/lib/image-upload/optimizer.ts`
- Create: `src/lib/image-upload/image-upload.worker.ts`
- Create: `src/lib/image-upload/index.ts`
- Create: `src/lib/image-upload/optimizer.test.ts`
- Modify: `src/lib/imageUpload.ts`
- Modify: `src/lib/imageUpload.test.ts`

**Interfaces:**
- Produces: `optimizeImageUpload(source, purpose, options?): Promise<OptimizedImageUpload>` and internal test seam `optimizeImageUploadWithCodec(source, purpose, codec, options?)`.
- Purpose union: `avatar | im | social | carousel | shop-presentation | service-cover | official-notice | identity-preview`.
- Result: `{ file: File, width, height, sourceBytes, resultBytes, mimeType, ssim, status: "optimized" | "reencoded" }`.
- Options: `{ signal?: AbortSignal, onStage?: (stage: "decoding" | "compressing" | "verifying") => void }`.

- [ ] **Step 1: Write failing purpose, SSIM, abort, Alpha, and fallback tests**

```ts
it("never returns a candidate below the purpose SSIM floor", async () => {
  const codec = createFakeCodec({ candidateSsim: 0.97, sourceBytes: 2_000_000 });
  await expect(optimizeImageUploadWithCodec(photo, "social", codec)).rejects.toThrow(
    "error.image_upload.quality_failed"
  );
});

it("preserves Alpha and the original visual dimensions", async () => {
  const codec = createFakeCodec({ candidateSsim: 0.999, hasAlpha: true });
  const result = await optimizeImageUploadWithCodec(alphaPng, "avatar", codec);
  expect(result).toMatchObject({ width: 800, height: 600, ssim: 0.999 });
  expect(codec.lastEncodeOptions.preserveAlpha).toBe(true);
});

it("does not upload an unoptimized original when browser encoding is unavailable", async () => {
  const codec = createFakeCodec({ encodeSupported: false });
  await expect(optimizeImageUploadWithCodec(photo, "im", codec)).rejects.toThrow(
    "error.image_upload.unsupported"
  );
});
```

- [ ] **Step 2: Verify the client tests fail**

Run: `npx vitest run src/lib/image-upload/optimizer.test.ts src/lib/imageUpload.test.ts`

Expected: FAIL because the shared optimizer modules do not exist.

- [ ] **Step 3: Implement profiles and deterministic candidate selection**

Use this locked client contract:

```ts
export const IMAGE_UPLOAD_PROFILES = {
  avatar: { maxDimension: 1200, maxBytes: 675_000, minSsim: 0.99 },
  im: { maxDimension: 2048, maxBytes: 2_000_000, minSsim: 0.99 },
  social: { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.99 },
  carousel: { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.995 },
  "shop-presentation": { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.99 },
  "service-cover": { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.99 },
  "official-notice": { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.995 },
  "identity-preview": { maxDimension: 2560, maxBytes: 2_000_000, minSsim: 0.995 }
} as const;
```

Try qualities `0.86, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98`. Compare the decoded candidate with a same-size high-quality reference. Select the smallest passing candidate; never lower the SSIM floor to meet `maxBytes`.

- [ ] **Step 4: Implement worker-first execution with bounded main-thread fallback**

The worker accepts transferable `ArrayBuffer` input and returns transferable encoded bytes plus measurements. `optimizer.ts` uses the worker when available; the fallback yields between decode, encode, and compare stages with `await new Promise(requestAnimationFrame)` and respects `AbortSignal`. Do not persist original bytes or intermediate canvas data in IndexedDB, localStorage, or sessionStorage.

- [ ] **Step 5: Make the legacy data-URL helper delegate to the new engine**

`readImageFileAsDataUrl()` must call `optimizeImageUpload(file, "avatar")`, convert only the accepted result to a data URL, and propagate processing failures. Delete the current silent `catch { return readFileAsDataUrl(file); }` behavior.

- [ ] **Step 6: Run client optimizer tests and typecheck**

Run: `npx vitest run src/lib/image-upload/optimizer.test.ts src/lib/imageUpload.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 7: Commit the client optimizer**

```bash
git add src/lib/image-upload src/lib/imageUpload.ts src/lib/imageUpload.test.ts
git commit -m "feat(images): add client upload optimizer"
```

---

### Task 5: Route every public raw-image API through client optimization

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/realtime/api.test.ts`
- Modify: `src/api/contentPublication.ts`
- Modify: `src/api/contentPublication.test.ts`
- Modify: `src/api/officialNotices.ts`
- Modify: `src/api/officialNotices.test.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/features/pricing-mode/api.ts`
- Modify: `src/features/pricing-mode/api.test.ts`
- Modify: `src/features/identity-applications/api.ts`
- Modify: `src/features/identity-applications/api.test.ts`

**Interfaces:**
- Consumes: Task 4 `optimizeImageUpload`.
- Produces: existing API return contracts unchanged; raw request bodies become verified optimized `File`/`Blob` objects.

- [ ] **Step 1: Change API tests to require optimized bytes**

Mock `optimizeImageUpload` to return `optimizedFile`, call each API with `originalFile`, and assert the HTTP client receives `optimizedFile`, its actual MIME, and its preserved safe filename. Cover mappings:

```ts
expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "im");
expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "social");
expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "carousel");
expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "official-notice");
expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "shop-presentation");
expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "service-cover");
```

- [ ] **Step 2: Run the focused API tests and confirm they fail**

Run: `npx vitest run src/features/realtime/api.test.ts src/api/contentPublication.test.ts src/api/officialNotices.test.ts src/features/pricing-mode/api.test.ts src/features/identity-applications/api.test.ts`

Expected: FAIL because APIs still send original files.

- [ ] **Step 3: Wrap each existing API adapter before `httpClient.request`**

Use this pattern without changing route URLs or response types:

```ts
async uploadSocialMedia(file: File) {
  const optimized = await optimizeImageUpload(file, "social");
  return httpClient.request<RealtimeSocialMediaUpload>("/social/media", {
    body: optimized.file,
    headers: { "Content-Type": optimized.mimeType },
    method: "POST",
    query: { fileName: optimized.file.name }
  });
}
```

Map `contentPublication.uploadContentImage` to `carousel`, `officialNotices.uploadMedia` to `official-notice`, merchant presentation to `shop-presentation`, service covers to `service-cover`, and identity `showcase` to `shop-presentation`. Sensitive identity purposes remain unmodified until Tasks 9-10 replace them with bundles.

- [ ] **Step 4: Run the focused API tests**

Run: `npx vitest run src/features/realtime/api.test.ts src/api/contentPublication.test.ts src/api/officialNotices.test.ts src/features/pricing-mode/api.test.ts src/features/identity-applications/api.test.ts`

Expected: PASS and no assertion expects raw original bytes for public images.

- [ ] **Step 5: Commit public adapter coverage**

```bash
git add src/features/realtime/api.ts src/features/realtime/api.test.ts src/api/contentPublication.ts src/api/contentPublication.test.ts src/api/officialNotices.ts src/api/officialNotices.test.ts src/api/backofficeRealData.ts src/features/pricing-mode/api.ts src/features/pricing-mode/api.test.ts src/features/identity-applications/api.ts src/features/identity-applications/api.test.ts
git commit -m "feat(images): optimize public uploads before transfer"
```

---

### Task 6: Preserve upload UX, cancellation, retry, and localized errors

**Files:**
- Modify: `src/features/social/pages/SocialComposerPage.tsx`
- Modify: `src/features/social/pages/SocialComposerPage.test.tsx`
- Modify: `src/features/social/components/SocialQuickReplyComposer.tsx`
- Modify: `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- Modify: `src/features/content-publication/LocalizedCarouselEditor.tsx`
- Modify: `src/features/official-notices/OfficialNoticeWorkspace.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/user/StoreDetailPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 optimizer errors and Task 5 async API methods.
- Produces: visible `optimizing`, `uploading`, `failed`, `uploaded`, and `cancelled` states without blocking existing Social publish behavior.

- [ ] **Step 1: Add failing interaction tests**

```ts
it("keeps Social publication non-blocking while local optimization continues", async () => {
  optimizeDeferred.resolveAfterPublish = true;
  await selectImage(file);
  await clickPublish();
  expect(navigate).toHaveBeenCalled();
  expect(screen.getByText("图片正在本地优化并上传…")).toBeTruthy();
});

it("shows a retryable local-processing error without sending original bytes", async () => {
  optimizeImageUpload.mockRejectedValue(new Error("error.image_upload.quality_failed"));
  await selectImage(file);
  expect(uploadRequest).not.toHaveBeenCalled();
  expect(screen.getByText("图片质量验证未通过，请重新选择图片。")).toBeTruthy();
});
```

- [ ] **Step 2: Confirm the interaction tests fail**

Run: `npx vitest run src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx`

Expected: FAIL because local optimization has no distinct status/error copy.

- [ ] **Step 3: Add status and error mapping without a second upload state machine**

Extend existing upload states to include `optimizing` and `cancelled`. Reuse the current task maps, retry buttons, unmount guards, and object-URL cleanup. Add five-language translations for:

```text
图片正在本地优化并上传…
图片质量验证未通过，请重新选择图片。
当前设备无法安全处理这张图片。
图片处理已取消。
```

Do not add a crop step to carousel or service-cover uploads.

- [ ] **Step 4: Run all changed-surface tests**

Run: `npx vitest run src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/content-publication src/features/official-notices src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/pages/user/StoreDetailPage.test.ts`

Expected: PASS; Social still leaves the composer while its task continues and retries use the same selected source file.

- [ ] **Step 5: Commit UX integration**

```bash
git add src/features/social src/features/content-publication/LocalizedCarouselEditor.tsx src/features/official-notices/OfficialNoticeWorkspace.tsx src/pages/mobile/TechnicianPortalPage.tsx src/pages/user/StoreDetailPage.tsx src/i18n/translations.ts
git commit -m "feat(images): expose local upload processing states"
```

---

### Task 7: Create one server-side validation service and persist verified metadata

**Files:**
- Create: `backend/src/services/image-upload-profiles.ts`
- Create: `backend/src/services/image-upload-validator.service.ts`
- Create: `backend/tests/image-upload-validator.service.test.ts`
- Modify: `backend/src/services/content-media.storage.ts`
- Modify: `backend/src/services/im-media.storage.ts`
- Modify: `backend/src/services/customer-avatar.storage.ts`
- Modify: `backend/tests/content-media.service.test.ts`
- Modify: `backend/tests/im-media.service.test.ts`
- Modify: `backend/tests/customer-avatar-storage.test.ts`

**Interfaces:**
- Produces: `ImageUploadValidator.validate(input): Promise<ValidatedImageUpload>`.
- Input: `{ bytes: Buffer, declaredMimeType: string, purpose: ServerImageUploadPurpose }`.
- Result: `{ checksumSha256, mimeType, extension, width, height, pages, hasAlpha, bytes }`.

- [ ] **Step 1: Write failing spoofing, corruption, pixel, frame, size, and no-reencode tests**

```ts
it("rejects a PNG body declared as JPEG", async () => {
  await expect(validator.validate({
    bytes: validPng,
    declaredMimeType: "image/jpeg",
    purpose: "social"
  })).rejects.toMatchObject({ message: "error.image_upload.invalid" });
});

it("rejects decoded dimensions above the purpose contract", async () => {
  await expect(validator.validate({
    bytes: oversizedDimensionsPng,
    declaredMimeType: "image/png",
    purpose: "avatar"
  })).rejects.toMatchObject({ message: "error.image_upload.dimensions_exceeded" });
});

it("returns the exact accepted bytes without encoding them", async () => {
  const result = await validator.validate({ bytes: validJpeg, declaredMimeType: "image/jpeg", purpose: "im" });
  expect(result.bytes).toBe(validJpeg);
});
```

- [ ] **Step 2: Confirm validator tests fail**

Run: `npm --prefix backend test -- --runInBand tests/image-upload-validator.service.test.ts`

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement bounded Sharp validation**

Construct Sharp with:

```ts
sharp(input.bytes, {
  animated: true,
  failOn: "warning",
  limitInputPixels: profile.maxPixels,
  sequentialRead: true
})
```

Require a supported decoded format matching the declared MIME, positive dimensions, `width * height <= maxPixels`, `pages <= maxFrames`, and bytes/dimensions within the mirrored purpose profile. Call `stats()` to force complete decode. Calculate SHA-256 on the original accepted bytes. Never call `.jpeg()`, `.png()`, `.webp()`, `.toFormat()`, or `.toFile()` in this service.

- [ ] **Step 4: Delegate existing storage validation to the service**

Keep each storage class responsible for atomic filesystem behavior and safe file keys. Pass the purpose from each service; return verified width and height alongside checksum/MIME. Do not weaken existing compensation deletion or checksum-lock behavior.

- [ ] **Step 5: Run validator and storage tests**

Run: `npm --prefix backend test -- --runInBand tests/image-upload-validator.service.test.ts tests/content-media.service.test.ts tests/im-media.service.test.ts tests/customer-avatar-storage.test.ts tests/content-media-atomic-storage.test.ts`

Expected: PASS; malformed eight-byte “PNG” fixtures are replaced with fully decodable fixtures where deep validation is expected.

- [ ] **Step 6: Commit validation core**

```bash
git add backend/src/services/image-upload-profiles.ts backend/src/services/image-upload-validator.service.ts backend/src/services/content-media.storage.ts backend/src/services/im-media.storage.ts backend/src/services/customer-avatar.storage.ts backend/tests/image-upload-validator.service.test.ts backend/tests/content-media.service.test.ts backend/tests/im-media.service.test.ts backend/tests/customer-avatar-storage.test.ts
git commit -m "feat(images): validate uploads without server encoding"
```

---

### Task 8: Apply validation and real dimensions to every public media service

**Files:**
- Modify: `backend/src/services/content-media.service.ts`
- Modify: `backend/src/services/social-media.service.ts`
- Modify: `backend/src/services/official-notice-media.service.ts`
- Modify: `backend/src/services/technician-service-cover.service.ts`
- Modify: `backend/src/services/im-media.service.ts`
- Modify: `backend/src/repositories/content-media.repository.ts`
- Modify: `backend/src/repositories/social-media.repository.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: relevant tests under `backend/tests/*media*.test.ts` and `backend/tests/technician-service-cover.service.test.ts`

**Interfaces:**
- Consumes: Task 7 validated `{ width, height, checksumSha256, mimeType }`.
- Produces: MediaAsset rows and IM upload registrations with server-computed metadata; public API response shapes remain compatible.

- [ ] **Step 1: Add failing service/repository metadata tests**

Assert each repository receives the validator’s non-null width, height, exact MIME, byte count, and checksum rather than `null` dimensions or client claims.

```ts
expect(repository.createUpload).toHaveBeenCalledWith(expect.objectContaining({
  width: 640,
  height: 480,
  fileSize: validJpeg.length,
  mimeType: "image/jpeg",
  checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
}));
```

- [ ] **Step 2: Run focused backend tests and confirm failure**

Run: `npm --prefix backend test -- --runInBand tests/content-media.service.test.ts tests/social-media.service.test.ts tests/official-notice-media.service.test.ts tests/im-media.service.test.ts tests/technician-service-cover.service.test.ts`

Expected: FAIL because current repositories persist null/missing dimensions.

- [ ] **Step 3: Thread verified metadata through existing transactions**

Extend existing repository input types; write `MediaAsset.width` and `MediaAsset.height`; preserve existing ownership, checksum locks, audit actions, purge times, and compensation logic. Do not add a parallel media table.

- [ ] **Step 4: Run API, service, and storage suites**

Run: `npm --prefix backend test -- --runInBand tests/content-media-api.test.ts tests/content-media.service.test.ts tests/social-media-api.test.ts tests/social-media.service.test.ts tests/official-notice-media.service.test.ts tests/im-media.service.test.ts tests/technician-service-cover.service.test.ts tests/content-media-atomic-storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit public server enforcement**

```bash
git add backend/src/services backend/src/repositories backend/tests
git commit -m "feat(images): enforce verified public media metadata"
```

---

### Task 9: Add atomic sensitive-original and client-preview persistence

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260912200000_identity_media_previews/migration.sql`
- Modify: `backend/src/services/identity-application-media.storage.ts`
- Modify: `backend/src/services/identity-application-media.service.ts`
- Modify: `backend/src/repositories/identity-application-media.repository.ts`
- Create: `backend/src/services/identity-preview-comparison.service.ts`
- Create: `backend/tests/identity-preview-comparison.service.test.ts`
- Modify: `backend/tests/identity-application-media.storage.test.ts`
- Modify: `backend/tests/identity-application-media.service.test.ts`
- Modify: `backend/tests/identity-application-media.repository.test.ts`

**Interfaces:**
- Produces: `IdentityApplicationMedia.variant: "original" | "preview"` and nullable `sourceMediaId` self-relation.
- Produces: `uploadBundle(input)` accepting original bytes/MIME and preview bytes/MIME as one service operation.
- Preview comparison uses direction-normalized in-memory references with longest edge 256 and SSIM `>= 0.98`; neither input is re-encoded for storage.

- [ ] **Step 1: Add failing schema and service tests**

```ts
it("rejects a preview that does not represent its original", async () => {
  await expect(service.uploadBundle({
    ...validContext,
    original: identityDocument,
    preview: unrelatedPortrait
  })).rejects.toMatchObject({ message: "error.identity_application.preview_mismatch" });
  expect(repository.attachBundleInTransaction).not.toHaveBeenCalled();
});

it("compensates both stored files when bundle persistence fails", async () => {
  repository.attachBundleInTransaction.mockRejectedValue(new Error("db failed"));
  await expect(service.uploadBundle(validBundle)).rejects.toThrow("db failed");
  expect(storage.delete).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Confirm the identity tests fail**

Run: `npm --prefix backend test -- --runInBand tests/identity-preview-comparison.service.test.ts tests/identity-application-media.service.test.ts tests/identity-application-media.repository.test.ts`

Expected: FAIL because variants and bundle operations do not exist.

- [ ] **Step 3: Add the additive migration**

The migration adds `variant VARCHAR(20) NOT NULL DEFAULT 'original'`, nullable `source_media_id`, a self foreign key using `ON DELETE RESTRICT`, an index on `source_media_id`, and a unique key on `(source_media_id, variant)`. Existing rows remain `original`; do not rewrite or delete historical media.

- [ ] **Step 4: Implement comparison, two-file storage, and one database transaction**

Validate the original with purpose `identity-original` and the preview with `identity-preview`. Compare only the in-memory 256-pixel references. Save both with independent keys, then attach two MediaAsset/IdentityApplicationMedia rows in one Prisma transaction and one optimistic application-version increment. On any failure, remove only newly created files from this attempt.

- [ ] **Step 5: Run identity storage/service/repository tests and Prisma validation**

Run:

```bash
npm --prefix backend test -- --runInBand tests/identity-preview-comparison.service.test.ts tests/identity-application-media.storage.test.ts tests/identity-application-media.service.test.ts tests/identity-application-media.repository.test.ts
npm --prefix backend run prisma:generate
npm --prefix backend exec prisma validate -- --schema prisma/schema.prisma
```

Expected: PASS with no migration application to local, staging, or production databases in this task.

- [ ] **Step 6: Commit identity persistence**

```bash
git add backend/prisma backend/src/services/identity-application-media.storage.ts backend/src/services/identity-application-media.service.ts backend/src/services/identity-preview-comparison.service.ts backend/src/repositories/identity-application-media.repository.ts backend/tests/identity-preview-comparison.service.test.ts backend/tests/identity-application-media.storage.test.ts backend/tests/identity-application-media.service.test.ts backend/tests/identity-application-media.repository.test.ts
git commit -m "feat(identity): persist original and preview bundles"
```

---

### Task 10: Upload sensitive bundles from the originating device

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/middlewares/identity-media-bundle.middleware.ts`
- Modify: `backend/src/routes/identity-application-media.routes.ts`
- Modify: `backend/src/controllers/identity-application-media.controller.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/identity-application-media-api.test.ts`
- Modify: `src/features/identity-applications/api.ts`
- Modify: `src/features/identity-applications/api.test.ts`
- Modify: `src/features/identity-applications/TechnicianApplicationPage.tsx`
- Modify: `src/features/identity-applications/TechnicianApplicationPage.test.tsx`
- Modify: `src/features/identity-applications/MerchantApplicationPage.tsx`
- Modify: `src/features/identity-applications/MerchantApplicationPage.test.tsx`

**Interfaces:**
- Produces: `POST /api/v1/identity-applications/:id/media-bundle` with multipart fields `original` and `preview`, query `purpose` and `expected_version`.
- Produces frontend `uploadSensitiveMediaBundle(id, purpose, expectedVersion, originalFile)`; it creates the preview locally before constructing FormData.
- Existing raw `/media` endpoint remains available only for non-sensitive `showcase` uploads.

- [ ] **Step 1: Add failing API and page tests**

```ts
it("sends the untouched original and locally optimized preview in one multipart request", async () => {
  optimizeImageUpload.mockResolvedValue({ ...optimizedPreview, file: previewFile });
  await identityApplicationsApi.uploadSensitiveMediaBundle(41, "identity_document", 3, originalFile);
  expect(optimizeImageUpload).toHaveBeenCalledWith(originalFile, "identity-preview");
  expect(request.body.get("original")).toBe(originalFile);
  expect(request.body.get("preview")).toBe(previewFile);
});
```

Backend API tests must prove wrong file counts, unexpected fields, spoofed MIME, oversized parts, preview mismatch, invalid purpose, missing ownership, and version conflict all produce stable error responses with zero persistence.

- [ ] **Step 2: Confirm frontend and backend tests fail**

Run:

```bash
npx vitest run src/features/identity-applications/api.test.ts src/features/identity-applications/TechnicianApplicationPage.test.tsx src/features/identity-applications/MerchantApplicationPage.test.tsx
npm --prefix backend test -- --runInBand tests/identity-application-media-api.test.ts
```

Expected: FAIL because the bundle endpoint and client method do not exist.

- [ ] **Step 3: Add bounded multipart parsing**

Install `multer` and `@types/multer` at locked versions in `backend/package.json`. Configure memory storage with exactly two accepted field names, one file each, an 8 MiB original limit, a 2 MiB preview limit enforced after parsing, and no disk temp directory. Reject filenames and MIME values not accepted by the service; the service still verifies actual decoded bytes.

- [ ] **Step 4: Implement route/controller/OpenAPI without controller business logic**

Controller passes authenticated user, numeric application/version/purpose, both buffers, and both declared MIME values to `IdentityApplicationMediaService.uploadBundle`. Document the multipart fields, `201` response containing original/preview IDs and the new application version, and all `400/403/404/409/413/415` errors.

- [ ] **Step 5: Switch identity pages to the bundle method**

Sensitive purposes `portrait`, `identity_document`, `corporate_registration`, and `representative_identity` call `uploadSensitiveMediaBundle`. `showcase` calls the ordinary optimized public-image method. Preserve optimistic version sequencing and retry from the original in-memory File; do not store identity bytes in browser persistence or log them.

- [ ] **Step 6: Run identity frontend/backend tests**

Run:

```bash
npx vitest run src/features/identity-applications
npm --prefix backend test -- --runInBand tests/identity-application-media-api.test.ts tests/identity-application-media.service.test.ts tests/identity-application-media.repository.test.ts tests/identity-preview-comparison.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit sensitive client upload integration**

```bash
git add backend/package.json backend/package-lock.json backend/src/middlewares/identity-media-bundle.middleware.ts backend/src/routes/identity-application-media.routes.ts backend/src/controllers/identity-application-media.controller.ts backend/src/api/openapi.ts backend/tests/identity-application-media-api.test.ts src/features/identity-applications
git commit -m "feat(identity): upload client-generated media previews"
```

---

### Task 11: Verify the final integrated local state and visual quality

**Files:**
- Create: `docs/qa/2026-09-12-image-upload-compression.md`
- Modify only if failures prove a directly related defect: files already listed in Tasks 1-10

**Interfaces:**
- Consumes: all earlier tasks on final integrated local `main`.
- Produces: exact local test/build/visual evidence for the release SHA.

- [ ] **Step 1: Reinstall exact dependencies in the release worktree**

Run:

```bash
npm ci
npm --prefix backend ci
```

Expected: both dependency trees match their lockfiles; do not symlink another worktree’s `node_modules`.

- [ ] **Step 2: Run all static and frontend gates**

Run:

```bash
npm run verify:production-images
npm test
npm run lint
npm run verify:production-build
```

Expected: all PASS; the production build includes the image gate and bundle audit.

- [ ] **Step 3: Run all backend gates**

Run:

```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend run prisma:generate
npm --prefix backend exec prisma validate -- --schema prisma/schema.prisma
node --test scripts/aws-staging-application-lib.test.mjs deploy/staging/release-publication-contract.test.mjs deploy/staging/runtime-contract.test.mjs
```

Expected: all PASS. Do not describe the backend as passing if Jest is unavailable or TypeScript cannot resolve installed dependencies.

- [ ] **Step 4: Run isolated browser acceptance away from 5180**

Start the formal runtime on an unused frontend/API port set, prove listener PID/cwd/branch/proxy, then verify mobile and desktop uploads for avatar, IM, Social, carousel, official notice, shop presentation, service cover, and identity bundle. Confirm request payload bytes are smaller where optimization applies, returned MIME/dimensions match server evidence, sensitive original URLs remain private, and there are no visible distortions, Alpha halos, console errors, or unexpected main-thread stalls.

- [ ] **Step 5: Record exact evidence and clean generated runtime files**

Write `docs/qa/2026-09-12-image-upload-compression.md` with the exact Git SHA, commands/results, measured input/output sizes, SSIM floors, tested routes/viewports, request/response metadata, sensitive-original isolation, and remaining credential-gated acceptance. Keep comparison images and AWS evidence only under ignored `outputs/`.

- [ ] **Step 6: Commit verification evidence and verify a clean tree**

```bash
git add docs/qa/2026-09-12-image-upload-compression.md
git commit -m "docs(images): record compression acceptance"
git diff --check
git status --porcelain=v1
```

Expected: `git diff --check` prints nothing and status is empty.

---

### Task 12: Merge local main, complete 5180 acceptance, and clean safe local branches

**Files:**
- Runtime evidence only under ignored local `outputs/`.
- No remote files or environments are accessed or modified.

**Interfaces:**
- Consumes: clean, fully verified feature branch.
- Produces: exact local-main integration, final 5180 evidence, and removal of only the now-merged feature branch or provably obsolete local artifacts.

- [ ] **Step 1: Re-audit branch and worktree ownership before integration**

Run:

```bash
git status --porcelain=v1
git worktree list --porcelain
git rev-parse codex/image-compression-release-gates
git rev-parse main
git merge-base --is-ancestor main codex/image-compression-release-gates
```

Expected: feature worktree clean and local `main` is an ancestor. If local `main` advanced, merge local `main` into the feature branch, resolve only in-scope conflicts, and rerun Tasks 11.2-11.3 before continuing. Do not fetch or contact any remote.

- [ ] **Step 2: Fast-forward local main**

Run:

```bash
git switch main
git merge --ff-only codex/image-compression-release-gates
git rev-parse HEAD
```

Expected: local `main` advances to the already verified feature SHA without a new merge commit. If fast-forward fails, return to the feature branch, merge current local `main`, rerun integrated tests, and then retry.

- [ ] **Step 3: Re-run final integrated gates on local main**

Run:

```bash
npm run verify:production-images
npm test
npm run lint
npm run verify:production-build
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: all PASS on the exact local-main SHA.

- [ ] **Step 4: Prove the 5180 runtime worktree is safe, then load exact local main**

Run:

```bash
git -C "/Users/eason/Documents/New project/.worktrees/main-runtime-5180" status --porcelain=v1
git -C "/Users/eason/Documents/New project/.worktrees/main-runtime-5180" switch --detach "$(git rev-parse main)"
git -C "/Users/eason/Documents/New project/.worktrees/main-runtime-5180" rev-parse HEAD
```

Expected: runtime worktree is clean before switching and its detached HEAD equals local `main` afterward. If it is dirty, stop rather than overwrite any file.

- [ ] **Step 5: Restart only the verified 5180 runtime processes and perform final acceptance**

Identify listener PIDs for `5180/3000/3001/3002`, prove each process cwd belongs to `main-runtime-5180`, stop only those PIDs, and restart with the repository’s formal runtime command. Verify `/api/v1/health`, all three `/api/v1/ready` endpoints, user/technician/merchant/operations portals, representative static images, and the client-compression/server-validation upload flows. Do not enter credentials unless separately authorized; record any credential-gated checks as pending rather than guessing.

- [ ] **Step 6: Remove only the merged development branch**

Run:

```bash
git merge-base --is-ancestor codex/image-compression-release-gates main
git branch -d codex/image-compression-release-gates
git worktree prune --dry-run
```

Expected: ancestry succeeds and the branch deletes normally. Do not delete the dirty `staging-release-cc999f09` worktree, `local-qa-coordinator`, `main-runtime-5180`, or any branch/worktree with unique commits or uncommitted files.

- [ ] **Step 7: Report local completion and explicit remote non-actions**

Report implementation, schema/API changes, test results, feature commits, local-main SHA, 5180 acceptance, remaining issues, safe cleanup, and actual elapsed time. State explicitly that git push was not executed and staging/production/remote environments were not modified.
