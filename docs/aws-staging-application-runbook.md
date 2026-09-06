# NeeDo staging application runbook

This runbook applies only to AWS account `430611185505`, region `ap-southeast-2`,
stack `needo-staging-infrastructure`, and host `staging.needo.life`. It does not
authorize changes to the apex domain, `www`, nameservers, production data, or a
different AWS account.

## Safety boundaries

- Package only a clean, full Git revision.
- Keep secret values outside Git, terminal output, evidence, and chat.
- Keep `ALLOW_TEST_LOGIN`, `ALLOW_FORMAL_TEST_SEED`, and
  `ALLOW_SIMULATION_SEED` set to `false`.
- Never run `prisma db seed` or the general Prisma seed in staging.
- Expose only ports 80 and 443. MySQL, Redis, and all Node services stay on the
  Compose network.
- Take and complete an EBS snapshot before the first migration command.
- Switch `/srv/needo/current` only after all three readiness endpoints pass.

## Google authentication capability

The initial personal-account Staging release uses password authentication and
explicitly disables Google authentication:

```text
AUTH_GOOGLE_ENABLED=false
VITE_AUTH_GOOGLE_ENABLED=false
GOOGLE_AUTH_CLIENT_ID omitted
```

The backend flag makes every Google login, link, unlink, and recovery entry
point return HTTP `503` with `error.dependency.google_auth_unavailable`. The
frontend build flag hides the Google login surface and prevents Google SDK/API
initialization. Password login, JWT, refresh tokens, RBAC, migrations, audit,
and the guarded administrator bootstrap remain enabled.

To enable Google authentication later, create or select a real Google Web OAuth
client, allow the `https://staging.needo.life` origin and its formal callback,
inject the client ID through the stack-managed Secrets Manager secret, set both
flags to `true`, rebuild an immutable release, deploy it, and verify login,
link, and unlink. Do not put the client ID in Git. EC2, EBS, MySQL, Redis, the
Elastic IP, DNS, and the TLS certificate do not need to be recreated.

## Registration capability

The current immutable Staging release disables public self-registration at both
edges:

```text
AUTH_REGISTRATION_ENABLED=false
VITE_AUTH_REGISTRATION_ENABLED=false
```

Both public registration endpoints return HTTP `403` with
`{ "code": 40313, "message": "error.auth.registration_disabled", "data": null }`
before request validation, OTP delivery, challenge creation, or database writes.
The frontend bundle does not render registration entry or verification panels.

To re-enable registration for one later release, change both immutable values to
`true`, build a new clean revision, deploy that revision, and rerun the
registration flow. EC2, EBS, MySQL, Redis, DNS, and TLS are reused; do not add a
Secrets Manager version for either flag.

## Release sequence

1. Confirm `outputs/aws-staging/environment-acceptance.json` still passes the
   infrastructure verifier and reports no application, migration, seed, DNS, or
   business-data mutation.
2. Commit the application release implementation. Record the resulting full
   revision and confirm `git status --porcelain` is empty.
3. Build a production frontend and backend, then package the release:

   ```sh
   node scripts/aws-staging-package-application.mjs \
     --source-revision FULL_GIT_REVISION \
     --environment-evidence outputs/aws-staging/environment-acceptance.json
   ```

4. Independently compare the archive digest with the `archiveSha256` in
   `outputs/aws-staging/application-package.json`.
5. Create exactly one JSON secret version in the stack-managed application
   secret. Generate every password/token locally with a cryptographic random
   generator, upload by file, verify only the version count, and delete the exact
   owner-only temporary input file.
6. With `NEEDO_AWS_CLI` set to the absolute AWS CLI v2 executable, deploy:

   ```sh
   node scripts/aws-staging-deploy-application.mjs \
     --profile needo-staging-bootstrap \
     --account-id 430611185505 \
     --region ap-southeast-2 \
     --source-revision FULL_GIT_REVISION
   ```

The deployer verifies the caller and live stack outputs, uploads the immutable
archive, verifies S3 metadata/versioning, waits for the encrypted EBS snapshot,
and sends one bounded SSM command. The host verifies the archive digest before
extracting it, writes the secret-derived env file as mode `0600`, starts the
private data services, creates a logical pre-migration backup when an existing
schema is present, runs migrations, runs the guarded administrator bootstrap,
starts all application services, checks readiness, and finally switches the
active release symlink.

## DNS and TLS

On Onamae, add only this record after the Elastic IP HTTP readiness check passes:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | staging | 32.236.134.43 | 300 |

