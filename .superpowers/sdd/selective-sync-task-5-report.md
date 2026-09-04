# Selective account sync Task 5 — importer-capable Staging release

## Result

- Deployment revision: `a9dfcbe2a4c2e2dfd9cf3862273f471f95761e0f`.
- Package: SHA-256 `a5f809a9d7a59e0f732a1bef597b7970304ad5eb340abac362c102a94e038148`,
  104,149,416 bytes. The locally calculated digest and size matched package
  evidence before deployment.
- Target identity was revalidated as account `430611185505` in
  `ap-southeast-2` using the approved staging profile.
- The immutable release upload, pre-migration snapshot, and bounded SSM
  deployment all completed successfully. Deployment evidence records the
  exact revision and a completed pre-migration snapshot.
- No account-sync, seed, DNS, secret, or database-configuration action was
  performed.

## HTTPS activation and public acceptance

- The host confirmed the exact active release and existing certificate before
  the current release's `nginx-https.conf` was installed.
- Only the `web` service was recreated with `--no-deps --force-recreate
  --wait`; it became healthy.
- `https://staging.needo.life/api/v1/ready` returned HTTP 200 with `code:0`.
- The HTTP readiness URL returned HTTP 301 to its HTTPS equivalent.
- `POST /api/v1/auth/register` and
  `POST /api/v1/auth/register/verify` each returned `40313`
  (`error.auth.registration_disabled`).
- A bounded read-only database count confirmed exactly one undeleted user.

## Local verification

- Runtime/application/account-sync Node contracts: 26/26 passed.
- Backend build and lint passed.
- Formal production build and bundle audit passed: 8 HTML entries and 41
  assets. Existing Vite chunk warnings remained warnings only.
- The worktree was clean before packaging and deployment.

## Scope boundary

Task 6 and every account synchronization/import command remain unexecuted.
This report intentionally excludes configuration values, credentials, and
SSM command output.
