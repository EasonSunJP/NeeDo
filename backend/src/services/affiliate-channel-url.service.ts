import { isIP } from "node:net";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type AffiliateChannelPlatform = "x" | "instagram" | "youtube" | "tiktok" | "custom";

const PLATFORM_HOSTS: Readonly<Record<Exclude<AffiliateChannelPlatform, "custom">, string[]>> = {
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com"],
  tiktok: ["tiktok.com"]
};

export class AffiliateChannelUrlService {
  public normalize(platform: AffiliateChannelPlatform, homepageUrl: string): string {
    let url: URL;
    try {
      url = new URL(homepageUrl.trim());
    } catch (error) {
      throw this.invalid("error.affiliate_profile.channel_url_invalid", error);
    }

    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      Boolean(url.username) ||
      Boolean(url.password) ||
      this.isPrivateHost(hostname)
    ) {
      throw this.invalid("error.affiliate_profile.channel_url_invalid");
    }

    this.assertPlatformHost(platform, hostname);
    url.hostname = hostname;
    url.hash = "";
    return url.toString();
  }

  private assertPlatformHost(platform: AffiliateChannelPlatform, hostname: string): void {
    if (platform === "custom") return;

    const allowed = PLATFORM_HOSTS[platform];
    if (!allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      throw this.invalid("error.affiliate_profile.channel_domain_invalid");
    }
  }

  private isPrivateHost(hostname: string): boolean {
    const bareHostname = hostname.replace(/^\[/, "").replace(/\]$/, "");
    if (isIP(bareHostname) !== 0) return true;
    if (!bareHostname.includes(".")) return true;

    return ["localhost", ".localhost", ".local", ".internal"].some(
      (suffix) => bareHostname === suffix.replace(/^\./, "") || bareHostname.endsWith(suffix)
    );
  }

  private invalid(message: string, cause?: unknown): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 400,
      cause
    });
  }
}
