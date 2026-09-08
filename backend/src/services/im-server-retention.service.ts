import type {
  DueImMedia,
  ImServerRetentionRepositoryPort
} from "../repositories/im-server-retention.repository";
import type { ImMediaStoragePort } from "./im-media.storage";

export class ImServerRetentionService {
  public constructor(
    private readonly repository: ImServerRetentionRepositoryPort,
    private readonly storage: Pick<ImMediaStoragePort, "remove">
  ) {}

  public async purgeDue(input: { now: Date; batchSize: number }) {
    const take = Math.min(Math.max(input.batchSize, 1), 100);
    const [messages, media] = await Promise.all([
      this.repository.listDueMessages({ now: input.now, take }),
      this.repository.listDueMedia({ now: input.now, take })
    ]);
    const summary = {
      scanned: messages.length + media.length,
      messagesPurged: 0,
      mediaPurged: 0,
      failed: 0
    };

    for (const candidate of messages) {
      try {
        if (await this.repository.purgeMessage({ candidate, now: input.now })) {
          summary.messagesPurged += 1;
        }
      } catch {
        summary.failed += 1;
      }
    }
    for (const candidate of media) {
      try {
        await this.storage.remove(this.fileKey(candidate));
        if (
          await this.repository.markMediaPurged({
            id: candidate.id,
            purgeAt: candidate.purgeAt,
            now: input.now
          })
        ) {
          summary.mediaPurged += 1;
        }
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  }

  private fileKey(candidate: DueImMedia): string {
    const pathname = new URL(candidate.url, "https://needo.invalid").pathname;
    const match = /^\/media\/im\/([a-f0-9]{64}\.(?:jpg|png|webp))$/u.exec(pathname);
    if (!match) throw new Error("invalid IM media URL");
    return match[1];
  }
}
