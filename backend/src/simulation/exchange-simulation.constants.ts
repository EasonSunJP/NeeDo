export const EXCHANGE_SIMULATION_NAMESPACE = "needo_exchange_simulation:";
export const EXCHANGE_SIMULATION_DEFAULT_SEED = "needo-exchange-2026-08-30";

export const LEGACY_EXCHANGE_SIMULATION_NAMESPACES = [
  "needo_exchange_mock:",
  "needo_exchange_seed:",
  "needo_exchange_simulation_v1:"
] as const;

export const EXCHANGE_SIMULATION_COUNTS = {
  demandPosts: 20,
  intelligencePosts: 20,
  comments: { minimum: 3, maximum: 10 },
  likes: { minimum: 10, maximum: 66 },
  shares: { minimum: 2, maximum: 15 }
} as const;
