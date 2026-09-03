# AWS Staging Environment-Only Runbook

This runbook is the operator procedure for the approved single-EC2
**environment-only** gate. The personal deployment test uses Sydney
(`ap-southeast-2`); a later company deployment may use Tokyo
(`ap-northeast-1`). Every command requires the exact approved region and never
falls back automatically.

The application deployment instructions in [deployment.md](./deployment.md)
are deliberately deferred until their separate microstep is approved.

## Current facts and stop gates

- The current machine's approved current-user AWS CLI installation is verified
  as AWS CLI v2 `aws-cli/2.36.38` on `arm64`. Earlier notes that said the CLI
  was absent describe the initial state and are superseded by this fact.
- The AWS Session Manager plugin is verified as version `1.2.835.0` on
  `arm64`, installed from the AWS signed and Apple-notarized macOS package.
  This environment-only gate does not invoke it or accept a raw interactive
  shell command; that needs a dedicated hardened Session Manager microstep in
  the later company/application stage.
- AWS CLI v2 `aws login` created the named temporary profile
  `needo-staging-bootstrap`; STS identified account `430611185505` and an
  assumed `AccountFullAccessRole` session.
- The personal project's AWS-managed service control policy denies Tokyo
  regional EC2 discovery. Sydney EC2 discovery and CloudFormation validation
  succeed. Do not retry Tokyo or attempt to bypass that policy in the personal
  account.
- A later company account needs a new exact account-ID/role preflight; this
  personal-account evidence is not transferable proof. The current hardened
  credential resolver is deliberately `login`-only; SSO and named assume-role
  resolution for the later company profile is a separate blocked-until-profile
  security microstep.
- Public DNS was rechecked on 2026-09-04: both the `needo.life` NS query and
  the `staging.needo.life` A query returned `NXDOMAIN`. Public delegation and
  the eventual staging record are therefore not ready.
- Onamae remains responsible for the external registration, nameserver, and
  DNS-zone work. This gate must leave `staging`, apex `needo.life`, and
  `www.needo.life` untouched. In particular, do not use this runbook to make
  an Onamae change or an AWS DNS change.
- A named temporary AWS CLI profile, the intended 12-digit account ID, alert
  email, actual AWS billing currency, and an approved monthly budget amount are
  required operator inputs. Its STS caller must be an `assumed-role` session in
  that exact expected account. Stop if any input or this identity check is
  unknown, unapproved, or inconsistent with the target account.
- The SNS subscription email must be confirmed before CloudWatch/SNS alerts are
  fully active. Until then, infrastructure may exist, but this environment gate
  remains incomplete.

## Access and safety prerequisites

Use only a named temporary profile whose STS caller is an `assumed-role`
session in the exact expected account. Root, IAM-user, federated-user,
environment, and shared-credential-file callers are forbidden. AWS CLI v2
`login` is accepted only when both the access-key and secret-key rows from
`aws configure list --profile <named-temporary-profile>` report exactly
`login`; STS must still pass the exact-account `assumed-role` check. The
least-privilege deploy role must be authorized for scoped CloudFormation
create/describe/list/wait operations (with no automatic update or delete); scoped EC2, VPC, EBS, and Elastic IP
operations; IAM role, instance-profile, and policy operations plus
`iam:PassRole` for the stack role; S3 bucket controls; Secrets Manager create,
describe, and tag; SSM document, parameter, and command operations; Logs,
CloudWatch, and SNS operations; and Budgets create, describe, and update
operations.

Before credential resolution, each command ignores operator `PATH` and checks
only the canonical OS-user locations `~/.local/share/aws-cli/aws` and
`~/.local/bin/aws`, followed by root-owned `/usr/local/bin/aws`, `/usr/bin/aws`,
and `/opt/aws-cli/.../aws` locations. It resolves the selected executable to
one absolute real path, requires trusted ownership plus a
non-group/world-writable ancestor
chain and executable regular file, captures its metadata and SHA-256 digest,
and attests AWS CLI v2 `2.32.0` or newer. It re-stats and re-hashes that exact
real path immediately before every resolver or frozen invocation. A changed
path, owner, mode, parent trust boundary, metadata tuple, or digest is a hard
stop. No machine-specific digest is embedded in the repository, and child
processes never receive `PATH`.

This check detects replacement after capture but cannot establish independent
provenance on an already compromised same-user host. The operator remains
responsible for installing AWS CLI v2 from the approved AWS distribution and
for the integrity of the canonical current-user installation root and private
login-cache contents. The checks detect source replacement and unsafe sharing;
they do not claim protection from an already compromised current-user process
that can rewrite a private file in place.

The wrapper reads the named profile only from the current OS account's
canonical `~/.aws/config`, requires exactly one valid `login_session`, and
copies only that non-secret pointer and the approved region into a private
resolver config. Only the resolver receives the canonical AWS login-cache
directory. Before any resolver spawn, the wrapper captures the canonical HOME
and every ancestor to the filesystem root, requires each directory to be owned
by the current user or root as applicable and not group/world-writable, and
binds every source directory/file to its owner, mode, real path, device, and
inode. The source config must be an owner-matched, non-symlink `0600`
regular file; source login directories must be owner-matched, non-symlink, and
not group/world-writable; every cache entry must be an owner-matched,
non-symlink `0600` regular JSON file. (AWS CLI may create the cache directory as
`0755`; credential contents remain protected by the required `0600` entry
mode.) The full source identity and exact cache-entry set are re-attested
immediately before each of the two resolver spawns; replacement or permission
drift is a hard stop and disposes wrapper state. It runs
`configure export-credentials --format process` once, keeps
the resulting temporary credential tuple only in process memory, and uses it
for preflight and every subsequent read or mutation in that invocation. It
does not copy `credential_process`, SSO/role chains, endpoints, CA bundles, or
any other source-profile/default setting.

