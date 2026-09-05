import type { PaginatedResponse } from "../utils/pagination";

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
