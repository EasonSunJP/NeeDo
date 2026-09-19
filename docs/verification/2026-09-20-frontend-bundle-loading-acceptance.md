# Frontend bundle loading acceptance (2026-09-20)

## Scope

- Restore route-level loading for user and unified settings pages.
- Move settings-only and social-only translation entries behind their route boundaries.
- Remove the mixed static/dynamic import of `SocialProfilePage`.
- Preserve the existing production warning threshold and tighten bundle audit budgets.

No database schema, migration, backend API, or response contract changed.

## Entry-load diagnosis

The baseline formal build produced these eagerly referenced entry assets:

| Asset | Baseline raw bytes | Baseline gzip bytes | Entry impact |
| --- | ---: | ---: | --- |
| `main` | 3,702,529 | 997,298 | module-preloaded by every HTML entry |
| `i18n` | 3,700,766 | 1,235,542 | module-preloaded by every HTML entry |

The settings modules were statically imported by `App.tsx`, and their translations remained in the core translation map. The social profile module was both statically and dynamically imported, so Rollup could not keep it exclusively in the social route boundary.

After the change:

| Asset | Final raw bytes | Final gzip bytes | Change in raw bytes |
| --- | ---: | ---: | ---: |
| `main` | 3,565,616 | 967,954 | -136,913 |
| `i18n` | 3,582,930 | 1,208,696 | -117,836 |

The build no longer emits the chunk-size warning at the existing 3,600 kB threshold. The bundle audit budgets were tightened to 3,590,000 bytes for `main` and 3,600,000 bytes for `i18n`.

All eight production HTML entries were audited to reject eager references to `settings-i18n`, `social-i18n`, `UserSettingsPages`, or `UnifiedSettingsPages`. A browser run against the formal preview on port 5190 confirmed the user login page rendered without console errors and did not request those route-deferred assets.

## Zod / Rollup warning boundary

Two build warnings remain. Both originate from installed Zod 4.5.4 source files under `node_modules/zod/v4/core/`:

- `util.js:330`: prose in an ordinary line comment contains the token `@__PURE__`.
- `regexes.js:70`: prose in a documentation comment contains the token `@__PURE__`.

Rollup 4.60.1 treats those tokens as misplaced annotations and removes only the comments. The warnings do not originate in NeeDo source and do not indicate that application code was omitted. They are intentionally left visible: no warning suppression, dependency patch, `node_modules` edit, or warning-limit increase was introduced.

## Verification

- Focused regression suite: 67 tests passed.
- Full frontend suite on final local `main`: 585 files / 3,976 tests passed in four resource-isolated shards. Before the latest `main` integration, the first unsharded branch run had one unrelated 5-second IM test timeout under full-suite contention; that file then passed independently (27 tests), and every shard passed.
- Production bundle audit: 8 HTML entries and 79 assets passed.
- TypeScript project check: passed.
- i18n audit and quality report generation: passed; all 15,387 registered entries include all four target languages.
- Formal preview on port 5190: login page rendered, zero console errors, route-deferred settings/social assets absent from the observed entry requests.
