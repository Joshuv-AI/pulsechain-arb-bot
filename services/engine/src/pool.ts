/**
 * Pool Data Structures
 */

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
  isNative: boolean;
}

export interface Pool {
  id: string;
  address: string;
  dex: 'PulseX' | 'Equalizer' | 'Ionic';
  token0: Token;
  token1: Token;
  reserve0: string;
  reserve1: string;
  fee: number;  // in basis points (e.g., 30 = 0.3%)
  volume24h: number;
  lastUpdated: number;
  
  // Calculated fields
  price0: number;
  price1: number;
  tvl: number;
}

export interface PoolSnapshot {
  poolId: string;
  timestamp: number;
  blockNumber: number;
  reserve0: string;
  reserve1: string;
  price0: number;
  price1: number;
}

export interface PoolTrade {
  poolId: string;
  timestamp: number;
  trader: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
}

/**
 * Calculate price from reserves (assuming token0/token1)
 */
export function calculatePrice(reserve0: string, reserve1: string, decimals0 = 18, decimals1 = 18): number {
  const r0 = parseFloat(reserve0) / Math.pow(10, decimals0);
  const r1 = parseFloat(reserve1) / Math.pow(10, decimals1);
  
  if (r0 === 0) return 0;
  return r1 / r0;
}

/**
 * Calculate TVL in USD (requires price oracle)
 */
export function calculateTVL(reserve0: string, reserve1: string, price0Usd: number, price1Usd: number): number {
  const r0 = parseFloat(reserve0);
  const r1 = parseFloat(reserve1);
  
  return (r0 * price0Usd + r1 * price1Usd) / 1e18;  // Assuming 18 decimals
}

/**
 * Calculate output amount for swap
 */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number
): bigint {
  const amountInWithFee = amountIn * BigInt(10000 - feeBps);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BigInt(10000) + amountInWithFee;
  
  return numerator / denominator;
}

/**
 * Create pool ID from address
 */
export function createPoolId(address: string, dex: string): string {
  return `${dex.toLowerCase()}-${address.toLowerCase()}`;
}
