export interface PrepaymentAllocationQuote {
  id: number;
  quoteAmountJpy: number;
}

export interface PrepaymentAllocation {
  id: number;
  amountJpy: number;
}

export function assertPrepaymentPercent(percent: number): void {
  if (!Number.isInteger(percent) || (percent !== 0 && (percent < 10 || percent > 100))) {
    throw new Error("invalid_prepayment_percent");
  }
}

export function calculateRequiredPrepaymentJpy(baseAmountJpy: number, percent: number): number {
  if (!Number.isSafeInteger(baseAmountJpy) || baseAmountJpy < 0) {
    throw new Error("invalid_base_amount");
  }
  assertPrepaymentPercent(percent);
  return Math.ceil(baseAmountJpy * percent / 100);
}

export function allocatePrepaymentJpy(
  totalJpy: number,
  quotes: PrepaymentAllocationQuote[]
): PrepaymentAllocation[] {
  if (!Number.isSafeInteger(totalJpy) || totalJpy < 0) throw new Error("invalid_allocation_total");
  const identifiers = new Set<number>();
  for (const quote of quotes) {
    if (!Number.isSafeInteger(quote.id) || quote.id <= 0) throw new Error("invalid_allocation_subject");
    if (identifiers.has(quote.id)) throw new Error("duplicate_allocation_subject");
    identifiers.add(quote.id);
    if (!Number.isSafeInteger(quote.quoteAmountJpy) || quote.quoteAmountJpy <= 0) {
      throw new Error("invalid_quote_amount");
    }
  }
  if (quotes.length === 0) return [];

  const quoteTotal = quotes.reduce((sum, quote) => sum + quote.quoteAmountJpy, 0);
  if (!Number.isSafeInteger(quoteTotal)) throw new Error("invalid_quote_total");
  const cappedTotal = Math.min(totalJpy, quoteTotal);
  const denominator = BigInt(quoteTotal);
  const allocations = quotes.map((quote, index) => {
    const numerator = BigInt(cappedTotal) * BigInt(quote.quoteAmountJpy);
    return {
      id: quote.id,
      index,
      amountJpy: Number(numerator / denominator),
      remainder: numerator % denominator
    };
  });
  const remainderJpy = cappedTotal - allocations.reduce((sum, allocation) => sum + allocation.amountJpy, 0);
  const remainderOrder = [...allocations].sort((left, right) => {
    if (left.remainder === right.remainder) return left.id - right.id;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remainderJpy; index += 1) remainderOrder[index].amountJpy += 1;
  return allocations.sort((left, right) => left.index - right.index).map(({ id, amountJpy }) => ({ id, amountJpy }));
}
