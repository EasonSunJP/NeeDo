import { describe, expect, it, vi } from "vitest";
import {
  createMemoryPersistentCacheDatabase,
  createPersistentResourceCache
} from "./persistentResourceCache";

describe("persistent resource cache", () => {
  it("returns the durable value before a new-session revalidation completes", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const first = createPersistentResourceCache({ database });
    await first.load({ key: "carousel:user-home:ja", load: async () => ({ version: 1 }), scope: "public" });

    let resolveServer!: (value: { version: number }) => void;
    const server = new Promise<{ version: number }>((resolve) => { resolveServer = resolve; });
    const second = createPersistentResourceCache({ database });
    const loaded = await second.load({ key: "carousel:user-home:ja", load: () => server, scope: "public" });

    expect(loaded).toEqual({ version: 1 });
    resolveServer({ version: 1 });
    await server;
  });

  it("revalidates a cached entry only once per application session", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const seed = createPersistentResourceCache({ database });
    await seed.load({ key: "cards:home", load: async () => ({ value: "cached" }), scope: "public" });

    const cache = createPersistentResourceCache({ database });
    const load = vi.fn(async () => ({ value: "cached" }));
    await cache.load({ key: "cards:home", load, scope: "public" });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await cache.load({ key: "cards:home", load, scope: "public" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("delivers a changed background response without blocking the cached read", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const seed = createPersistentResourceCache({ database });
    await seed.load({ key: "im:state:user", load: async () => ({ version: 1 }), scope: "account:7" });

    let resolveServer!: (value: { version: number }) => void;
    const server = new Promise<{ version: number }>((resolve) => { resolveServer = resolve; });
    const onRefresh = vi.fn();
    const cache = createPersistentResourceCache({ database });

    await expect(cache.load({
      key: "im:state:user",
      load: () => server,
      onRefresh,
      scope: "account:7"
    })).resolves.toEqual({ version: 1 });
    expect(onRefresh).not.toHaveBeenCalled();

    resolveServer({ version: 2 });
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledWith({ version: 2 }));
  });

  it("notifies subscribers and rewrites storage only when server data changes", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const seed = createPersistentResourceCache({ database });
    await seed.load({ key: "schedule:week", load: async () => ({ slots: [1] }), scope: "account:7" });

    const cache = createPersistentResourceCache({ database });
    const listener = vi.fn();
    cache.subscribe("account:7", "schedule:week", listener);
    await cache.load({ key: "schedule:week", load: async () => ({ slots: [2] }), scope: "account:7" });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ slots: [2] }));
    expect(cache.peek("account:7", "schedule:week")).toEqual({ slots: [2] });

    listener.mockClear();
    await cache.load({ force: true, key: "schedule:week", load: async () => ({ slots: [2] }), scope: "account:7" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps accounts isolated and removes decrypted memory when locked", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const cache = createPersistentResourceCache({ database });
    await cache.load({ key: "profile", load: async () => ({ name: "A" }), scope: "account:1" });
    await cache.load({ key: "profile", load: async () => ({ name: "B" }), scope: "account:2" });

    expect(cache.peek("account:1", "profile")).toEqual({ name: "A" });
    expect(cache.peek("account:2", "profile")).toEqual({ name: "B" });
    cache.lock("account:1");
    expect(cache.peek("account:1", "profile")).toBeUndefined();
    expect(cache.peek("account:2", "profile")).toEqual({ name: "B" });
  });

  it("does not persist plaintext payloads", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const cache = createPersistentResourceCache({ database });
    await cache.load({
      key: "im:conversation:9",
      load: async () => ({ message: "private-message-body" }),
      scope: "account:5"
    });

    expect(JSON.stringify(database.inspectEntries())).not.toContain("private-message-body");
  });

  it("discards a corrupt entry and recovers from the server", async () => {
    const database = createMemoryPersistentCacheDatabase();
    database.seedCorruptEntry("account:3", "calendar:month");
    const cache = createPersistentResourceCache({ database });
    const load = vi.fn(async () => ({ events: [3] }));

    await expect(cache.load({ key: "calendar:month", load, scope: "account:3" })).resolves.toEqual({ events: [3] });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("force retry surfaces server failures without deleting the cached value", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const cache = createPersistentResourceCache({ database });
    await cache.load({ key: "cards:shop:1", load: async () => ({ name: "cached" }), scope: "public" });

    await expect(cache.load({
      force: true,
      key: "cards:shop:1",
      load: async () => { throw new Error("offline"); },
      scope: "public"
    })).rejects.toThrow("offline");
    expect(cache.peek("public", "cards:shop:1")).toEqual({ name: "cached" });
  });

  it("keeps a forced refresh single-flight when realtime polling fires again", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const cache = createPersistentResourceCache({ database });
    let resolveServer!: (value: { bookings: number }) => void;
    const server = new Promise<{ bookings: number }>((resolve) => {
      resolveServer = resolve;
    });
    const load = vi.fn(() => server);

    const first = cache.load({
      force: true,
      key: "merchant:home:store-7",
      load,
      scope: "account:9"
    });
    const repeated = cache.load({
      force: true,
      key: "merchant:home:store-7",
      load,
      scope: "account:9"
    });

    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(1);
    resolveServer({ bookings: 5 });
    await expect(Promise.all([first, repeated])).resolves.toEqual([
      { bookings: 5 },
      { bookings: 5 }
    ]);
  });

  it("invalidates matching durable entries even when they are not loaded in memory", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const writer = createPersistentResourceCache({ database });
    await writer.load({ key: "calendar:one", load: async () => ({ id: 1 }), scope: "account:8" });
    await writer.load({ key: "cards:one", load: async () => ({ id: 2 }), scope: "account:8" });

    const invalidator = createPersistentResourceCache({ database });
    await invalidator.invalidate("account:8", "calendar:");
    const reader = createPersistentResourceCache({ database });
    const calendarLoad = vi.fn(async () => ({ id: 3 }));
    const cardLoad = vi.fn(async () => ({ id: 4 }));

    await expect(reader.load({ key: "calendar:one", load: calendarLoad, scope: "account:8" })).resolves.toEqual({ id: 3 });
    await expect(reader.load({ key: "cards:one", load: cardLoad, scope: "account:8" })).resolves.toEqual({ id: 2 });
    expect(calendarLoad).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(cardLoad).toHaveBeenCalledTimes(1));
  });

  it("reads a durable value without triggering a refresh", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const writer = createPersistentResourceCache({ database });
    await writer.write("account:9", "calendar:week", { slots: [9] });

    const reader = createPersistentResourceCache({ database });
    await expect(reader.read<{ slots: number[] }>("account:9", "calendar:week"))
      .resolves.toEqual({ slots: [9] });
  });

  it("physically clears an account scope and all of its preview subscopes", async () => {
    const database = createMemoryPersistentCacheDatabase();
    const writer = createPersistentResourceCache({ database });
    await writer.write("account:9", "calendar:week", { private: "account" });
    await writer.write("account:9:merchant-preview:12", "calendar:week", { private: "preview" });
    await writer.write("account:90", "calendar:week", { private: "other" });

    await writer.clearScopePrefix("account:9");

    const reader = createPersistentResourceCache({ database });
    await expect(reader.read("account:9", "calendar:week")).resolves.toBeNull();
    await expect(reader.read("account:9:merchant-preview:12", "calendar:week")).resolves.toBeNull();
    await expect(reader.read("account:90", "calendar:week")).resolves.toEqual({ private: "other" });
  });
});
