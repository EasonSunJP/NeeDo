import { z } from "zod";

const revision = z.string().regex(/^[0-9a-f]{40}$/u);
const commit = z
  .object({ revision, summary: z.string().trim().min(1).max(2000), parents: z.array(revision) })
  .strict();
export const releaseManifestSchema = z
  .object({ sourceRevision: revision, commits: z.array(commit).min(1).max(100000) })
  .strict();
export const releaseTimelineQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10)
  })
  .strict();
export type ReleaseTimelineQuery = z.infer<typeof releaseTimelineQuerySchema>;
const evidenceSchema = z
  .object({
    deploymentId: z.string().uuid(),
    environment: z.enum(["local", "test", "staging", "prod"]),
    sourceRevision: revision,
    previousRevision: revision.nullable(),
    publishedAt: z.string().datetime(),
    current: releaseManifestSchema,
    previous: releaseManifestSchema.nullable()
  })
  .strict();
export const releasePublicationSchema = z
  .object({
    deploymentId: z.string().uuid(),
    environment: z.enum(["local", "test", "staging", "prod"]),
    sourceRevision: revision,
    previousRevision: revision.nullable(),
    version: z.string().min(1).max(100),
    publishedAt: z.string().datetime(),
    kind: z.enum(["release", "rollback", "baseline", "redeploy"]),
    changes: z.array(z.string().min(1).max(2000)).min(1).max(10000)
  })
  .strict();
export type ReleasePublicationInput = z.infer<typeof releasePublicationSchema>;
export type ReleasePublicationItem = ReleasePublicationInput & { id: number };

export function prepareReleasePublication(
  value: unknown,
  now = new Date()
): ReleasePublicationInput {
  const input = evidenceSchema.parse(value);
  if (
    input.current.sourceRevision !== input.sourceRevision ||
    input.current.commits[0].revision !== input.sourceRevision ||
    (input.previous && input.previous.sourceRevision !== input.previousRevision) ||
    new Date(input.publishedAt) > now
  ) {
    throw new Error("release.publication_evidence_mismatch");
  }
  const previousIds = new Set(input.previous?.commits.map((item) => item.revision) ?? []);
  const currentById = new Map(input.current.commits.map((item) => [item.revision, item]));
  // Older deployment bundles may predate manifests; their recorded revision still defines the boundary.
  if (!input.previous && input.previousRevision && currentById.has(input.previousRevision)) {
    const pending = [input.previousRevision];
    while (pending.length) {
      const id = pending.pop()!;
      if (previousIds.has(id)) continue;
      const item = currentById.get(id);
      if (!item) throw new Error("release.incomplete_ancestry");
      previousIds.add(id);
      pending.push(...item.parents);
    }
  }
  const kind =
    input.previousRevision === input.sourceRevision
      ? "redeploy"
      : previousIds.size === 0
        ? "baseline"
        : previousIds.has(input.sourceRevision)
          ? "rollback"
          : "release";
  const changed =
    kind === "release"
      ? input.current.commits.filter(
          (item) => !previousIds.has(item.revision) && item.parents.length < 2
        )
      : [];
  return releasePublicationSchema.parse({
    deploymentId: input.deploymentId,
    environment: input.environment,
    sourceRevision: input.sourceRevision,
    previousRevision: input.previousRevision,
    version: input.sourceRevision.slice(0, 12),
    publishedAt: input.publishedAt,
    kind,
    changes: (changed.length ? changed : [input.current.commits[0]]).map((item) => item.summary)
  });
}
