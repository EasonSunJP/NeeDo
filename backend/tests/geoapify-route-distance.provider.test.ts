import {
  GeoapifyRouteDistanceProvider,
  type GeoapifyRouteDistanceProviderOptions
} from "../src/services/geoapify-route-distance.provider";
import {
  RouteDistanceProviderError,
  type RouteDistanceRequest
} from "../src/services/route-distance.provider";
import type { RouteProviderHealthStorePort } from "../src/services/route-provider-health";

const request: RouteDistanceRequest = {
  origin: {
    countryCode: "JP",
    postalCode: "160-0022",
    prefecture: "東京都",
    city: "新宿区",
    addressLine1: "新宿3-1-1",
    building: "NeeDo新宿店"
  },
  destination: {
    countryCode: "JP",
    postalCode: "150-0001",
    prefecture: "東京都",
    city: "渋谷区",
    addressLine1: "神宮前1-2-3",
    building: "山田ビル 201"
  }
};

const jsonResponse = (payload: unknown, status = 200, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });

const createFetch = (...responses: Array<Response | Error>): jest.MockedFunction<typeof fetch> =>
  jest.fn(async (...args: Parameters<typeof fetch>) => {
    void args;
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Unexpected provider request");
    return next;
  }) as unknown as jest.MockedFunction<typeof fetch>;

const createHealthStore = (): jest.Mocked<RouteProviderHealthStorePort> => ({
  recordSuccess: jest.fn<
    ReturnType<RouteProviderHealthStorePort["recordSuccess"]>,
    Parameters<RouteProviderHealthStorePort["recordSuccess"]>
  >(async () => undefined),
  recordFailure: jest.fn<
    ReturnType<RouteProviderHealthStorePort["recordFailure"]>,
    Parameters<RouteProviderHealthStorePort["recordFailure"]>
  >(async () => undefined),
  read: jest.fn<
    ReturnType<RouteProviderHealthStorePort["read"]>,
    Parameters<RouteProviderHealthStorePort["read"]>
  >(async () => ({ status: "configured", checkedAt: null }))
});

const options = (
  fetchImplementation: typeof fetch,
  healthStore: RouteProviderHealthStorePort = createHealthStore()
): GeoapifyRouteDistanceProviderOptions => ({
  apiBaseUrl: "https://api.geoapify.com",
  apiKey: "geoapify-secret-key-123456",
  timeoutMs: 50,
  maxRetries: 0,
  healthStore,
  fetch: fetchImplementation,
  sleep: async () => undefined
});

