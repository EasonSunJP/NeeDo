import type { ContentMediaRepositoryPort } from "./content-media.service";
import type { ContentMediaStoragePort } from "./content-media.storage";

// One day permits a draft to be resumed while bounding abandoned public uploads.
export const EXCHANGE_PENDING_COVER_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 50;

export interface PendingContentMedia {
  id: number;
  checksumSha256: string;
  url: string;
}

export interface ContentMediaPurgeRepositoryPort extends ContentMediaRepositoryPort {
  listDuePendingCovers(input: { now: Date; limit: number; afterId?: number }): Promise<PendingContentMedia[]>;
  claimPendingCoverPurge(candidate: PendingContentMedia, now: Date): Promise<boolean>;
  hasContentMediaReferences(candidate: PendingContentMedia): Promise<boolean>;
  completePendingCoverPurge(candidate: PendingContentMedia, now: Date): Promise<void>;
}

export class ContentMediaPurgeService {
  private cursor = 0;
  public constructor(
    private readonly repository: ContentMediaPurgeRepositoryPort,
    private readonly storage: Pick<ContentMediaStoragePort, "delete">
  ) {}

  public async purgeDue(input: { now: Date }): Promise<{ purged: number; failed: number }> {
    const result = { purged: 0, failed: 0 };
    let candidates = await this.repository.listDuePendingCovers({ now: input.now, limit: DEFAULT_BATCH_SIZE, afterId: this.cursor });
    if (candidates.length === 0 && this.cursor > 0) {
      this.cursor = 0;
      candidates = await this.repository.listDuePendingCovers({ now: input.now, limit: DEFAULT_BATCH_SIZE, afterId: 0 });
    }
    for (const candidate of candidates) {
      try {
        await this.repository.withChecksumLock(candidate.checksumSha256, async () => {
          const match = /^\/media\/content\/([a-f0-9]{64}\.(?:jpg|png|webp))$/u.exec(candidate.url);
          if (!match || !match[1]!.startsWith(`${candidate.checksumSha256}.`)) throw new Error("Invalid pending content-media path");
          // Commit a durable retirement before touching the file. Publication competes
          // for the same pending row; failed deletion/completion never reopens it.
          if (!await this.repository.claimPendingCoverPurge(candidate, input.now)) return;
          if (!await this.repository.hasContentMediaReferences(candidate)) await this.storage.delete(match[1]!);
          await this.repository.completePendingCoverPurge(candidate, input.now);
          result.purged += 1;
        });
      } catch {
        result.failed += 1;
      }
      // Advance past failed rows too; an unavailable file must not starve later uploads.
      this.cursor = candidate.id;
    }
    return result;
  }
}
