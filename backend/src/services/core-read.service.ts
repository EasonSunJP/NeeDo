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
  ServiceReviewPayload,
  ServiceListInput,
  ShopDetailPayload,
  CustomerProfilePayload,
  TechnicianCardPayload,
  TechnicianDetailPayload
} from "../repositories/core-read.repository";
import type { CustomerProfileViewer } from "../repositories/customer-profile-visibility.repository";
import type { ShopVisibilityViewer } from "../repositories/shop-visibility.repository";
import {
  minimumCandidateDistanceKm,
  rankNearbyTechnicians,
  type Coordinates,
  type NearbyTechnicianCandidate
} from "./nearby-technician-ranking.service";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, normalizePagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import type { SearchQueryRecorderPort } from "./search-query-recorder.service";
import type { ContentLocaleCode } from "../constants/content-locales";

const INITIAL_NEARBY_RADIUS_KM = 3;
const REQUIRED_NEARBY_TECHNICIANS = 3;
const MAX_NEARBY_RADIUS_KM = 20_038;

export class CoreReadService {
  public constructor(
    private readonly repository: CoreReadRepositoryPort,
    private readonly searchQueryRecorder?: SearchQueryRecorderPort
  ) {}

  public listCategories(input: CategoryListInput): Promise<PaginatedResponse<CategoryPayload>> {
    return this.repository.listCategories(input);
  }

  public listServices(input: ServiceListInput, viewer?: ShopVisibilityViewer): Promise<PaginatedResponse<ServiceCardPayload>> {
    return this.repository.listServices(input, viewer);
  }

  public async getServiceDetail(id: number | string, viewer?: ShopVisibilityViewer): Promise<ServiceDetailPayload> {
    const service = await this.repository.findServiceDetail(id, viewer);

    if (!service) {
      throw this.notFoundError("error.service.not_found");
    }

    return service;
  }

  public async listServiceReviews(
    id: number | string,
    input: { page?: number; pageSize?: number },
    viewer?: ShopVisibilityViewer
  ): Promise<PaginatedResponse<ServiceReviewPayload>> {
    const reviews = await this.repository.listServiceReviews(id, input, viewer);

    if (!reviews) {
      throw this.notFoundError("error.service.not_found");
    }

    return reviews;
  }

  public getHomeRecommendations(
    input: HomeRecommendationsInput,
    viewer?: ShopVisibilityViewer
  ): Promise<HomeRecommendationsPayload> {
    return this.repository.getHomeRecommendations(input, viewer);
  }

  public async search(
    input: CoreSearchInput,
    anonymousSessionId?: string,
    viewer?: ShopVisibilityViewer
  ): Promise<CoreSearchResponse> {
    let result: CoreSearchResponse;
    if (input.entityType === "shop") {
      result = await this.repository.searchShops(input, viewer);
    } else if (input.entityType === "technician") {
      if (input.latitude !== undefined && input.longitude !== undefined) {
        result = await this.searchNearbyTechnicians(input, {
          latitude: input.latitude,
          longitude: input.longitude
        }, viewer);
      } else {
        result = await this.repository.searchTechnicians(input, viewer);
      }
    } else {
      result = await this.repository.search(input, viewer);
    }

    if (input.keyword || input.keywords.length > 0) {
      await this.searchQueryRecorder?.recordSuccessfulSearch({
        input,
        resultCount: result.total,
        anonymousSessionId
      });
    }
    return result;
  }

  private async searchNearbyTechnicians(
    input: CoreSearchInput,
    origin: Coordinates,
    viewer?: ShopVisibilityViewer
  ): Promise<PaginatedResponse<TechnicianCardPayload>> {
    const eligibleCount = await this.repository.countEligibleLocatedTechnicians(input, viewer);
    if (eligibleCount === 0) {
      return buildPaginatedResponse([], 0, input);
    }

    let radiusKm = INITIAL_NEARBY_RADIUS_KM;
    let candidates: NearbyTechnicianCandidate[] = [];
    while (radiusKm <= MAX_NEARBY_RADIUS_KM) {
      const boundedCandidates = await this.repository.findEligibleTechniciansWithinBounds(
        input,
        origin,
        radiusKm,
        viewer
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
      radiusKm = Math.min(MAX_NEARBY_RADIUS_KM, radiusKm * 2);
    }

    const ranked = rankNearbyTechnicians(origin, candidates).map((candidate) => ({
      ...candidate,
      resolvedRadiusKm: radiusKm
    }));
    const pagination = normalizePagination(input);
    const start = (pagination.page - 1) * pagination.pageSize;
    const pageCandidates = ranked.slice(start, start + pagination.pageSize);
    const cardsById = await this.repository.loadTechnicianCardsByRankedIds(
      pageCandidates.map(({ technicianProfileId }) => technicianProfileId),
      viewer
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

  public async getShopDetail(id: number | string, locale?: ContentLocaleCode, viewer?: ShopVisibilityViewer): Promise<ShopDetailPayload> {
    const shop = await this.repository.findShopDetail(id, locale, viewer);

    if (!shop) {
      throw this.notFoundError("error.shop.not_found");
    }

    return shop;
  }

  public async getTechnicianDetail(
    id: number | string,
    coordinates: { latitude?: number; longitude?: number } = {},
    viewer?: ShopVisibilityViewer
  ): Promise<TechnicianDetailPayload> {
    const technician = await this.repository.findTechnicianDetail(id, coordinates, viewer);

    if (!technician) {
      throw this.notFoundError("error.technician.not_found");
    }

    return technician;
  }

  public async getCustomerProfile(
    id: number,
    viewer?: CustomerProfileViewer
  ): Promise<CustomerProfilePayload> {
    const customer = await this.repository.findCustomerProfile(id, viewer);

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
