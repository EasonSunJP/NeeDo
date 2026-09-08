import { httpClient } from "./httpClient";
export type ReleasePublication = {
  id: number;
  deploymentId: string;
  environment: "local" | "test" | "staging" | "prod";
  version: string;
  sourceRevision: string | null;
  previousRevision: string | null;
  kind: "release" | "rollback" | "baseline" | "redeploy";
  publishedAt: string;
  changes: string[];
  origin: "deployment" | "manual" | "backfill";
  lockVersion: number;
};
export type ReleasePublicationPage = {
  list: ReleasePublication[];
  total: number;
  page: number;
  page_size: number;
};
export type ReleasePublicationFilters = { from?: string; to?: string };
export type ManualReleaseCommand = {
  deploymentId: string;
  version: string;
  sourceRevision?: string | null;
  publishedAt: string;
  changes: string[];
  reason: string;
};
export type EditReleaseCommand = {
  version: string;
  changes: string[];
  reason: string;
  expectedVersion: number;
};
const isRelease = (row: ReleasePublication) =>
  Number.isSafeInteger(row.id) &&
  row.id > 0 &&
  /^[0-9a-f-]{36}$/.test(row.deploymentId) &&
  typeof row.version === "string" &&
  ["release", "rollback", "baseline", "redeploy"].includes(row.kind) &&
  ["local", "test", "staging", "prod"].includes(row.environment) &&
  ["deployment", "manual", "backfill"].includes(row.origin) &&
  Number.isSafeInteger(row.lockVersion) &&
  row.lockVersion > 0 &&
  (row.sourceRevision === null || /^[0-9a-f]{40}$/.test(row.sourceRevision)) &&
  (row.previousRevision === null || /^[0-9a-f]{40}$/.test(row.previousRevision)) &&
  Number.isFinite(Date.parse(row.publishedAt)) &&
  Array.isArray(row.changes) &&
  row.changes.length > 0 &&
  row.changes.every((text) => typeof text === "string" && text.length > 0);
export const releasePublicationsApi = {
  async list(
    page: number,
    pageSize: number,
    filters: ReleasePublicationFilters = {},
    signal?: AbortSignal,
  ): Promise<ReleasePublicationPage> {
    const result = await httpClient.request<ReleasePublicationPage>(
      "/backoffice/releases",
      { query: { page, pageSize, ...filters }, signal },
    );
    if (
      result.page !== page ||
      result.page_size !== pageSize ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      !Array.isArray(result.list) ||
      result.list.length > pageSize ||
      result.list.some((row) => !isRelease(row))
    )
      throw new Error("release.invalid_response");
    return result;
  },
  async createManual(
    command: ManualReleaseCommand,
  ): Promise<ReleasePublication> {
    const result = await httpClient.request<ReleasePublication>(
      "/backoffice/releases",
      { method: "POST", body: command },
    );
    if (!isRelease(result)) throw new Error("release.invalid_response");
    return result;
  },
  async edit(
    id: number,
    command: EditReleaseCommand,
  ): Promise<ReleasePublication> {
    const result = await httpClient.request<ReleasePublication>(
      `/backoffice/releases/${id}`,
      { method: "PATCH", body: command },
    );
    if (!isRelease(result)) throw new Error("release.invalid_response");
    return result;
  },
};