describe("Geoapify route distance provider", () => {
  it("geocodes structured Japanese addresses then normalizes one driving route", async () => {
    const fetchImplementation = createFetch(
      jsonResponse({ results: [{ lat: 35.6909, lon: 139.7003 }] }),
      jsonResponse({ results: [{ lat: 35.6702, lon: 139.7027 }] }),
      jsonResponse(
        {
          features: [
            {
              properties: {
                distance: 4278.6,
                time: 912.4,
                legs: [{ distance: 4278.6, time: 912.4 }]
              }
            }
          ]
        },
        200,
        { "x-request-id": "geo-route-request-1" }
      )
    );
    const healthStore = createHealthStore();
    const provider = new GeoapifyRouteDistanceProvider(options(fetchImplementation, healthStore));

    await expect(provider.getDrivingRoute(request)).resolves.toEqual({
      providerCode: "geoapify",
      providerRequestId: "geo-route-request-1",
      distanceMeters: 4_279,
      durationSeconds: 912
    });

    const originUrl = new URL(String(fetchImplementation.mock.calls[0]?.[0]));
    const destinationUrl = new URL(String(fetchImplementation.mock.calls[1]?.[0]));
    const routeUrl = new URL(String(fetchImplementation.mock.calls[2]?.[0]));
    expect(originUrl.pathname).toBe("/v1/geocode/search");
    expect(originUrl.searchParams.get("text")).toBe(
      "〒160-0022 東京都 新宿区 新宿3-1-1 NeeDo新宿店"
    );
    expect(destinationUrl.searchParams.get("text")).toBe(
      "〒150-0001 東京都 渋谷区 神宮前1-2-3 山田ビル 201"
    );
    expect(originUrl.searchParams.get("filter")).toBe("countrycode:jp");
    expect(routeUrl.pathname).toBe("/v1/routing");
    expect(routeUrl.searchParams.get("mode")).toBe("drive");
    expect(routeUrl.searchParams.get("waypoints")).toBe(
      "35.6909,139.7003|35.6702,139.7027"
    );
    expect(healthStore.recordSuccess).toHaveBeenCalledWith("geoapify");
  });

  it("retries a bounded transient failure without changing the route request", async () => {
    const fetchImplementation = createFetch(
      jsonResponse({}, 500),
      jsonResponse({ results: [{ lat: 35.6909, lon: 139.7003 }] }),
      jsonResponse({ results: [{ lat: 35.6702, lon: 139.7027 }] }),
      jsonResponse({
        features: [{ properties: { distance: 4_000, time: 900, legs: [{ distance: 4_000 }] } }]
      })
    );
    const provider = new GeoapifyRouteDistanceProvider({
      ...options(fetchImplementation),
      maxRetries: 1
    });

    await expect(provider.getDrivingRoute(request)).resolves.toMatchObject({
      distanceMeters: 4_000,
      durationSeconds: 900
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      String(fetchImplementation.mock.calls[1]?.[0])
    );
  });

  it("maps rate limiting without exposing the API key", async () => {
    const healthStore = createHealthStore();
    const provider = new GeoapifyRouteDistanceProvider(
      options(createFetch(jsonResponse({ message: "quota" }, 429)), healthStore)
    );

    const error = await provider.getDrivingRoute(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RouteDistanceProviderError);
    expect(error).toMatchObject({
      message: "error.travel.provider_rate_limited",
      statusCode: 429
    });
    expect(String(error)).not.toContain("geoapify-secret-key-123456");
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(healthStore.recordFailure).toHaveBeenCalledWith(
      "geoapify",
      "error.travel.provider_rate_limited"
    );
  });

  it("awaits a health observation without letting its failure mask a successful route", async () => {
    const healthStore = createHealthStore();
    healthStore.recordSuccess.mockRejectedValueOnce(
      new Error("redis://default:super-secret@redis.internal:6379/0")
    );
    const provider = new GeoapifyRouteDistanceProvider(
      options(
        createFetch(
          jsonResponse({ results: [{ lat: 35.6909, lon: 139.7003 }] }),
          jsonResponse({ results: [{ lat: 35.6702, lon: 139.7027 }] }),
          jsonResponse({
            features: [
              {
                properties: {
                  distance: 4_000,
                  time: 900,
                  legs: [{ distance: 4_000, time: 900 }]
                }
              }
            ]
          })
        ),
        healthStore
      )
    );

    await expect(provider.getDrivingRoute(request)).resolves.toMatchObject({
      distanceMeters: 4_000,
      durationSeconds: 900
    });
    expect(healthStore.recordSuccess).toHaveBeenCalledWith("geoapify");
  });

  it("does not let a failed health write replace the original provider failure", async () => {
    const healthStore = createHealthStore();
    healthStore.recordFailure.mockRejectedValueOnce(
      new Error("redis://default:super-secret@redis.internal:6379/0")
    );
    const provider = new GeoapifyRouteDistanceProvider(
      options(createFetch(jsonResponse({ message: "quota" }, 429)), healthStore)
    );

    await expect(provider.getDrivingRoute(request)).rejects.toMatchObject({
      message: "error.travel.provider_rate_limited",
      statusCode: 429
    });
    expect(healthStore.recordFailure).toHaveBeenCalledWith(
      "geoapify",
      "error.travel.provider_rate_limited"
    );
  });

  it("maps an aborted request to the stable timeout error", async () => {
    const fetchImplementation = jest.fn(
      async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("request aborted", "AbortError"))
          );
        })
    ) as unknown as jest.MockedFunction<typeof fetch>;
    const provider = new GeoapifyRouteDistanceProvider({
      ...options(fetchImplementation),
      timeoutMs: 5
    });

    await expect(provider.getDrivingRoute(request)).rejects.toMatchObject({
      message: "error.travel.provider_timeout",
      statusCode: 503
    });
  });

  it("maps an unresolved address to route-not-found", async () => {
    const provider = new GeoapifyRouteDistanceProvider(
      options(createFetch(jsonResponse({ results: [] })))
    );
    await expect(provider.getDrivingRoute(request)).rejects.toMatchObject({
      message: "error.travel.route_not_found",
      statusCode: 422
    });
  });

  it.each([
    ["invalid geocode", [jsonResponse({ results: [{ lat: "35", lon: 139 }] })]],
    [
      "multiple route legs",
      [
        jsonResponse({ results: [{ lat: 35.69, lon: 139.7 }] }),
        jsonResponse({ results: [{ lat: 35.67, lon: 139.71 }] }),
        jsonResponse({
          features: [
            { properties: { distance: 4_000, time: 900, legs: [{}, {}] } }
          ]
        })
      ]
    ],
    [
      "non-positive route",
      [
        jsonResponse({ results: [{ lat: 35.69, lon: 139.7 }] }),
        jsonResponse({ results: [{ lat: 35.67, lon: 139.71 }] }),
        jsonResponse({ features: [{ properties: { distance: 0, time: 900, legs: [{}] } }] })
      ]
    ]
  ])("rejects %s provider data", async (_label, responses) => {
    const provider = new GeoapifyRouteDistanceProvider(options(createFetch(...responses)));
    await expect(provider.getDrivingRoute(request)).rejects.toMatchObject({
      message: "error.travel.provider_invalid_response",
      statusCode: 503
    });
  });

  it("maps network failures to unavailable without retaining secret provider text", async () => {
    const provider = new GeoapifyRouteDistanceProvider(
      options(createFetch(new Error("request failed apiKey=geoapify-secret-key-123456")))
    );
    const error = await provider.getDrivingRoute(request).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      message: "error.travel.provider_unavailable",
      statusCode: 503
    });
    expect(String(error)).not.toContain("geoapify-secret-key-123456");
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
  });
});
