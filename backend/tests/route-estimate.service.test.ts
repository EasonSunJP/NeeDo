import { RouteEstimateService, type RouteEstimateRepositoryPort } from "../src/services/route-estimate.service";
import { RouteDistanceProviderError, type RouteDistanceProvider } from "../src/services/route-distance.provider";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actor: AuthenticatedAccessContext = {
  userId: 9, email: "customer@example.com", accessTokenJti: "jti", accessTokenExpiresAt: 2_000_000_000,
  currentIdentityId: 90, currentIdentityType: "customer", currentIdentityScopeType: "user", currentIdentityScopeId: 9,
  roles: ["customer"], permissions: []
};
const destination = {
  countryCode: "JP" as const, postalCode: "160-0022", prefecture: "東京都", city: "新宿区",
  addressLine1: "新宿1-2-3", addressLine2: "", building: "Needo 301"
};
const context = {
  serviceId: 21, servicePublicId: "service-21", shopId: 11,
  origin: { countryCode: "JP" as const, postalCode: "", prefecture: "東京都", city: "新宿区", addressLine1: "西新宿1-1-1" },
  policyVersionId: 31, policyVersionPublicId: "policy-v1", policyVersion: 1,
  bands: [
    { id: 41, ordinal: 0, maximumDistanceMeters: 5_000, fareAmountJpy: 0 },
    { id: 42, ordinal: 1, maximumDistanceMeters: 10_000, fareAmountJpy: 500 }
  ]
};

const createRepository = (): jest.Mocked<RouteEstimateRepositoryPort> => ({
  findEligibleContext: jest.fn(async (servicePublicId: string, at: Date) => { void servicePublicId; void at; return context; }),
  findReusableEstimate: jest.fn(async (input) => { void input; return null; }),
  createEstimate: jest.fn(async (input) => ({
    publicId: input.publicId, distanceMeters: input.distanceMeters, durationSeconds: input.durationSeconds,
    fareAmountJpy: input.fareAmountJpy, policyVersionPublicId: context.policyVersionPublicId,
    policyVersion: context.policyVersion, bandMaximumDistanceMeters: 10_000,
    expiresAt: input.expiresAt.toISOString()
  }))
});
const provider = (): jest.Mocked<RouteDistanceProvider> => ({
  key: "geoapify",
  getDrivingRoute: jest.fn(async (request) => { void request; return { providerCode: "geoapify", providerRequestId: "req-1", distanceMeters: 7_500, durationSeconds: 1_200 }; })
});

describe("RouteEstimateService", () => {
  it("uses the server-owned shop origin and binds persisted estimates to customer/shop/service/address/policy", async () => {
    const repo = createRepository();
    const routeProvider = provider();
    const clock = () => new Date("2026-09-05T00:00:00.000Z");
    const service = new RouteEstimateService(repo, routeProvider, { createInput: (input) => input as never }, { estimateTtlSeconds: 600, cacheTtlSeconds: 300 }, clock);

    const result = await service.create(actor, { ip: "203.0.113.1" }, { servicePublicId: "service-21", destination });

    expect(routeProvider.getDrivingRoute).toHaveBeenCalledWith({
      origin: context.origin,
      destination: {
        countryCode: "JP", postalCode: "1600022", prefecture: "東京都", city: "新宿区",
        addressLine1: "新宿1-2-3", building: "Needo 301"
      }
    });
    expect(repo.createEstimate).toHaveBeenCalledWith(expect.objectContaining({
      customerUserId: 9, shopId: 11, serviceId: 21, policyVersionId: 31, matchedBandId: 42,
      distanceMeters: 7_500, fareAmountJpy: 500,
      expiresAt: new Date("2026-09-05T00:10:00.000Z"),
      originAddressHash: expect.stringMatching(/^[a-f0-9]{64}$/), destinationAddressHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(result).toMatchObject({ fareAmountJpy: 500, bandMaximumDistanceMeters: 10_000, cached: false });
    expect(result).not.toHaveProperty("destinationAddressHash");
  });

  it("reuses only a same-address, same-policy unexpired cached estimate without calling the provider", async () => {
    const repo = createRepository();
    repo.findReusableEstimate.mockResolvedValue({
      publicId: "cached", distanceMeters: 4_000, durationSeconds: 800, fareAmountJpy: 0,
      policyVersionPublicId: "policy-v1", policyVersion: 1, bandMaximumDistanceMeters: 5_000,
      expiresAt: "2026-09-05T00:08:00.000Z"
    });
    const routeProvider = provider();
    const service = new RouteEstimateService(repo, routeProvider, { createInput: (input) => input as never }, { estimateTtlSeconds: 600, cacheTtlSeconds: 300 }, () => new Date("2026-09-05T00:00:00.000Z"));

    await expect(service.create(actor, { ip: "203.0.113.1" }, { servicePublicId: "service-21", destination })).resolves.toMatchObject({ publicId: "cached", cached: true });
    expect(routeProvider.getDrivingRoute).not.toHaveBeenCalled();
  });

  it("rejects store services, missing policies, and distances outside the greatest band", async () => {
    const repo = createRepository();
    repo.findEligibleContext.mockResolvedValueOnce(null);
    const service = new RouteEstimateService(repo, provider(), { createInput: (input) => input as never }, { estimateTtlSeconds: 600, cacheTtlSeconds: 300 });
    await expect(service.create(actor, { ip: "ip" }, { servicePublicId: "store-service", destination })).rejects.toMatchObject({ message: "error.travel.home_service_not_eligible", statusCode: 422 });

    repo.findEligibleContext.mockResolvedValueOnce({ ...context, bands: [] });
    await expect(service.create(actor, { ip: "ip" }, { servicePublicId: "service-21", destination })).rejects.toMatchObject({ message: "error.travel.policy_unavailable", statusCode: 503 });

    const farProvider = provider();
    farProvider.getDrivingRoute.mockResolvedValue({ providerCode: "geoapify", providerRequestId: null, distanceMeters: 10_001, durationSeconds: 2_000 });
    const farService = new RouteEstimateService(repo, farProvider, { createInput: (input) => input as never }, { estimateTtlSeconds: 600, cacheTtlSeconds: 300 });
    await expect(farService.create(actor, { ip: "ip" }, { servicePublicId: "service-21", destination })).rejects.toMatchObject({ message: "error.travel.outside_service_area", statusCode: 422 });
  });

  it.each([
    "error.travel.provider_unconfigured", "error.travel.provider_rate_limited", "error.travel.provider_timeout",
    "error.travel.route_not_found", "error.travel.provider_invalid_response", "error.travel.provider_unavailable"
  ] as const)("preserves the stable provider failure %s", async (errorKey) => {
    const routeProvider = provider();
    routeProvider.getDrivingRoute.mockRejectedValue(new RouteDistanceProviderError(errorKey));
    const service = new RouteEstimateService(createRepository(), routeProvider, { createInput: (input) => input as never }, { estimateTtlSeconds: 600, cacheTtlSeconds: 300 });
    await expect(service.create(actor, { ip: "ip" }, { servicePublicId: "service-21", destination })).rejects.toMatchObject({ message: errorKey });
  });
});
