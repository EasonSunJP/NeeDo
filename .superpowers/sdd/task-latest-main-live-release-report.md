# Latest-main Staging release report

## Result

- Active code revision: `d5c494a401d622288c92239033f9581f81aff66e`.
- Immutable application package: SHA-256
  `466bd4fa2b38798d32a7cf445714ab2de1f9a80524612c0833164824500d4e9e`,
  104,149,447 bytes; the locally calculated digest and size matched package
  evidence before deployment.
- Target identity was revalidated as account `430611185505` in
  `ap-southeast-2` using the approved staging profile.
- Upload, completed pre-migration snapshot, and bounded deployment completed
  successfully. Deployment evidence binds the exact release revision.

## HTTPS and release acceptance

- The host confirmed the exact current release and existing certificate before
  installing that release's `nginx-https.conf`.
- Only `web` was recreated with `--no-deps --force-recreate --wait`; it became
  healthy.
- HTTPS `/api/v1/ready` returned HTTP 200 with `code:0`; HTTP redirected with
  301 to HTTPS.
- Both registration endpoints returned `40313`
  (`error.auth.registration_disabled`).
- A bounded read-only query confirmed exactly one undeleted user.

## Scope boundary

- No account synchronization, seed, DNS change, credential change, or main
  branch mutation was performed.
- No sensitive configuration, account data, or SSM output is included here.
