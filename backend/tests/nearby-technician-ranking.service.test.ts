import {
  haversineDistanceKm,
  minimumCandidateDistanceKm,
  rankNearbyTechnicians,
  resolveNearbyRadius,
  type Coordinates,
  type NearbyTechnicianCandidate
} from "../src/services/nearby-technician-ranking.service";

const origin: Coordinates = { latitude: 35.681236, longitude: 139.767125 };

const northOfOrigin = (distanceKm: number): Coordinates => ({
  latitude: origin.latitude + distanceKm / 111.195,
  longitude: origin.longitude
});

const candidate = (
  technicianProfileId: number,
  distanceKm: number,
  overrides: Partial<NearbyTechnicianCandidate> = {}
): NearbyTechnicianCandidate => ({
  technicianProfileId,
  locations: [northOfOrigin(distanceKm)],
  ratingAverage: "4.8",
  completedOrderCount: 100,
  reviewCount: 20,
  registeredAt: new Date(`2026-01-${String(technicianProfileId).padStart(2, "0")}T00:00:00Z`),
  ...overrides
});

describe("nearby technician ranking policy", () => {
  it("computes Haversine distance and selects the nearest valid candidate location", () => {
    expect(haversineDistanceKm(origin, northOfOrigin(1))).toBeCloseTo(1, 2);
    expect(
      minimumCandidateDistanceKm(origin, [
        northOfOrigin(2.4),
        { latitude: Number.NaN, longitude: 139.7 },
        northOfOrigin(0.8)
      ])
    ).toBeCloseTo(0.8, 2);
    expect(minimumCandidateDistanceKm(origin, [])).toBeNull();
    expect(minimumCandidateDistanceKm(origin, [{ latitude: 91, longitude: 139.7 }])).toBeNull();
  });

  it("expands from 3 km to 4 km when the third eligible technician is 3.6 km away", () => {
    const ranked = rankNearbyTechnicians(origin, [
      candidate(1, 1),
      candidate(2, 2),
      candidate(3, 3.6),
      candidate(4, 3.8, { ratingAverage: "5.0" }),
      candidate(5, 4.2)
    ]);

    expect(resolveNearbyRadius([1, 2, 3.6, 3.8, 4.2])).toBe(4);
    expect(ranked).toHaveLength(4);
    expect(ranked.every((item) => item.resolvedRadiusKm === 4)).toBe(true);
    expect(ranked.map((item) => item.technicianProfileId)).toEqual([4, 1, 2, 3]);
    expect(ranked.map((item) => item.nearbyRank)).toEqual([1, 2, 3, null]);
  });

  it("stops at 3 km when at least three eligible technicians are already inside", () => {
    const ranked = rankNearbyTechnicians(origin, [
      candidate(1, 0.5),
      candidate(2, 1.5),
      candidate(3, 2.5),
      candidate(4, 3.1, { ratingAverage: "5.0" })
    ]);

    expect(ranked).toHaveLength(3);
    expect(ranked.every((item) => item.resolvedRadiusKm === 3)).toBe(true);
    expect(ranked.map((item) => item.technicianProfileId)).toEqual([1, 2, 3]);
  });

  it("returns available ranks when fewer than three valid candidates exist globally", () => {
    const ranked = rankNearbyTechnicians(origin, [
      candidate(1, 2),
      candidate(2, 5.2),
      candidate(3, 1, { locations: [] }),
      candidate(4, 1, { locations: [{ latitude: 35, longitude: 181 }] })
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked.every((item) => item.resolvedRadiusKm === 6)).toBe(true);
    expect(ranked.map((item) => item.nearbyRank)).toEqual([1, 2]);
  });

  it("sorts by rating, completed orders, reviews, registration, then profile ID", () => {
    const registeredEarly = new Date("2025-01-01T00:00:00Z");
    const registeredLate = new Date("2026-01-01T00:00:00Z");
    const ranked = rankNearbyTechnicians(origin, [
      candidate(7, 1, {
        ratingAverage: "4.9",
        completedOrderCount: 20,
        reviewCount: 100,
        registeredAt: registeredLate
      }),
      candidate(6, 1, {
        ratingAverage: "4.9",
        completedOrderCount: 20,
        reviewCount: 100,
        registeredAt: registeredEarly
      }),
      candidate(5, 1, {
        ratingAverage: "4.9",
        completedOrderCount: 20,
        reviewCount: 100,
        registeredAt: registeredEarly
      }),
      candidate(4, 1, {
        ratingAverage: "4.9",
        completedOrderCount: 20,
        reviewCount: 101
      }),
      candidate(3, 1, {
        ratingAverage: "4.9",
        completedOrderCount: 21,
        reviewCount: 1
      }),
      candidate(2, 1, {
        ratingAverage: "5.0",
        completedOrderCount: 1,
        reviewCount: 1
      }),
      candidate(1, 1, {
        ratingAverage: null,
        completedOrderCount: 999,
        reviewCount: 999
      })
    ]);

    expect(ranked.map((item) => item.technicianProfileId)).toEqual([2, 3, 4, 5, 6, 7, 1]);
    expect(ranked.slice(0, 3).map((item) => item.nearbyRank)).toEqual([1, 2, 3]);
    expect(ranked.slice(3).every((item) => item.nearbyRank === null)).toBe(true);
  });
});
