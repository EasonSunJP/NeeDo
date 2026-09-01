import type { NextFunction, Request, Response } from "express";
import type { ShopTaxonomyService } from "../services/shop-taxonomy.service";
import { successResponse } from "../utils/api-response";
import {
  shopTaxonomyCatalogQuerySchema,
  shopTaxonomyCategoryParamSchema
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
}