Do not replace `dns1.onamae.com` or `dns2.onamae.com`. Do not change the apex,
`www`, wildcard, MX, TXT, or other existing records. Wait until independent
public resolvers return `32.236.134.43`, issue the HTTP-01 certificate, then
install `deploy/staging/nginx-https.conf` and rehearse `certbot renew --dry-run`.

## Application rollback

For an application-only rollback, select a previously verified compatible
release directory, run its exact Compose file with the root-owned staging env,
verify all readiness endpoints, and atomically switch `/srv/needo/current`.
Never claim a database rollback from an application symlink switch. If a schema
rollback is required, stop and use the pre-migration EBS snapshot and logical
backup through a separately approved restore procedure.

## Selective staging-account synchronization

This is a separately approved, one-way staging operation. It accepts only a
locally SHA-256-verified gzip bundle and an exact deployed revision. It first
checks the accepted environment and application-deployment evidence, the live
assumed role, CloudFormation resource identities, online SSM registration,
active release manifest, and both disabled-registration endpoints. It then
creates an EBS snapshot and a versioned logical backup before starting the
importer.

Run only from a clean release checkout, with an absolute AWS CLI v2 path in
`NEEDO_AWS_CLI`:

```sh
node scripts/aws-staging-sync-test-accounts.mjs \
  --profile needo-staging-bootstrap \
  --account-id 430611185505 \
  --region ap-southeast-2 \
  --bundle /absolute/path/to/account-sync.json.gz \
  --sha256 BUNDLE_SHA256 \
  --source-revision FULL_GIT_REVISION
```

The host takes `/srv/needo/account-sync.lock`, confirms that the current
release manifest is the requested revision, reads the exact versioned transfer
object through a read-only bind mount, and emits only the import summary. The
transfer object and host-local files are cleaned up; the versioned logical
backup, completed snapshot, and redacted mode-`0600`
`outputs/aws-staging/account-sync.json` evidence remain for recovery.

### Account-sync recovery

Recovery is a separately approved outage procedure, not a release rollback.
Stop application writes and preserve the account-sync evidence first. Restore
the matching pre-import logical backup, then verify the importer counts, keyed
digests, orphan checks, registration-disabled responses, and readiness before
allowing writes again. Use the EBS snapshot only if the logical restore cannot
be validated; snapshot restoration has a broader outage and must not be
combined with an unreviewed application or schema change.

## Evidence boundary

`application-package.json`, `application-deployment.json`, and the final
acceptance file may contain only identifiers, counts, timestamps, statuses, and
digests. They must not contain an email address, password, token, secret JSON,
database URL, AWS temporary credential, SSM output body, or application log.

## 2026-09-06 current-main release

The release integrates local main `dc65536a99f6d9d14bc94271eff16e76074d0dd6`
into the existing staging branch. GitHub private main was independently verified
at that revision. The previous staging application was `7d8561dbf48b031bf509b99faa0382fe2b3cf9bb`.

Release reconciliation restores the immutable Google-disabled service guard,
restores standalone PWA floating-header safe-area spacing, and updates existing
test fixtures and maintenance checker inputs for current auth, work-status,
service-location, partner-validity and recall contracts.

Validation: 427 frontend files / 2,939 tests; 711 backend suites / 5,267 tests
passed across 12 serial shards, with 19 suites / 76 environment-gated tests
skipped. Frontend and backend lint/build and the production bundle audit pass
(8 HTML entries / 55 assets). Deployment scripts were verified with their
respective Vitest and Node test runners; process-launch tests passed serially
with a 30-second timeout after a loaded run exceeded the default 5 seconds.

Five additive migrations introduce SOS, administrative regions, technician work
status, affected-order relationships and the UTC attendance activation boundary.
No previously released migration is changed. Initialize only the versioned
Japanese administrative-region reference catalog when its new tables are empty;
do not run the general account/simulation seed. Keep application release,
reference-data initialization, authenticated API smoke and browser acceptance
as separate evidence gates. Immutable package and deployment identifiers are
recorded in ignored `outputs/aws-staging/` evidence files.

The first activation attempt applied all five migrations but could not start
the split APIs because `LIVE_DASHBOARD_REDIS_URL` was absent. The release
configuration now explicitly points all API services at the same authenticated
Redis domain. The release shell enables ERR-trap inheritance so a failure in
`compose_for` reaches application rollback. Rollback restores API and web services with `--no-deps`, so an existing
database does not rerun bootstrap initialization. Regression tests failed before
these corrections and passed afterward. The previous application was restored
before retrying; the five additive migrations remain forward-applied.
