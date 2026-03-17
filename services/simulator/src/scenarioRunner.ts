import { getAmountOut, simulateSwapIn } from "./cpmm";

export function simulateSinglePathProfit({
  amountIn,
  reserveIn,
  reserveOut,
  sellPriceUSD,
  tokenDecimals = 18,
  feePercent = 0.3
}: {
  amountIn: string;
  reserveIn: string;
  reserveOut: string;
  sellPriceUSD: number;
  tokenDecimals?: number;
  feePercent?: number;
}) {
  const { amountOut } = simulateSwapIn(amountIn, reserveIn, reserveOut, feePercent);
  const proceedsUSD = Number(amountOut) * sellPriceUSD;
  const costUSD = Number(amountIn);
  const profit = proceedsUSD - costUSD;
  return {
    amountOut,
    proceedsUSD,
    costUSD,
    profit
  };
}
