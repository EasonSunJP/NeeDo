import { ERROR_CODES } from "../constants/error-codes";
import type {
  CategoryListInput,
  CategoryPayload,
  CoreReadRepositoryPort,
  CoreSearchInput,
  CoreSearchResponse,
  HomeRecommendationsInput,
  HomeRecommendationsPayload,
  ServiceCardPayload,
  ServiceDetailPayload,
  ServiceListInput,
  ShopDetailPayload,
  CustomerProfilePayload,
  TechnicianCardPayload,
  TechnicianDetailPayload
} from "../repositories/core-read.repository";
import {
  minimumCandidateDistanceKm,
  rankNearbyTechnicians,
  type Coordinates,
  type NearbyTechnicianCandidate
} from "./nearby-technician-ranking.service";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, normalizePagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";

const INITIAL_NEARBY_RADIUS_KM = 3;
const REQUIRED_NEARBY_TECHNICIANS = 3;
const MAX_NEARBY_RADIUS_KM = 20_038;

export class CoreReadService {
  public constructor(private readonly repository: CoreReadRepositoryPort) {}

  public listCategories(input: CategoryListInput): Promise<PaginatedResponse<CategoryPayload>> {
    return this.repository.listCategories(input);
  }

  public listServices(input: ServiceListInput): Promise<PaginatedResponse<ServiceCardPayload>> {
    return this.repository.listServices(input);
  }

  public async getServiceDetail(id: number | string): Promise<ServiceDetailPayload> {
    const service = await this.repository.findServiceDetail(id);

    if (!service) {
      throw this.notFoundError("error.service.not_found");
    }

    return service;
  }

  public getHomeRecommendations(
    input: HomeRecommendationsInput
  ): Promise<HomeRecommendationsPayload> {
    return this.repository.getHomeRecommendations(input);
  }

  public search(input: CoreSearchInput): Promise<CoreSearchResponse> {
    if (input.entityType === "shop") {
      return this.repository.searchShops(input);
    }
    if (input.entityType === "technician") {
      if (input.latitude !== undefined && input.longitude !== undefined) {
        return this.searchNearbyTechnicians(input, {
          latitude: input.latitude,
          longitude: input.longitude
        });
      }
      return this.repository.searchTechnicians(input);
    }

    return this.repository.search(input);
  }

  private async searchNearbyTechnicians(
    input: CoreSearchInput,
    origin: Coordinates
  ): Promise<PaginatedResponse<TechnicianCardPayload>> {
    const eligibleCount = await this.repository.countEligibleLocatedTechnicians(input);
    if (eligibleCount === 0) {
      return buildPaginatedResponse([], 0, input);
    }

    let radiusKm = INITIAL_NEARBY_RADIUS_KM;
    let candidates: NearbyTechnicianCandidate[] = [];
    while (radiusKm <= MAX_NEARBY_RADIUS_KM) {
      const boundedCandidates = await this.repository.findEligibleTechniciansWithinBounds(
        input,
        origin,
        radiusKm
      );
      candidates = boundedCandidates.filter((candidate) => {
        const distanceKm = minimumCandidateDistanceKm(origin, candidate.locations);
        return distanceKm !== null && distanceKm <= radiusKm;
      });
      if (
        candidates.length >= REQUIRED_NEARBY_TECHNICIANS ||
        candidates.length >= eligibleCount ||
        radiusKm === MAX_NEARBY_RADIUS_KM
      ) {
        break;
      }
      radiusKm += 1;
    }

    const ranked = rankNearbyTechnicians(origin, candidates).map((candidate) => ({
      ...candidate,
      resolvedRadiusKm: radiusKm
    }));
    const pagination = normalizePagination(input);
    const start = (pagination.page - 1) * pagination.pageSize;
    const pageCandidates = ranked.slice(start, start + pagination.pageSize);
    const cardsById = await this.repository.loadTechnicianCardsByRankedIds(
      pageCandidates.map(({ technicianProfileId }) => technicianProfileId)
    );
    const cards = pageCandidates.flatMap((candidate) => {
      const card = cardsById.get(candidate.technicianProfileId);
      return card
        ? [
            {
              ...card,
              distanceKm: candidate.distanceKm,
              nearbyRank: candidate.nearbyRank,
              resolvedRadiusKm: candidate.resolvedRadiusKm
            }
          ]
        : [];
    });

    return buildPaginatedResponse(cards, ranked.length, pagination);
  }

  public async getShopDetail(id: number | string): Promise<ShopDetailPayload> {
    const shop = await this.repository.findShopDetail(id);

    if (!shop) {
      throw this.notFoundError("error.shop.not_found");
    }

    return shop;
  }

  public async getTechnicianDetail(id: number | string): Promise<TechnicianDetailPayload> {
    const technician = await this.repository.findTechnicianDetail(id);

    if (!technician) {
      throw this.notFoundError("error.technician.not_found");
    }

    return technician;
  }

  public async getCustomerProfile(id: number): Promise<CustomerProfilePayload> {
    const customer = await this.repository.findCustomerProfile(id);

    if (!customer) {
      throw this.notFoundError("error.customer_profile.not_found");
    }

    return customer;
  }

  private notFoundError(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message,
      statusCode: 404
    });
  }
}
