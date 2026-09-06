import type { ReleasePublicationRepositoryPort } from "../repositories/release-publication.repository";
import type { ReleaseTimelineQuery } from "../domain/release-publication";
import type { AuthenticatedAccessContext } from "./auth.service";
import { assertActivePlatformIdentity } from "./platform-identity-scope";
export class ReleasePublicationService {
  constructor(
    private readonly repository: ReleasePublicationRepositoryPort,
    private readonly environment: string
  ) {}
  async list(actor: AuthenticatedAccessContext, query: ReleaseTimelineQuery) {
    assertActivePlatformIdentity(actor);
    return this.repository.list(this.environment, query);
  }
}
