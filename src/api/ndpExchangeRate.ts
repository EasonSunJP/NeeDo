import { httpClient } from "./httpClient";

export type NdpExchangeRatePersistenceStatus = "active" | "superseded";

export interface NdpExchangeRateRecord {
  ruleId: number;
  publicId: string;
  version: number;
  ndpUnits: number;
  jpyUnits: number;
  status: NdpExchangeRatePersistenceStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NdpExchangeRatePage {
  list: NdpExchangeRateRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface NdpExchangeRateOverview {
  current: NdpExchangeRateRecord | null;
  nextScheduled: NdpExchangeRateRecord | null;
  latestVersion: number;
  evaluatedAt: string;
  history: NdpExchangeRatePage;
}

export interface NdpExchangeRateQuery
  extends Record<string, boolean | number | string | null | undefined> {
  page?: number;
  pageSize?: number;
  at?: string;
}

export interface NdpExchangeRatePublishInput {
  ndpUnits: number;
  jpyUnits: number;
  expectedVersion: number;
  effectiveFrom: string;
  reason: string;
  idempotencyKey: string;
}

type RawRate = NdpExchangeRateRecord & {
  activeKey?: unknown;
  idempotencyKey?: unknown;
};

type RawOverview = Omit<NdpExchangeRateOverview, "current" | "nextScheduled" | "history"> & {
  current: RawRate | null;
  nextScheduled: RawRate | null;
  history: Omit<NdpExchangeRatePage, "list"> & { list: RawRate[] };
};

function mapRate(rate: RawRate): NdpExchangeRateRecord {
  return {
    ruleId: rate.ruleId,
    publicId: rate.publicId,
    version: rate.version,
    ndpUnits: rate.ndpUnits,
    jpyUnits: rate.jpyUnits,
    status: rate.status,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    reason: rate.reason,
    createdById: rate.createdById,
    createdAt: rate.createdAt,
    updatedAt: rate.updatedAt
  };
}

function mapOverview(overview: RawOverview): NdpExchangeRateOverview {
  return {
    current: overview.current ? mapRate(overview.current) : null,
    nextScheduled: overview.nextScheduled ? mapRate(overview.nextScheduled) : null,
    latestVersion: overview.latestVersion,
    evaluatedAt: overview.evaluatedAt,
    history: {
      list: overview.history.list.map(mapRate),
      total: overview.history.total,
      page: overview.history.page,
      page_size: overview.history.page_size
    }
  };
}

export const ndpExchangeRateApi = {
  async getOverview(query: NdpExchangeRateQuery = {}) {
    const overview = await httpClient.request<RawOverview>(
      "/backoffice/ndp-exchange-rates",
      { query }
    );
    return mapOverview(overview);
  },
  async publish(body: NdpExchangeRatePublishInput) {
    const rate = await httpClient.request<RawRate>(
      "/backoffice/ndp-exchange-rates",
      { body, method: "POST" }
    );
    return mapRate(rate);
  }
};
