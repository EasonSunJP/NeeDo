# Live dashboard viewport final fix

## Scope and cause

The SVG renders `translate(x y) scale(scale)`, so a point is transformed to
`scale * point + pan`. The former symmetric pan bounds assumed a different
origin. On Tokyo's real Ogasawara anchor, the first zoom moved y=726.49 to
889.735, outside the 800-unit viewport. At country 4x, positive diagonal pan
could move all 47 anchors outside the viewport.

The standard bounds are now `(1-scale)*(origin+dimension)` through
`(1-scale)*origin` on each axis. They include nonzero viewBox origins and
collapse exactly to identity at 1x. Zoom retains its existing screen-anchor
formula and clamps only when needed.

Investigation also established that viewBox bounds alone permit empty ocean
corners in the real country map. With the coordinator's explicit scope
extension, zoom and pan now accept optional content points. If the bounded
candidate contains no valid point, the smallest displacement brings a real
anchor into the viewport with a one-unit interior margin where feasible.
Already visible content leaves the candidate unchanged. Non-finite and
out-of-viewBox points are ignored; absent valid points use the ordinary bounds.
JapanRegionMap supplies memoized non-null asset label points to zoom, drag
preview, and drag completion. Scale and input objects are preserved.

## RED evidence

Before changing production code:

`npx vitest run src/features/live-dashboard/mapViewport.test.ts src/features/live-dashboard/JapanRegionMap.test.tsx`

- 6 failed / 15 passed: updated SVG-origin pan expectations, real Ogasawara
  anchor in helper and component, all-country-anchor disappearance,
  transformed-canvas coverage, and four-edge region reachability.
- The component independently reproduced y=889.735 versus expected 726.49.
- The country test reproduced zero visible anchors.

After the ordinary origin fix, the remaining country empty-ocean regression
prompted separate RED coverage before implementing content constraints:

- mapViewport: 2 failed / 8 passed, covering maximum country diagonal pan and
  content visibility through zoom levels and pan extremes.
- JapanRegionMap `-t 'maximum diagonal'`: 1 failed / 13 skipped; a real pointer
  sequence after six zoom clicks produced no visible country anchor.

## GREEN evidence

- Focused helper and component suite: 2 files, 24 tests passed.
- `npm run lint`: passed (TypeScript build check).
- `git diff --check` for all four implementation/test files: passed.
- Independent Node property probe loaded all 48 committed map assets:
  8,400 pan probes, 336 zoom probes, and all 1,965 anchor reachability probes
  passed. Pan deltas sampled -1,000,000, -37, 0, 37, 1,000,000 independently
  on each axis at all seven scale levels. Every pan/zoom retained visible
  content, finite coordinates, and the requested scale. Each anchor was
  individually brought into the viewport at 4x. Node emitted only its standard
  experimental TypeScript stripping warning.
- Unit properties additionally cover 525 no-content pan cases across country,
  Tokyo, and an offset-origin viewBox, plus invalid points, deterministic
  results, immutability, exact identity, and Ogasawara zoom-in/out continuity.

## Boundaries

This commit changes only mapViewport, JapanRegionMap, their focused tests, and
this report. No RegionNavigator, progress, general docs, API, data, migration,
push, deployment, or authenticated browser acceptance is included. The content
constraint uses the existing geometry-derived region label anchors; assets
without valid anchors retain standard viewBox behavior.

## Continuous gesture follow-up

Review identified that a safe displayed viewport must not become the next
pointer event's accumulated intent: disconnected islands create disjoint
regions of allowable display translations. Small moves could repeatedly snap
to the same boundary and never reach an island even though a single large
delta could reach it.

Before this follow-up implementation, three pure sequence regressions and
three real pointer sequence integrations failed. Country Okinawa remained at
y=1251.4 beyond height 1200; Okinawa municipalities 47357/47358 remained at
x=1396.8/1421.32 beyond width 1000. All tests used deltas at most 10 units per
axis and verified real content remained visible on every intermediate frame.

`panMapGesture` now returns separate standard-clamped intent and safe display
viewports. The drag ref accumulates intent independently and commits only the
safe display/label viewport on pointerup. Reset and zoom clear the gesture and
pending frame; the existing scope cleanup also clears it. The pure regressions
now exercise this exported gesture helper, while pointer integrations retain
the same events and assertions as their failing runs.

Final checks for this follow-up:

- mapViewport, JapanRegionMap, mapLabelLayout, liveDashboardResponsive, and
  LiveDashboardShell: 5 files / 108 tests passed. This includes actual geometry
  movement, every-frame content visibility, final target-island reachability,
  deferred label calculations, zero drag fetches, and reset/zoom cancellation.
- Independent continuous probe across all 48 assets: 153,065 safe display
  frames, 1,965 reachable targets, and 384 direction probes passed.
- TypeScript lint and diff whitespace checks passed.
- Production build passed with the existing Zod annotation, mixed static /
  dynamic import, and large-chunk warnings. Legacy auth variables were cleared
  only in the build subprocess.
