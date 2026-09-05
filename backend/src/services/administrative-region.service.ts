import type {
  AdministrativeRegionListItem,
  AdministrativeRegionRepositoryPort
} from "../repositories/administrative-region.repository";
import type { AdministrativeRegionListQuery } from "../validators/administrative-region.validator";

export class AdministrativeRegionService {
  public constructor(private readonly repository: AdministrativeRegionRepositoryPort) {}

  public listChildren(
    input: AdministrativeRegionListQuery
  ): Promise<AdministrativeRegionListItem[]> {
    return this.repository.listChildren(input);
  }
}
