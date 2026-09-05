import {
  RouteDistanceProviderError,
  type JapaneseRouteAddress,
  type RouteDistanceProvider,
  type RouteDistanceRequest,
  type RouteDistanceResult
} from "./route-distance.provider";

export interface GeoapifyRouteDistanceProviderOptions {
  apiBaseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

const defaultSleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const formatJapaneseRouteAddress = (address: JapaneseRouteAddress): string =>
  [
    `〒${address.postalCode.trim()}`,
    address.prefecture.trim(),
    address.city.trim(),
    address.addressLine1.trim(),
    address.addressLine2?.trim(),
    address.building?.trim()
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

export class GeoapifyRouteDistanceProvider implements RouteDistanceProvider {
  public readonly key = "geoapify";

  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleepImplementation: (delayMs: number) => Promise<void>;

  public constructor(options: GeoapifyRouteDistanceProviderOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/u, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.fetchImplementation = options.fetch ?? fetch;
    this.sleepImplementation = options.sleep ?? defaultSleep;
  }

  public async getDrivingRoute(request: RouteDistanceRequest): Promise<RouteDistanceResult> {
    const origin = await this.geocode(request.origin);
    const destination = await this.geocode(request.destination);
    return this.route(origin, destination);
  }

  private async geocode(address: JapaneseRouteAddress): Promise<Coordinates> {
    const url = new URL(`${this.apiBaseUrl}/v1/geocode/search`);
    url.searchParams.set("text", formatJapaneseRouteAddress(address));
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("filter", "countrycode:jp");
    url.searchParams.set("apiKey", this.apiKey);

    const { payload } = await this.requestJson(url);
    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      throw this.invalidResponse();
    }
    if (payload.results.length === 0) {
      throw new RouteDistanceProviderError("error.travel.route_not_found");
    }
    const first = payload.results[0];
    if (!isRecord(first) || !this.isCoordinate(first.lat, -90, 90) || !this.isCoordinate(first.lon, -180, 180)) {
      throw this.invalidResponse();
    }
    return { latitude: first.lat, longitude: first.lon };
  }

  private async route(origin: Coordinates, destination: Coordinates): Promise<RouteDistanceResult> {
    const url = new URL(`${this.apiBaseUrl}/v1/routing`);
    url.searchParams.set(
      "waypoints",
      `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`
    );
    url.searchParams.set("mode", "drive");
    url.searchParams.set("format", "geojson");
    url.searchParams.set("apiKey", this.apiKey);

    const { payload, response } = await this.requestJson(url);
    if (!isRecord(payload) || !Array.isArray(payload.features)) {
      throw this.invalidResponse();
    }
    if (payload.features.length === 0) {
      throw new RouteDistanceProviderError("error.travel.route_not_found");
    }
    if (payload.features.length !== 1) {
      throw this.invalidResponse();
    }
    const feature = payload.features[0];
    const properties = isRecord(feature) ? feature.properties : undefined;
    if (
      !isRecord(properties) ||
      !Array.isArray(properties.legs) ||
      properties.legs.length !== 1 ||
      !this.isPositiveFinite(properties.distance) ||
      !this.isPositiveFinite(properties.time)
    ) {
      throw this.invalidResponse();
    }

    const distanceMeters = Math.round(properties.distance);
    const durationSeconds = Math.round(properties.time);
    if (!Number.isSafeInteger(distanceMeters) || !Number.isSafeInteger(durationSeconds)) {
      throw this.invalidResponse();
    }

    return {
      providerCode: this.key,
      providerRequestId:
        response.headers.get("x-request-id") ??
        response.headers.get("x-geoapify-request-id"),
      distanceMeters,
      durationSeconds
    };
  }

  private async requestJson(url: URL): Promise<{ payload: unknown; response: Response }> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.performRequest(url);
        if (response.ok) {
          try {
            return { payload: await response.json(), response };
          } catch {
            throw this.invalidResponse();
          }
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < this.maxRetries) {
          await this.sleepImplementation(this.retryDelayMs(attempt));
          continue;
        }
        if (response.status === 429) {
          throw new RouteDistanceProviderError("error.travel.provider_rate_limited");
        }
        throw new RouteDistanceProviderError("error.travel.provider_unavailable");
      } catch (error) {
        if (error instanceof RouteDistanceProviderError) throw error;
        if (attempt < this.maxRetries) {
          await this.sleepImplementation(this.retryDelayMs(attempt));
          continue;
        }
        throw new RouteDistanceProviderError("error.travel.provider_unavailable");
      }
    }
    throw new RouteDistanceProviderError("error.travel.provider_unavailable");
  }

  private async performRequest(url: URL): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImplementation(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new RouteDistanceProviderError("error.travel.provider_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(2_000, 100 * 2 ** attempt);
  }

  private isCoordinate(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
  }

  private isPositiveFinite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  private invalidResponse(): RouteDistanceProviderError {
    return new RouteDistanceProviderError("error.travel.provider_invalid_response");
  }
}
