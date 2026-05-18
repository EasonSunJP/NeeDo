import { useSyncExternalStore } from "react";
import { parseBrowserStorageJson, removeBrowserStorage, writeBrowserStorage } from "../../lib/browserStorage";
import { createDefaultShopMemberSnapshot } from "./seed";
import {
  approveShopMemberCardRefund,
  consumeShopMemberCard,
  createShopMember,
  freezeShopMemberCard,
  issueShopMemberCard,
  requestShopMemberCardRefund,
  topupShopMemberCard,
  unfreezeShopMemberCard,
  updateShopMemberCardTemplate
} from "./service";
import type { ShopMemberSnapshot } from "./types";

type ShopMemberMutation = (snapshot: ShopMemberSnapshot) => ShopMemberSnapshot;

const storageKey = "needo.shop-member-system.v1";
const listeners = new Set<() => void>();
let snapshot = createDefaultShopMemberSnapshot();
let hydrated = false;
let storageListenerBound = false;

function cloneSnapshot(value: ShopMemberSnapshot) {
  return JSON.parse(JSON.stringify(value)) as ShopMemberSnapshot;
}

function getSnapshot() {
  hydrate();
  return snapshot;
}

function notify(nextSnapshot: ShopMemberSnapshot) {
  snapshot = nextSnapshot;
  writeBrowserStorage(storageKey, JSON.stringify(snapshot), { silent: true });
  listeners.forEach((listener) => listener());
}

function mutate(mutation: ShopMemberMutation) {
  const next = mutation(getSnapshot());
  notify(next);
  return next;
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== storageKey) {
      return;
    }

    if (!event.newValue) {
      snapshot = createDefaultShopMemberSnapshot();
      listeners.forEach((listener) => listener());
      return;
    }

    try {
      snapshot = JSON.parse(event.newValue) as ShopMemberSnapshot;
    } catch {
      snapshot = createDefaultShopMemberSnapshot();
    }

    listeners.forEach((listener) => listener());
  });
}

function hydrate() {
  if (hydrated) {
    return;
  }

  hydrated = true;
  bindStorageListener();
  snapshot = parseBrowserStorageJson(storageKey, snapshot, { removeOnError: true, silent: true });
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function useShopMemberStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getShopMemberStoreSnapshot() {
  return getSnapshot();
}

export function resetShopMemberStore() {
  removeBrowserStorage(storageKey, { silent: true });
  notify(createDefaultShopMemberSnapshot());
}

export function setShopMemberStoreSnapshotForTests(nextSnapshot: ShopMemberSnapshot) {
  snapshot = cloneSnapshot(nextSnapshot);
  hydrated = true;
  listeners.forEach((listener) => listener());
}

export function createShopMemberRecord(input: Parameters<typeof createShopMember>[1]) {
  return mutate((current) => createShopMember(current, input));
}

export function issueShopMemberCardRecord(input: Parameters<typeof issueShopMemberCard>[1]) {
  return mutate((current) => issueShopMemberCard(current, input).snapshot);
}

export function updateShopMemberCardTemplateRecord(input: Parameters<typeof updateShopMemberCardTemplate>[1]) {
  return mutate((current) => updateShopMemberCardTemplate(current, input));
}

export function topupShopMemberCardRecord(input: Parameters<typeof topupShopMemberCard>[1]) {
  return mutate((current) => topupShopMemberCard(current, input).snapshot);
}

export function consumeShopMemberCardRecord(input: Parameters<typeof consumeShopMemberCard>[1]) {
  return mutate((current) => consumeShopMemberCard(current, input).snapshot);
}

export function freezeShopMemberCardRecord(input: Parameters<typeof freezeShopMemberCard>[1]) {
  return mutate((current) => freezeShopMemberCard(current, input).snapshot);
}

export function unfreezeShopMemberCardRecord(input: Parameters<typeof unfreezeShopMemberCard>[1]) {
  return mutate((current) => unfreezeShopMemberCard(current, input).snapshot);
}

export function requestShopMemberCardRefundRecord(input: Parameters<typeof requestShopMemberCardRefund>[1]) {
  return mutate((current) => requestShopMemberCardRefund(current, input).snapshot);
}

export function approveShopMemberCardRefundRecord(input: Parameters<typeof approveShopMemberCardRefund>[1]) {
  return mutate((current) => approveShopMemberCardRefund(current, input).snapshot);
}
