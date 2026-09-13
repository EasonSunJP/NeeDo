# Staging Immutable Frontend Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep hash-addressed frontend chunks from prior staging releases available so an already-open client can lazy-load the technician portal after a deployment.

**Architecture:** Continue replacing HTML and the current application image on each release, but publish `dist/assets` into an append-only host directory before the web container is recreated. Bind that directory read-only at `/usr/share/nginx/html/assets`, serve direct and nested-route asset requests as immutable, and fail a deployment if a reused hash filename has different bytes.

**Tech Stack:** Bash, Docker Compose, Nginx 1.27, Node.js built-in test runner, Vite production bundles.

## Global Constraints

- Local development and verification only; do not push, deploy, trigger remote CI/CD, or modify staging/production.
- Do not use, stop, restart, or kill port 5180 before the local `main` merge.
- Preserve Vite lazy loading and all authentication, identity, API, database, and RBAC contracts.
- Add no mock, placeholder, fake API, schema change, migration, or runtime image.

---

### Task 1: Reproduce the release-boundary asset loss

**Files:**
- Modify: `deploy/staging/runtime-contract.test.mjs`
- Create: `deploy/staging/publish-frontend-assets.sh`

**Interfaces:**
- Consumes: a release-local `dist/assets` directory and a host-owned destination directory.
- Produces: `publish-frontend-assets.sh SOURCE_DIR DESTINATION_DIR`, which copies new hash-addressed files, preserves prior files, and rejects a same-name/different-content collision.

- [ ] **Step 1: Write the failing test**

Add a Node test that creates two temporary `dist/assets` trees containing `TechnicianPortalPage-old.js` and `TechnicianPortalPage-new.js`, invokes the publisher for both releases, and asserts that both files remain byte-identical. Add a collision case that reuses a filename with different bytes and expects exit status `65`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test deploy/staging/runtime-contract.test.mjs`

Expected: FAIL because `publish-frontend-assets.sh` does not exist and the compose/release contracts do not publish durable frontend assets.

- [ ] **Step 3: Write minimal implementation**

Create `publish-frontend-assets.sh` with strict Bash mode, exact two-argument validation, recursive regular-file publication, append-only collision checks using `cmp`, destination-path symlink rejection, and mode `0644`. Update `deploy-release.sh` to invoke the publisher before the web container is recreated. Bind the host directory read-only in `docker-compose.yml`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test deploy/staging/runtime-contract.test.mjs deploy/staging/release-publication-contract.test.mjs`

Expected: all staging contract tests PASS.

### Task 2: Lock cache behavior to the versioned asset contract

**Files:**
- Modify: `deploy/staging/nginx-http.conf`
- Modify: `deploy/staging/nginx-https.conf`
- Modify: `deploy/staging/runtime-contract.test.mjs`

**Interfaces:**
- Consumes: `/assets/<content-hashed-name>` and legacy nested portal asset URLs.
- Produces: `Cache-Control: public, max-age=31536000, immutable` for assets while preserving `no-store, no-cache, must-revalidate, max-age=0` for HTML.

- [ ] **Step 1: Write the failing test**

Assert both Nginx configs contain an exact `/assets/` immutable-cache location and keep the nested-route asset compatibility location immutable as well.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test deploy/staging/runtime-contract.test.mjs`

Expected: FAIL because current Nginx configs do not attach immutable cache headers to versioned assets.

- [ ] **Step 3: Write minimal implementation**

Add an exact `location ^~ /assets/` block and the same cache header to the existing nested portal asset rewrite in both HTTP and HTTPS configs. Keep missing assets as `404`; never fall back to HTML.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test deploy/staging/runtime-contract.test.mjs deploy/staging/release-publication-contract.test.mjs`

Expected: all staging contract tests PASS.

### Task 3: Verify, document, commit, integrate, and accept

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/superpowers/plans/2026-09-13-staging-immutable-frontend-assets.md`

**Interfaces:**
- Consumes: the completed release/runtime change.
- Produces: documented retention and cleanup boundary plus local Git integration evidence.

- [ ] **Step 1: Document the operational contract**

Document that HTML is replaced/no-store, hash assets are append-only under `/srv/needo/frontend-assets`, collisions fail closed, and deletion requires retained-release reference and access-log proof.

- [ ] **Step 2: Run complete branch verification**

Run: `bash -n deploy/staging/deploy-release.sh deploy/staging/publish-frontend-assets.sh`; `node --test deploy/staging/runtime-contract.test.mjs deploy/staging/release-publication-contract.test.mjs`; `npm test`; `npm run lint`; `npm run verify:production-build`; local dual-release publisher simulation; and an HTTP/browser smoke on a non-5180 port.

Expected: all commands exit `0`; the old technician chunk remains fetchable after the second simulated publication.

- [ ] **Step 3: Commit and merge local main**

Commit only the scoped files on `codex/fix-technician-chunk-recovery-20260913`, merge that branch into local `main`, and rerun the relevant tests on the integrated commit.

- [ ] **Step 4: Verify local main on 5180 and clean up**

Prove the 5180 listener PID/cwd/branch before changing it, then use local `main` for final HTTP/browser verification. Do not remove the host-managed Codex worktree; delete only the merged task branch when safe.