Resolver and frozen calls use wrapper-owned `0700` state with `0600` config
and empty credential files, an empty model directory, explicit environment
allowlists, configured endpoints ignored, IMDS disabled, and CLI history
explicitly disabled. Inherited HOME/config/model/history paths, all proxy case
forms, CA/trust variables, profile/default settings, and credential variables
are absent. Frozen calls also lose access to the source login cache. The tuple
is never logged, returned, or written to those files, and the private state is
disposed on success or failure. If the tuple expires, restart the whole command
and repeat preflight; do not mix credential sessions within an invocation.

Do not use long-lived access keys, an SSH key, or secrets pasted into the CLI.
For this personal-stage gate, `sso`, `assume-role`, and `custom-process`
configure-list provider types are rejected before identity or mutation; they
must not reuse personal evidence. The CLI profile must be named, temporary, and
not `default`. If the preflight
reveals a forbidden caller/source, missing authority, an unexpected account,
unsupported AWS configuration, or a hostname/DNS conflict, stop and correct
the approved configuration before retrying.

Do not run raw AWS CLI or Session Manager plugin commands from this runbook.
Executable/version checks occur inside the hardened repository wrapper, and
interactive Session Manager proof is deferred until a dedicated launcher is
designed, tested, and approved.

## Operator command sequence

All five command invocations use the same seven environment flags. Deployment
also requires the exact template SHA-256 and full source revision emitted by
the immediately preceding preflight. Substitute only the angle-bracketed
operator values. `staging.needo.life` is the approved staging hostname. The
personal live run uses `--region ap-southeast-2`.

```bash
npm run aws:staging:preflight -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

Preflight reports `templateSha256` and `sourceRevision` from one clean,
tracked template byte snapshot. Only after a successful preflight and explicit
action-time confirmation of those two exact values and all other stop gates may
the operator deploy the environment. This is an initial-creation gate: the
fresh in-process preflight must report exactly `ABSENT`. A stable same-name
stack may be reported by preflight for diagnostics, but it stops this deploy
before any mutation. Updating an existing stack requires a separate
exact-identity update review and microstep.

Deployment rejects a source-revision or digest mismatch, a dirty tracked
template, or a changed template path/identity before credentials or mutation.
The same immutable in-memory byte string is supplied to both
`validate-template` and atomic `create-stack`; the path is never reread to form
the create request. The request includes server-side `ExpectedRegion` and
`ExpectedAccountId` rules. `AlreadyExists` is a hard stop: the gate never falls
back to update behavior. The returned full StackId is validated and is the only
identifier used for the waiter, stack description, and resource listing.
Before deployment evidence is returned, `describe-addresses` must bind the
stack's exact Elastic IP allocation and association to its exact instance and
public-IP output.

`sourceRevision` identifies the Git origin of this one tracked template; it is
not a claim that unrelated worktree files are clean. Copy the two preflight
values into the deploy command only after human review. Do not use shell command
substitution to turn preflight output into automatic approval.

```bash
npm run aws:staging:deploy -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --template-sha256 <approved-template-sha256> \
  --source-revision <approved-full-source-revision>
```

Bootstrap the host twice. The second invocation is the required idempotency
check; inspect its bounded SSM result rather than substituting SSH access.
Before either invocation's first waiter or `ssm send-command`, the gate repeats
the fresh account/region preflight, validates the full StackId, tags, resource/output
bindings, instance/data-volume attachment, exact SSM document content/version,
and exact CloudWatch Agent parameter content/version. It passes those immutable
versions to Run Command; any drift stops with zero waiter and zero
`ssm send-command`.

```bash
npm run aws:staging:bootstrap-host -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>

npm run aws:staging:bootstrap-host -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

Finally, run environment acceptance with the same values:

```bash
npm run aws:staging:verify -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

A successful environment-only acceptance is not permission to deploy the
application or to change DNS. Keep Compose, Prisma migration, seed, release
artifact, TLS, and Onamae work in their separately approved follow-up steps.

## Failure recovery and rollback boundaries

- **Preflight or validation failure:** no AWS mutation has occurred. Correct
  the approved permission, configuration, or template issue and retry.
- **CloudFormation create failure before useful resources exist:** inspect and
  preserve stack-event evidence. Request explicit approval before deleting a
  failed stack; never turn deletion into an automatic cleanup action.
- **`AlreadyExists`:** stop. Do not reuse this create-only gate to update the
  existing stack, even if its name looks expected. A separately approved
  exact-identity update microstep is required.
- **Host bootstrap failure:** do not format another device. Inspect the SSM
  invocation and EBS volume attachment, fix the cause forward, then rerun the
  idempotent bootstrap command.
- **Acceptance failure:** do not deploy the application and do not change DNS.
  Preserve the bounded evidence and repair the failed infrastructure condition
  within the approved scope.
- **Stack rollback or removal:** retained buckets, their retained TLS-only
  bucket policies, and the application secret remain. Data-volume deletion
  creates a snapshot. Any material deletion needs separate explicit user
  approval.
- **Budget or SNS email remains unconfirmed:** infrastructure can exist, but
  the environment gate is incomplete; do not represent alerting as active.

Never use `aws cloudformation delete-stack`, EBS deletion, snapshot deletion,
bucket emptying, or secret force deletion as an automatic recovery command.
