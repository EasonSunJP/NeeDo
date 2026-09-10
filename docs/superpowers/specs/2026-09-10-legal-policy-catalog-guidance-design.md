# Legal Policy Catalog And Guided Editing Design

## Goal

Make the operations policy catalog complete enough for NeeDo's current customer,
merchant, technician, Affiliate, eKYC, booking, NDP, and Social flows, while making
the editor understandable to an operator who does not know route or slug terminology.

## Product boundary

- Keep the existing `LegalDocument`, locale draft, immutable release, RBAC, and audit
  model. This slice does not add another policy store or a browser fallback.
- Import the already-approved five-language Terms of Use and Personal Information
  Protection Policy through the guarded system-settings backfill.
- Keep the existing merchant and Affiliate agreements as published contract sources.
- Add catalog entries for technician registration, eKYC consent, cancellation/refund,
  NDP, community content, and the Specified Commercial Transactions disclosure.
- New entries without reviewed text start disabled and unpublished. Operations can
  prepare each locale as a draft and publish it through the existing workflow.
- This slice adds discovery and publication metadata. It does not create new contract
  acceptance evidence for technician or eKYC submissions.

## Catalog

| Slug | Operator-facing name | Related surface | Initial state |
|---|---|---|---|
| `terms-of-use` | NeeDo Terms of Use | registration, settings, footer | existing published source |
| `privacy-policy` | NeeDo Personal Information Protection Policy | registration, settings, eKYC, footer | existing published source |
| `merchant-agreement` | NeeDo Merchant Service Rules and Agreement | merchant application | existing published source |
| `technician-agreement` | NeeDo Technician Service Provider Agreement | technician application | disabled, unpublished |
| `ekyc-consent` | NeeDo eKYC Consent and Identity Data Handling Notice | eKYC | disabled, unpublished |
| `affiliate-agreement` | NeeDo Affiliate Marketing Rules and Agreement | Affiliate activation | existing published source |
| `cancellation-refund-policy` | NeeDo Cancellation and Refund Policy | checkout, order detail | disabled, unpublished |
| `ndp-rules` | NeeDo NDP Rules | wallet, checkout, withdrawal | disabled, unpublished |
| `community-guidelines` | NeeDo Community and Content Guidelines | Social composition and reporting | disabled, unpublished |
| `specified-commercial-transactions-disclosure` | Disclosure under the Specified Commercial Transactions Act | paid service purchase and footer | disabled, unpublished |

## Guided editor

The legal tab opens with one compact workflow diagram:

```text
Choose a document -> Confirm where users see it -> Write each language -> Save draft -> Publish
```

The create panel begins with a recommended document-type selector. Selecting a type
fills its stable slug, name, internal route, and display locations. The operator can
still choose a custom document, but technical fields are grouped as advanced details.

Every field explains one job:

- Document name: internal catalog label; not the localized public title.
- Slug: stable API identifier, lowercase letters/numbers/hyphens, never translated.
- Internal path: an existing NeeDo route beginning with `/`; it is not an external URL.
- Display locations: semantic consumers that decide where links or consent prompts
  belong; multiple locations may be selected.
- Link enabled: only controls visibility; it does not publish missing locale content.

Known internal routes and display locations are selectable rather than requiring
comma-separated memory. An inline example shows how a route becomes a browser URL,
without hard-coding a deployment domain.

## Safety and error handling

- The frontend only submits schemas already accepted by the formal API.
- Unknown existing display-location codes remain visible and are preserved unless the
  operator explicitly removes them.
- Template selection never overwrites an existing document; it only fills the local
  create form.
- New legal entries are disabled until reviewed text is published.
- Backfill remains local/non-production guarded, idempotent, conflict-detecting, and
  never overwrites a differing release.

## Legal calibration

The catalog scope follows current Japanese official guidance: the Personal Information
Protection Commission requires specific purposes and clear consent for relevant
third-party provision; the Consumer Affairs Agency requires visible online-sales
disclosures and clear cancellation conditions; the Financial Services Agency explains
that prepaid instruments can require dedicated statutory disclosures. Exact corporate,
payment, eKYC-provider, and refund facts must be reviewed by NeeDo legal/operations
before enabling the corresponding documents.

## Verification

- Unit-test the catalog inventory, initial states, route metadata, and five-language
  terms/privacy sources.
- Unit-test template selection and recommended routes/display locations.
- Component-test the workflow illustration, field guidance, presets, and non-comma
  display-location controls.
- Run frontend lint/build and backend targeted tests/lint/build.
- If a verified local database configuration is available, run the guarded backfill
  and system-settings checker; otherwise report that environment gate explicitly.
