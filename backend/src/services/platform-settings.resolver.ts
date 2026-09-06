import { ERROR_CODES } from "../constants/error-codes";
import type {
  PlatformSettingsRecord,
  PlatformSettingsRepositoryPort
} from "../repositories/platform-settings.repository";
import { AppError } from "../utils/app-error";

export class PlatformSettingsResolver {
  private cached: { expiresAt: number; value: PlatformSettingsRecord } | null = null;
  private inFlight: Promise<PlatformSettingsRecord> | null = null;

  public constructor(
    private readonly repository: Pick<PlatformSettingsRepositoryPort, "getActive">,
    private readonly ttlMs = 5_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  public async getActive(): Promise<PlatformSettingsRecord> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.value;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.load();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  public invalidate(): void {
    this.cached = null;
  }

  private async load(): Promise<PlatformSettingsRecord> {
    const value = await this.repository.getActive();
    if (!value) {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_SETTINGS_UNAVAILABLE,
        message: "error.platform_settings.unavailable",
        statusCode: 503
      });
    }
    this.cached = { expiresAt: this.now() + this.ttlMs, value };
    return value;
  }
}
