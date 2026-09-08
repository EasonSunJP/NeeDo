export function resolveSimulationMessageExpiresAt(input: {
  createdAt: Date;
  seededAt: Date;
  retentionSeconds: number | null;
}): Date | null {
  if (input.retentionSeconds === null) return null;
  const retentionAnchorMs = Math.max(input.createdAt.getTime(), input.seededAt.getTime());
  return new Date(retentionAnchorMs + input.retentionSeconds * 1_000);
}
