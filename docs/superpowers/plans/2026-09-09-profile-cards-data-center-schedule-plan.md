# Profile cards, data center, and schedule implementation plan

1. Add failing tests for wallet-summary rendering, merchant inapplicable metrics, technician defaults and split metric row, and the restored privacy switch.
2. Add failing tests for theme-token chart styling and a navigation-aligned data-center action without `StickyBottomBar`.
3. Add failing resource/route tests proving an unaffiliated technician reaches the formal schedule workspace.
4. Implement the smallest production changes against existing APIs and shared UI components.
5. Run focused tests, lint, build/typecheck, and broader relevant tests; inspect the final diff and commit once on the temp branch.
