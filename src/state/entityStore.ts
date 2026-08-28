import { useSyncExternalStore } from "react";
import { removeBrowserStorage } from "../lib/browserStorage";
import type { Customer, Store, Technician } from "../types/domain";

type EntityUpdater<T> = Partial<T> | ((current: T) => Partial<T>);

type EntitySnapshot = {
  customers: Customer[];
  stores: Store[];
  technicians: Technician[];
  revision: number;
};

const retiredStorageKeys = [
  "needo.entity-store.v4",
  "needo.entity-store.v3",
  "needo.entity-store.v2"
];
const emptySnapshot: EntitySnapshot = {
  customers: [],
  stores: [],
  technicians: [],
  revision: 0
};
let retiredStoragePurged = false;

function purgeRetiredStorage() {
  if (retiredStoragePurged) {
    return;
  }

  retiredStoragePurged = true;
  retiredStorageKeys.forEach((key) => removeBrowserStorage(key, { silent: true }));
}

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  purgeRetiredStorage();
  return emptySnapshot;
}

export function useEntityStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getEntityStoreSnapshot() {
  return getSnapshot();
}

export function updateCustomerEntity(_id: string, _updater: EntityUpdater<Customer>) {
  purgeRetiredStorage();
  return false;
}

export function updateStoreEntity(_id: string, _updater: EntityUpdater<Store>) {
  purgeRetiredStorage();
  return false;
}

export function updateTechnicianEntity(_id: string, _updater: EntityUpdater<Technician>) {
  purgeRetiredStorage();
  return false;
}

export function findCustomerById(_id: string): Customer | undefined {
  purgeRetiredStorage();
  return undefined;
}

export function findCustomerByName(_name?: string | null): Customer | undefined {
  purgeRetiredStorage();
  return undefined;
}

export function findStoreById(_id: string): Store | undefined {
  purgeRetiredStorage();
  return undefined;
}

export function findStoreByName(_name?: string | null): Store | undefined {
  purgeRetiredStorage();
  return undefined;
}

export function findTechnicianById(_id: string): Technician | undefined {
  purgeRetiredStorage();
  return undefined;
}

export function findTechnicianByName(_name?: string | null): Technician | undefined {
  purgeRetiredStorage();
  return undefined;
}

export function getLinkedIdentityBundle(_username: string): {
  customer: Customer | undefined;
  technician: Technician | undefined;
  store: Store | undefined;
} {
  purgeRetiredStorage();
  return {
    customer: undefined,
    technician: undefined,
    store: undefined
  };
}
