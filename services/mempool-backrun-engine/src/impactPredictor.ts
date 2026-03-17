/**
 * Impact Predictor
 * Predicts how a swap will affect pool prices
 */

import { DecodedSwap } from './swapDecoder';
import { PoolEdge } from '../liquidity-graph-engine/src/types';

export interface PriceImpact {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  sizeUSD: number;
  priceBefore: number;
  priceAfter: number;
  impactPercent: number;
  expectedPriceMove: number;
}

export interface ImpactPrediction {
  swap: DecodedSwap;
  impacts: PriceImpact[];
  totalImpact: number;
  predictedDirection: 'up' | 'down' | 'neutral';
  opportunities: string[]; // Tokens with predicted arbitrage
}

/**
 * Calculate price impact on a single pool
 */
export function calculateImpact(
  pool: PoolEdge,
  tokenIn: string,
  amountIn: number
): PriceImpact {
  const isTokenA = pool.tokenA.toLowerCase() === tokenIn.toLowerCase();
  
  const reserveIn = isTokenA ? pool.reserveA : pool.reserveB;
  const reserveOut = isTokenA ? pool.reserveB : pool.reserveA;
  
  // Price before (CPMM)
  const priceBefore = reserveOut / reserveIn;
  
  // Calculate new reserves after trade (including fee)
  const feeFactor = 1 - (pool.fee / 10000);
  const amountInWithFee = amountIn * feeFactor;
  
  const newReserveIn = reserveIn + amountInWithFee;
  const newReserveOut = (reserveIn * reserveOut) / newReserveIn;
  
  // Price after
  const priceAfter = newReserveOut / newReserveIn;
  
  // Impact percentage
  const impactPercent = ((priceAfter - priceBefore) / priceBefore) * 100;
  
  return {
    poolAddress: pool.address,
    tokenIn,
    tokenOut: isTokenA ? pool.tokenB : pool.tokenA,
    sizeUSD: amountIn, // Would convert using price feed
    priceBefore,
    priceAfter,
    impactPercent,
    expectedPriceMove: priceAfter - priceBefore
  };
}

/**
 * Predict impact of a swap across multiple pools
 */
export function predictImpact(
  swap: DecodedSwap,
  pools: PoolEdge[]
): ImpactPrediction {
  const impacts: PriceImpact[] = [];
  
  // For each hop in the swap path
  for (let i = 0; i < swap.path.length - 1; i++) {
    const tokenIn = swap.path[i];
    const tokenOut = swap.path[i + 1];
    
    // Find pools connecting these tokens
    const relevantPools = pools.filter(p => 
      (p.tokenA.toLowerCase() === tokenIn.toLowerCase() && 
       p.tokenB.toLowerCase() === tokenOut.toLowerCase()) ||
      (p.tokenB.toLowerCase() === tokenIn.toLowerCase() && 
       p.tokenA.toLowerCase() === tokenOut.toLowerCase())
    );
    
    // Calculate impact for each pool
    const amountIn = parseFloat(swap.amountIn) / 1e18; // Simplified
    
    for (const pool of relevantPools) {
      const impact = calculateImpact(pool, tokenIn, amountIn);
      impacts.push(impact);
    }
  }
  
  // Calculate total impact (weighted average)
  const totalImpact = impacts.length > 0
    ? impacts.reduce((sum, i) => sum + i.impactPercent, 0) / impacts.length
    : 0;
  
  // Determine predicted direction
  let predictedDirection: 'up' | 'down' | 'neutral' = 'neutral';
  if (totalImpact > 0.5) predictedDirection = 'up';
  else if (totalImpact < -0.5) predictedDirection = 'down';
  
  // Find tokens that might have arbitrage after this trade
  const opportunities: string[] = [];
  for (const impact of impacts) {
    if (Math.abs(impact.impactPercent) > 1) {
      opportunities.push(impact.tokenOut);
    }
  }
  
  return {
    swap,
    impacts,
    totalImpact,
    predictedDirection,
    opportunities: [...new Set(opportunities)]
  };
}

/**
 * Estimate potential profit from predicted price movement
 */
export function estimateBackrunProfit(
  prediction: ImpactPrediction,
  pools: PoolEdge[]
): {
  token: string;
  direction: 'long' | 'short';
  estimatedProfit: number;
  confidence: number;
}[] {
  const results: {
    token: string;
    direction: 'long' | 'short';
    estimatedProfit: number;
    confidence: number;
  }[] = [];
  
  for (const oppToken of prediction.opportunities) {
    // Find pools involving this token
    const tokenPools = pools.filter(p => 
      p.tokenA.toLowerCase() === oppToken.toLowerCase() ||
      p.tokenB.toLowerCase() === oppToken.toLowerCase()
    );
    
    if (tokenPools.length === 0) continue;
    
    // Calculate average impact
    const impacts = prediction.impacts.filter(i => 
      i.tokenOut.toLowerCase() === oppToken.toLowerCase()
    );
    
    if (impacts.length === 0) continue;
    
    const avgImpact = impacts.reduce((sum, i) => sum + i.impactPercent, 0) / impacts.length;
    
    // Estimate profit (simplified)
    const confidence = Math.min(Math.abs(avgImpact) / 5, 1); // Cap at 1
    const estimatedProfit = Math.abs(avgImpact) * 100; // Simplified
    
    results.push({
      token: oppToken,
      direction: avgImpact > 0 ? 'long' : 'short',
      estimatedProfit,
      confidence
    });
  }
  
  return results;
}

/**
 * Check if swap is worth backrunning
 */
export function isWorthBackrunning(
  prediction: ImpactPrediction,
  minImpactPercent: number = 1,
  minProfitUSD: number = 10
): boolean {
  // Check if impact is significant
  if (Math.abs(prediction.totalImpact) < minImpactPercent) {
    return false;
  }
  
  // Check if there are opportunities
  if (prediction.opportunities.length === 0) {
    return false;
  }
  
  // Check total impact
  return true;
}

/**
 * Get backrun priority score
 */
export function getBackrunPriority(
  prediction: ImpactPrediction,
  pools: PoolEdge[]
): number {
  let score = 0;
  
  // Factor 1: Impact magnitude
  score += Math.abs(prediction.totalImpact) * 10;
  
  // Factor 2: Number of opportunities
  score += prediction.opportunities.length * 20;
  
  // Factor 3: Swap size (would need USD value)
  // Simplified: use impact count
  score += prediction.impacts.length * 5;
  
  return score;
}

export default {
  calculateImpact,
  predictImpact,
  estimateBackrunProfit,
  isWorthBackrunning,
  getBackrunPriority
};
