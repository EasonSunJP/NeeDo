# Version publication timeline

Local implementation only. This change does not authorize or perform a deployment.

The application packager writes `release-notes.json` from the exact source revision into the
immutable, hashed archive. It requires `backend/dist/cli/record-release.js`. The application,
migration and deployment hook are integrated in the local repository. No archive is uploaded
and no deployment runs as part of these checks.

The existing deployment script creates a publication receipt only after all three readiness
checks and the active-release switch. `publishedAt` is that instant in UTC, never a Git commit
or build timestamp. The private backend CLI validates the receipt and deployment environment,
computes changes since the prior deployed revision, and atomically persists the immutable
record with its audit event. The first deployment can recover an old revision boundary from
the packaged Git ancestry even if the old archive predates manifests.

A UUID identifies one deployment attempt. The receipt is retained inside its release directory
as `publication.*.json`. If persistence fails after traffic has switched, deployment exits with
an error but does not roll back a healthy active application: the write may have committed.
Retry only the internal CLI with the original receipt and the original UUID/time, using the
same Compose project, env file and release configuration. Identical replay returns the original
record without a second audit. Reusing a UUID with changed evidence is rejected. Re-running the
entire deployment is a new deployment event, not a persistence retry.

The application list endpoint is restricted to a platform identity with dashboard-read
permission and returns records for the server's configured DEPLOY_ENV only. Operators with
`backoffice:releases:write` may add a record or correct a manual/backfilled record through the
protected backoffice API. Corrections require a reason and optimistic version, preserve the
original publication evidence, and append revision and audit records. Automatic deployment
records cannot be edited. There is no deletion or comment endpoint. The current hook targets
this repository's existing staging flow; production release integration has not been executed
or validated.

Local checks: `bash -n deploy/staging/deploy-release.sh` and
`node --test scripts/release-notes.test.mjs deploy/staging/release-publication-contract.test.mjs deploy/staging/runtime-contract.test.mjs`.
After building the backend, `backend/scripts/check-release-publications.ts` also validates
the real Git manifest through the compiled CLI against a guarded local database: original
publication time, receipt replay, one audit and environment rejection. It cleans up its own
disposable test records.
