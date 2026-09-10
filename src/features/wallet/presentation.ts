import type { WalletSummary } from "./api";

export function hasTestNdpWallet(summary: WalletSummary): boolean {
  return summary.hasTestNdpWallet;
}

export function formatWalletAmount(value: number): string {
  return value.toLocaleString("en-US");
}
