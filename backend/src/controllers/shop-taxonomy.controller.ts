import type { NextFunction, Request, Response } from "express";
import type { ShopTaxonomyService } from "../services/shop-taxonomy.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  shopTaxonomyCatalogQuerySchema,
  shopTaxonomyCategoryParamSchema,
  shopTaxonomyMerchantQuerySchema,
  shopTaxonomyReplaceBodySchema
} from "../validators/shop-taxonomy.validator";

export class ShopTaxonomyController {
  public constructor(private readonly service: ShopTaxonomyService) {}

  public listCategories = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.service.listCategories(shopTaxonomyCatalogQuerySchema.parse(request.query))
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public listKeywords = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = shopTaxonomyCategoryParamSchema.parse(request.params);
      response.status(200).json(
        successResponse(
          await this.service.listKeywords(
            id,
            shopTaxonomyCatalogQuerySchema.parse(request.query)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public getShopTaxonomy = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { locale } = shopTaxonomyMerchantQuerySchema.parse(request.query);
      response.status(200).json(
        successResponse(
          await this.service.getShopTaxonomy(getAuthenticatedAccess(response), locale)
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public replaceShopTaxonomy = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { locale } = shopTaxonomyMerchantQuerySchema.parse(request.query);
      response.status(200).json(
        successResponse(
          await this.service.replaceShopTaxonomy(
            getAuthenticatedAccess(response),
            shopTaxonomyReplaceBodySchema.parse(request.body),
            locale
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
