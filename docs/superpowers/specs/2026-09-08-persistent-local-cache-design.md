# NeeDo persistent local read-cache design

## Goal

IM history, formal schedules/calendars, published carousels, and user-facing information cards must render from a local cache when a valid account-scoped copy exists. Navigating away and back must not clear visible data or force a blocking full download. The server remains authoritative: local entries change only after a successful server response or an authenticated realtime update.

## Boundaries

- This is a read-through cache, never an offline write queue and never a replacement for the database.
- Authenticated records are isolated by authenticated account and merchant preview shop. They are encrypted at rest in IndexedDB with a non-extractable AES-GCM key.
- Public content uses the same versioned IndexedDB store under a public scope.
- In-memory snapshots provide synchronous route-return rendering. IndexedDB provides browser-restart persistence.
- The first read in an application session revalidates a cached entry in the background. Later route returns reuse it without another request. Explicit retry and successful writes force revalidation/invalidation.
- Revalidation only publishes and rewrites a cache entry when the response payload fingerprint changed.
- A failed background revalidation preserves the last successful cached value. A cold-cache failure still surfaces the normal error state.
- Uploaded NeeDo media keeps content-addressed/HTTP browser caching. Cached JSON retains the stable media URL, so route changes do not blank the image while metadata reloads.
- Prices may be present in cached read models for immediate display, but they are never authoritative for order creation. The final confirmation submits the displayed JPY amount and the booking transaction rejects any mismatch with the current database price.

## Covered read paths

1. Published user-home and affiliate carousels, keyed by scene and locale.
2. Core-read information cards: home recommendations, categories/search results, shop/service/technician/customer details.
3. Customer self-profile cards.
4. Booking orders and schedule-slot windows used by calendars and technician schedule resources.
5. IM bootstrap entities and authoritative message history, using the prior encrypted IM cache contract and current store/realtime interfaces.

## IM compatibility decision

The previous `codex/im-message-lifecycle` work is conceptually compatible: account-scoped encryption, authoritative-message filtering, recall/delete purge, media sanitisation, and sync cursor all support this design. Its UI/Auth/store patch cannot be merged wholesale because those files have since changed substantially. The reusable local-cache core and lifecycle rules will be ported into the current store, with current realtime events remaining authoritative.

## Cache lifecycle

1. Read the memory snapshot synchronously when available.
2. Otherwise decrypt the IndexedDB entry and render it without waiting for the network.
3. Revalidate once per application session (or after explicit invalidation/retry).
4. If the server payload fingerprint differs, atomically replace the entry and notify subscribers.
5. If the server returns the same payload, retain the current entry without a UI reset.
6. On logout/account switch, lock in-memory encryption keys and remove that account's decrypted memory snapshots. Durable encrypted data remains until the user explicitly clears local cache.

## Failure and security rules

- Never cache failed, optimistic, or locally fabricated business responses.
- Never cache access tokens, refresh tokens, OTPs, or password material. The current IM contract has stable media URLs rather than the prior branch's `mediaId/mediaState` fetch contract, so those references remain only inside the encrypted account cache and their bytes use the server's browser-cache headers.
- Recall, deletion, privacy expiry, conversation clear, and account clear must purge the corresponding IM cache records.
- Corrupt or undecryptable entries are discarded and recovered from the server.
- A booking price mismatch returns a dedicated conflict, rolls back the transaction, reloads the confirmation page from the server, and requires the customer to confirm the new price explicitly.
