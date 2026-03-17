/**
 * Liquidity Graph Engine Types
 */

export type TokenAddress = string;

export interface PoolEdge {
  dex: string;
  tokenA: TokenAddress;
  tokenB: TokenAddress;
  reserveA: number;
  reserveB: number;
  fee: number;        // in basis points (e.g., 30 = 0.3%)
  address: string;    // pool contract address
}

export interface LiquidityGraph {
  nodes: Set<TokenAddress>;
  edges: Map<TokenAddress, PoolEdge[]>;
}

export interface SwapPath {
  tokens: TokenAddress[];
  edges: PoolEdge[];
}

export interface ArbitrageOpportunity {
  id: string;
  path: SwapPath;
  inputToken: TokenAddress;
  outputToken: TokenAddress;
  inputAmount: number;
  expectedOutput: number;
  profit: number;
  profitPercent: number;
  gasEstimate: number;
  netProfit: number;
  timestamp: number;
}

export interface GraphConfig {
  maxPathLength: number;
  minProfitUSD: number;
  tokensToScan: TokenAddress[];
  dexsToScan: string[];
}
