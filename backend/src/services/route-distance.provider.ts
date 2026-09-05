import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface JapaneseRouteAddress {
  countryCode: "JP";
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  building?: string;
}

export interface RouteDistanceRequest {
  origin: JapaneseRouteAddress;
  destination: JapaneseRouteAddress;
}

export interface RouteDistanceResult {
  providerCode: string;
  providerRequestId: string | null;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteDistanceProvider {
  readonly key: string;
  getDrivingRoute(request: RouteDistanceRequest): Promise<RouteDistanceResult>;
}

export type RouteDistanceProviderErrorKey =
  | "error.travel.provider_unconfigured"
  | "error.travel.provider_rate_limited"
  | "error.travel.provider_timeout"
  | "error.travel.route_not_found"
  | "error.travel.provider_invalid_response"
  | "error.travel.provider_unavailable";

const providerErrorDetails: Record<
  RouteDistanceProviderErrorKey,
  { code: number; statusCode: number }
> = {
  "error.travel.provider_unconfigured": {
    code: ERROR_CODES.TRAVEL_PROVIDER_UNCONFIGURED,
    statusCode: 503
  },
  "error.travel.provider_rate_limited": {
    code: ERROR_CODES.TRAVEL_PROVIDER_RATE_LIMITED,
    statusCode: 429
  },
  "error.travel.provider_timeout": {
    code: ERROR_CODES.TRAVEL_PROVIDER_TIMEOUT,
    statusCode: 503
  },
  "error.travel.route_not_found": {
    code: ERROR_CODES.TRAVEL_ROUTE_NOT_FOUND,
    statusCode: 422
  },
  "error.travel.provider_invalid_response": {
    code: ERROR_CODES.TRAVEL_PROVIDER_INVALID_RESPONSE,
    statusCode: 503
  },
  "error.travel.provider_unavailable": {
    code: ERROR_CODES.TRAVEL_PROVIDER_UNAVAILABLE,
    statusCode: 503
  }
};

export class RouteDistanceProviderError extends AppError {
  public readonly errorKey: RouteDistanceProviderErrorKey;

  public constructor(errorKey: RouteDistanceProviderErrorKey) {
    const details = providerErrorDetails[errorKey];
    super({ code: details.code, message: errorKey, statusCode: details.statusCode });
    this.name = "RouteDistanceProviderError";
    this.errorKey = errorKey;
  }
}

export class DisabledRouteDistanceProvider implements RouteDistanceProvider {
  public readonly key = "disabled";

  public async getDrivingRoute(): Promise<never> {
    throw new RouteDistanceProviderError("error.travel.provider_unconfigured");
  }
}
