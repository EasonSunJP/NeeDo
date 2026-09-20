const DEPLOYMENT_VERSION_PATTERN = /^[0-9a-f]{8}$/i;

export function resolveDeploymentVersion(value?: string) {
  const normalized = value?.trim();
  return normalized && DEPLOYMENT_VERSION_PATTERN.test(normalized)
    ? normalized.toLowerCase()
    : "dev";
}

export const deploymentVersionLabel = resolveDeploymentVersion(
  import.meta.env.VITE_DEPLOYMENT_VERSION
);
