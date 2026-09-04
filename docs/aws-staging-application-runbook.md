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

## Evidence boundary

`application-package.json`, `application-deployment.json`, and the final
acceptance file may contain only identifiers, counts, timestamps, statuses, and
digests. They must not contain an email address, password, token, secret JSON,
database URL, AWS temporary credential, SSM output body, or application log.
