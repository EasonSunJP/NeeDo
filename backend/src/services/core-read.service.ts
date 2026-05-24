import { ERROR_CODES } from "../constants/error-codes";
import type {
  CategoryListInput,
  CategoryPayload,
  CoreReadRepositoryPort,
  HomeRecommendationsInput,
  HomeRecommendationsPayload,
  ServiceCardPayload,
  ServiceDetailPayload,
  ServiceListInput,
  ShopDetailPayload,
  TechnicianDetailPayload,
  CustomerProfilePayload
} from "../repositories/core-read.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";

export class CoreReadService {
  public constructor(private readonly repository: CoreReadRepositoryPort) {}

  public listCategories(input: CategoryListInput): Promise<PaginatedResponse<CategoryPayload>> {
    return this.repository.listCategories(input);
  }

  public listServices(input: ServiceListInput): Promise<PaginatedResponse<ServiceCardPayload>> {
    return this.repository.listServices(input);
  }

  public async getServiceDetail(id: number): Promise<ServiceDetailPayload> {
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

  public search(input: ServiceListInput): Promise<PaginatedResponse<ServiceCardPayload>> {
    return this.repository.search(input);
  }

  public async getShopDetail(id: number): Promise<ShopDetailPayload> {
    const shop = await this.repository.findShopDetail(id);

    if (!shop) {
      throw this.notFoundError("error.shop.not_found");
    }

    return shop;
  }

  public async getTechnicianDetail(id: number): Promise<TechnicianDetailPayload> {
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
