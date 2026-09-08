import type { ReleasePublicationRepositoryPort } from "../repositories/release-publication.repository";
import type {
  EditReleaseInput,
  ManualReleaseInput,
  ReleaseTimelineQuery
} from "../domain/release-publication";
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
  async createManual(actor: AuthenticatedAccessContext, input: ManualReleaseInput) {
    assertActivePlatformIdentity(actor);
    return this.repository.createManual(this.environment, actor.userId, input);
  }
  async edit(actor: AuthenticatedAccessContext, id: number, input: EditReleaseInput) {
    assertActivePlatformIdentity(actor);
    return this.repository.edit(this.environment, actor.userId, id, input);
  }
}
