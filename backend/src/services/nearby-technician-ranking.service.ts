export type Coordinates = { latitude: number; longitude: number };

export type NearbyTechnicianCandidate = {
  technicianProfileId: number;
  locations: Coordinates[];
  ratingAverage: string | null;
  completedOrderCount: number;
  reviewCount: number;
  registeredAt: Date;
};

export type RankedNearbyTechnician = NearbyTechnicianCandidate & {
  distanceKm: number;
  nearbyRank: 1 | 2 | 3 | null;
  resolvedRadiusKm: number;
};

const EARTH_RADIUS_KM = 6_371.0088;
const INITIAL_RADIUS_KM = 3;
const REQUIRED_RANKED_TECHNICIANS = 3;

const isValidCoordinates = (coordinates: Coordinates): boolean =>
  Number.isFinite(coordinates.latitude) &&
  Number.isFinite(coordinates.longitude) &&
  coordinates.latitude >= -90 &&
  coordinates.latitude <= 90 &&
  coordinates.longitude >= -180 &&
  coordinates.longitude <= 180;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const haversineDistanceKm = (from: Coordinates, to: Coordinates): number => {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    return Number.NaN;
  }
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
};

export const minimumCandidateDistanceKm = (
  origin: Coordinates,
  locations: Coordinates[]
): number | null => {
  if (!isValidCoordinates(origin)) {
    return null;
  }
  const distances = locations
    .filter(isValidCoordinates)
    .map((location) => haversineDistanceKm(origin, location))
    .filter((distance) => Number.isFinite(distance));
  return distances.length === 0 ? null : Math.min(...distances);
};

export const resolveNearbyRadius = (candidateDistancesKm: number[]): number => {
  const eligibleDistances = candidateDistancesKm
    .filter((distance) => Number.isFinite(distance) && distance >= 0)
    .sort((left, right) => left - right);
  if (eligibleDistances.length === 0) {
    return INITIAL_RADIUS_KM;
  }
  const thresholdIndex = Math.min(REQUIRED_RANKED_TECHNICIANS, eligibleDistances.length) - 1;
  return Math.max(INITIAL_RADIUS_KM, Math.ceil(eligibleDistances[thresholdIndex]));
};

const numericRating = (rating: string | null): number => {
  const value = rating === null ? 0 : Number(rating);
  return Number.isFinite(value) ? value : 0;
};

const registeredTime = (registeredAt: Date): number => {
  const value = registeredAt.getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

export const rankNearbyTechnicians = (
  origin: Coordinates,
  candidates: NearbyTechnicianCandidate[]
): RankedNearbyTechnician[] => {
  const withDistances = candidates.flatMap((candidate) => {
    const distanceKm = minimumCandidateDistanceKm(origin, candidate.locations);
    return distanceKm === null ? [] : [{ candidate, distanceKm }];
  });
  const resolvedRadiusKm = resolveNearbyRadius(withDistances.map(({ distanceKm }) => distanceKm));
  return withDistances
    .filter(({ distanceKm }) => distanceKm <= resolvedRadiusKm)
    .sort(
      (left, right) =>
        numericRating(right.candidate.ratingAverage) -
          numericRating(left.candidate.ratingAverage) ||
        right.candidate.completedOrderCount - left.candidate.completedOrderCount ||
        right.candidate.reviewCount - left.candidate.reviewCount ||
        registeredTime(left.candidate.registeredAt) -
          registeredTime(right.candidate.registeredAt) ||
        left.candidate.technicianProfileId - right.candidate.technicianProfileId
    )
    .map(({ candidate, distanceKm }, index) => ({
      ...candidate,
      distanceKm,
      nearbyRank: index < REQUIRED_RANKED_TECHNICIANS ? ((index + 1) as 1 | 2 | 3) : null,
      resolvedRadiusKm
    }));
};
