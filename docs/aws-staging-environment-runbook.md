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
  Its executable resolves through `/usr/local/bin/session-manager-plugin`.
- AWS CLI v2 `aws login` created the named temporary profile
  `needo-staging-bootstrap`; STS identified account `430611185505` and an
  assumed `AccountFullAccessRole` session.
- The personal project's AWS-managed service control policy denies Tokyo
  regional EC2 discovery. Sydney EC2 discovery and CloudFormation validation
  succeed. Do not retry Tokyo or attempt to bypass that policy in the personal
  account.
- A later company account needs a new exact account-ID/role preflight; this
  personal-account evidence is not transferable proof.
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

Each command resolves the named profile once with AWS CLI v2
`configure export-credentials --format process`, keeps that one temporary
credential tuple only in process memory, and uses it for preflight and every
subsequent read or mutation in that invocation. Inherited credential, profile,
config-file, metadata, and endpoint variables are neutralized, and configured
service endpoints are ignored. The tuple is never logged, returned, or
persisted. If it expires, restart the whole command and repeat preflight; do not
mix credential sessions within an invocation.

Do not use long-lived access keys, an SSH key, or secrets pasted into the CLI.
The CLI profile must be named, temporary, and not `default`. If the preflight
reveals a forbidden caller/source, missing authority, an unexpected account,
unsupported AWS configuration, or a hostname/DNS conflict, stop and correct
the approved configuration before retrying.

## Operator command sequence

All five command invocations use the same seven flags. Substitute only the
angle-bracketed operator values. `staging.needo.life` is the approved staging
hostname. The personal live run uses `--region ap-southeast-2`.

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

Only after a successful preflight and explicit confirmation that the stop gates
are satisfied, deploy the environment. This is an initial-creation gate: the
fresh in-process preflight must report exactly `ABSENT`. A stable same-name
stack may be reported by preflight for diagnostics, but it stops this deploy
before any mutation. Updating an existing stack requires a separate
exact-identity update review and microstep.

Deployment submits the exact in-memory template bytes to atomic
`cloudformation create-stack`, including server-side `ExpectedRegion` and
`ExpectedAccountId` rules. `AlreadyExists` is a hard stop: the gate never falls
back to update behavior. The returned full StackId is validated and is the only
identifier used for the waiter, stack description, and resource listing.

```bash
npm run aws:staging:deploy -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

Bootstrap the host twice. The second invocation is the required idempotency
check; inspect its bounded SSM result rather than substituting SSH access.
Before either invocation's first waiter or command, the gate repeats the fresh
account/region preflight, validates the full StackId, tags, resource/output
bindings, instance/data-volume attachment, exact SSM document content/version,
and exact CloudWatch Agent parameter content/version. It passes those immutable
versions to Run Command; any drift stops with zero waiter and zero command.

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
