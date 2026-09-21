import type { PaginatedResponse } from "../utils/pagination";
import type { ExchangeActorPayload, ExchangeServiceMode } from "./exchange.types";

export type ExchangeIntelligenceServiceRef = `shop:${number}` | `technician:${number}`;

export type ExchangeIntelligencePublisherScope =
  | { kind: "merchant"; shopId: number }
  | { kind: "technician"; technicianProfileId: number };

export interface ExchangeIntelligenceServiceOptionPayload {
  serviceRef: ExchangeIntelligenceServiceRef;
  ownerType: "shop" | "technician";
  name: string;
  durationMinutes: number;
  catalogPriceJpy: number;
  currency: "JPY";
  serviceMode: string;
  available: true;
  shop: {
    publicId: string;
    name: string;
    city: string;
    address: string;
  };
  technician: {
    publicId: string;
    displayName: string;
    avatarUrl: string | null;
    serviceArea: string | null;
    serviceAreas: string[];
  } | null;
}

export type ExchangeIntelligenceServiceOptionPage =
  PaginatedResponse<ExchangeIntelligenceServiceOptionPayload>;

export interface ExchangeIntelligencePublicationService {
  serviceRef: ExchangeIntelligenceServiceRef;
  serviceId: number | null;
  technicianServiceId: number | null;
  serviceName: string;
  serviceDurationMinutes: number;
  catalogPriceJpy: number;
  serviceMode: ExchangeServiceMode;
  areaLabel: string;
  addressLabel: string | null;
  serviceAreas: string[];
  publisher: ExchangeActorPayload;
}

export type ExchangeIntelligencePublicationServiceResolution =
  | { kind: "success"; value: ExchangeIntelligencePublicationService }
  | { kind: "not_found" | "forbidden" | "unavailable" };
