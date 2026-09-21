import type { BackofficePreferenceRepositoryPort } from "../repositories/backoffice-preference.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface BackofficeTestNdpPreferencePayload {
  showTestNdpData: boolean;
  source: "explicit" | "environment_default";
}

export class BackofficePreferenceService {
  public constructor(
    private readonly repository: BackofficePreferenceRepositoryPort,
    private readonly deployEnvironment: "local" | "test" | "staging" | "prod"
  ) {}

  public async getEffective(userId: number): Promise<BackofficeTestNdpPreferencePayload> {
    const preference = await this.repository.findByUserId(userId);
    return preference
      ? { showTestNdpData: preference.showTestNdpData, source: "explicit" }
      : { showTestNdpData: this.deployEnvironment !== "prod", source: "environment_default" };
  }

  public async update(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: { showTestNdpData: boolean }
  ): Promise<BackofficeTestNdpPreferencePayload> {
    const preference = await this.repository.update({
      userId: actor.userId,
      showTestNdpData: input.showTestNdpData,
      context
    });
    return { showTestNdpData: preference.showTestNdpData, source: "explicit" };
  }
}
