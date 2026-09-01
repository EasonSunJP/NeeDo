# Exchange Detail Common Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic shared close control to every Exchange demand/intelligence detail state while preserving the existing history-based back action.

**Architecture:** Keep navigation ownership inside `ExchangePostDetailPage`. Reuse `exchangeBasePath(context)` for a new close handler and pass it through the existing `MobileFullscreenHeader.onClose` contract in both the shared state shell and the loaded detail header; no shared component, route, API, or persistence change is required.

**Tech Stack:** React 18, TypeScript, React Router, Vitest, jsdom, Vite, NeeDo shared mobile header components.

## Global Constraints

- Make one independently runnable and reversible frontend microstep.
- Preserve the restored high-fidelity Exchange detail composition and existing back, translation, like, share, Request claim, and received-claim behavior.
- Reuse `MobileFullscreenHeader`; do not create a page-local close button.
- Close destinations are exactly `/needo`, `/merchant/needo`, and `/technician/needo` with `replace: true`.
- Normal, loading, invalid-link, and read-error states must expose the same close action.
- Do not add mock data, localStorage, fake APIs, backend changes, routes, or new user-visible copy.
- Verify at an iPhone 14 Pro Max-like width in the real local browser before completion.

---

### Task 1: Add and verify deterministic Exchange detail close navigation

**Files:**

- Modify: `src/features/exchange/ExchangePostDetailPage.test.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`

**Interfaces:**

- Consumes: `exchangeBasePath(context: MessageCenterContext): string`, `MobileFullscreenHeader.onClose?: () => void`, and React Router `navigate(to, { replace: true })`.
- Produces: a page-local `closeDetail(): void` handler used by every Exchange detail header state.

- [ ] **Step 1: Extend the router test harness and write failing loaded-detail close tests**

Import the context type and let the harness mount the correct portal route plus its deterministic Exchange root destination:

```tsx
import type { MessageCenterContext } from "../../lib/messageCenter";

function detailBasePath(context: MessageCenterContext) {
  return context === "user" ? "/needo" : `/${context}/needo`;
}

async function renderDetail(
  path = "/needo/posts/41",
  context: MessageCenterContext = "user"
) {
  const basePath = detailBasePath(context);
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]} key={`${path}-${context}-${renderVersion += 1}`}>
      <Routes>
        <Route
          path={`${basePath}/posts/:postId`}
          element={<ExchangePostDetailPage context={context} />}
        />
        <Route path={basePath} element={<div data-testid="exchange-root">{basePath}</div>} />
      </Routes>
    </MemoryRouter>
  ));
}
```

Add a table-driven test for all three portal contexts:

```tsx
it.each([
  ["user", "/needo/posts/61", "/needo"],
  ["merchant", "/merchant/needo/posts/61", "/merchant/needo"],
  ["technician", "/technician/needo/posts/61", "/technician/needo"]
] as const)("closes a direct %s detail to its Exchange root", async (context, path, expectedRoot) => {
  vi.mocked(getExchangePost).mockResolvedValue(intelligencePost);
  await renderDetail(path, context);
  await waitFor(() => expect(document.body.textContent).toContain(intelligencePost.title));

  const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
  expect(close).not.toBeNull();
  await act(async () => close?.click());

  expect(document.body.querySelector('[data-testid="exchange-root"]')?.textContent).toBe(expectedRoot);
});
```

- [ ] **Step 2: Write failing state-shell close tests**

Add explicit coverage for invalid, loading, and read-error states:

```tsx
it("keeps a deterministic close action in invalid, loading, and read-error states", async () => {
  await renderDetail("/needo/posts/not-a-number");
  expect(document.body.querySelector('button[aria-label="关闭"]')).not.toBeNull();

  vi.mocked(getExchangePost).mockImplementationOnce(() => new Promise<ExchangePost>(() => undefined));
  await renderDetail("/needo/posts/41");
  expect(document.body.textContent).toContain("正在读取正式详情");
  expect(document.body.querySelector('button[aria-label="关闭"]')).not.toBeNull();

  vi.mocked(getExchangePost).mockRejectedValueOnce(new Error("error.exchange.post_not_found"));
  await renderDetail("/needo/posts/42");
  await waitFor(() => expect(document.body.textContent).toContain("内容不存在或不可查看"));
  expect(document.body.querySelector('button[aria-label="关闭"]')).not.toBeNull();
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npm test -- --run src/features/exchange/ExchangePostDetailPage.test.tsx
```

Expected: the new assertions fail because no `button[aria-label="关闭"]` is rendered. Existing Exchange detail assertions remain green.

- [ ] **Step 4: Implement the minimal shared close wiring**

Add the deterministic close handler beside `goBack`:

```tsx
function closeDetail() {
  navigate(exchangeBasePath(context), { replace: true });
}
```

Pass it to the state shell header:

```tsx
<MobileFullscreenHeader
  onBack={goBack}
  onClose={closeDetail}
  showSpacer={false}
  title={t(validPostId ? "intelligenceDetail" : "requestDetail")}
/>
```

Pass the same handler to the loaded detail header without changing the existing `action`, `info`, `onBack`, `showSpacer`, or `title` props:

```tsx
<MobileFullscreenHeader
  action={existingActionGroup}
  info={existingInfo}
  onBack={goBack}
  onClose={closeDetail}
  showSpacer={false}
  title={existingTitle}
/>
```

- [ ] **Step 5: Run focused and adjacent Exchange tests and verify GREEN**

Run:

```bash
npm test -- --run \
  src/features/exchange/ExchangePostDetailPage.test.tsx \
  src/components/mobile/MobileFullscreenHeader.test.tsx \
  src/pages/mobile/NeedoRoutePages.test.tsx
```

Expected: all selected suites and tests pass with zero failures.

- [ ] **Step 6: Run static verification**

Run:

```bash
npm run lint
npm run build
git diff --check
```

Expected: all commands exit `0`; the build uses the existing bundle budgets without raising them.

- [ ] **Step 7: Run real browser acceptance**

Using the existing local frontend on `http://127.0.0.1:5192` and formal backend on `http://127.0.0.1:3014`:

1. Directly open `/user.html#/needo/posts/<formal-intelligence-id>` at an iPhone 14 Pro Max-like width.
2. Confirm the header contains one back button, the detail title/info control, translation/like/share actions, and one shared close button on the same row without horizontal overflow.
3. Click close and verify the URL becomes `/user.html#/needo`; switch between “我的需求” and “情报”.
4. Enter the same detail from the 情报 list and click back; verify list history navigation still works.
5. Inspect visible page state and console output for recovery UI, runtime errors, and new network failures.

- [ ] **Step 8: Commit the isolated microstep**

Stage only the two implementation files:

```bash
git add \
  src/features/exchange/ExchangePostDetailPage.tsx \
  src/features/exchange/ExchangePostDetailPage.test.tsx
git diff --cached --check
git commit -m "fix(exchange): add deterministic detail close"
```
