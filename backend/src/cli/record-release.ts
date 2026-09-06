import { env } from "../config/env";
import { prisma } from "../prisma/client";
import { prepareReleasePublication } from "../domain/release-publication";
import { ReleasePublicationRepository } from "../repositories/release-publication.repository";

async function main() {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 32 * 1024 * 1024) throw new Error("release.evidence_too_large");
    chunks.push(buffer);
  }
  const input = prepareReleasePublication(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (input.environment !== env.DEPLOY_ENV) throw new Error("release.environment_mismatch");
  const result = await new ReleasePublicationRepository().publish(input);
  process.stdout.write(
    JSON.stringify({ publicationId: result.id, replayed: result.replayed }) + "\n"
  );
}
void main()
  .catch(() => {
    process.stderr.write("release.publication_failed\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
