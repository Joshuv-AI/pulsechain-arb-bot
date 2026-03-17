/**
 * Opportunity Trigger
 * Checks if predicted price changes create arbitrage opportunities
 */

import { ImpactPrediction, predictImpact, estimateBackrunProfit, isWorthBackrunning, getBackrunPriority } from './impactPredictor';
import { DecodedSwap } from './swapDecoder';
import { PoolEdge, ArbitrageOpportunity } from '../liquidity-graph-engine/src/types';
import { LiquidityGraphEngine } from '../liquidity-graph-engine/src/index';

export interface BackrunOpportunity {
  originalSwap: DecodedSwap;
  prediction: ImpactPrediction;
  arbitragePaths: ArbitrageOpportunity[];
  estimatedProfit: number;
  priority: number;
  timestamp: number;
  shouldExecute: boolean;
  reason: string;
}

export interface TriggerConfig {
  minImpactPercent: number;
  minProfitUSD: number;
  maxLatencyMs: number;
  confidenceThreshold: number;
}

const DEFAULT_CONFIG: TriggerConfig = {
  minImpactPercent: 1,
  minProfitUSD: 10,
  maxLatencyMs: 5000,  // Must execute within 5 seconds
  confidenceThreshold: 0.5
};

/**
 * Check if predicted impact creates arbitrage
 */
export async function triggerArbitrage(
  swap: DecodedSwap,
  pools: PoolEdge[],
  engine: LiquidityGraphEngine,
  config: TriggerConfig = DEFAULT_CONFIG
): Promise<BackrunOpportunity | null> {
  // Predict impact
  const prediction = predictImpact(swap, pools);
  
  // Check if worth backrunning
  if (!isWorthBackrunning(prediction, config.minImpactPercent, config.minProfitUSD)) {
    return null;
  }
  
  // Find arbitrage opportunities after this swap
  const opportunities: ArbitrageOpportunity[] = [];
  
  for (const oppToken of prediction.opportunities) {
    // Run liquidity graph engine for this token
    const paths = engine.getOpportunitiesForPair(
      oppToken,
      swap.path[swap.path.length - 1] // Final token in swap
    );
    
    // Simulate each path
    for (const path of paths.slice(0, 5)) {
      const result = engine.simulateCustomPath(path.tokens, 1000);
      if ('error' in result) continue;
      
      if (result.netProfit >= config.minProfitUSD) {
        opportunities.push({
          id: `backrun-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          path,
          inputToken: oppToken,
          outputToken: swap.path[swap.path.length - 1],
          inputAmount: result.inputAmount,
          expectedOutput: result.outputAmount,
          profit: result.grossProfit,
          profitPercent: result.profitPercent,
          gasEstimate: path.edges.length * 100000,
          netProfit: result.netProfit,
          timestamp: Date.now()
        });
      }
    }
  }
  
  // Calculate priority
  const priority = getBackrunPriority(prediction, pools);
  
  // Estimate profit
  const estimatedProfit = estimateBackrunProfit(prediction, pools)
    .reduce((sum, e) => sum + e.estimatedProfit, 0);
  
  const shouldExecute = 
    opportunities.length > 0 && 
    priority > 50 &&
    estimatedProfit >= config.minProfitUSD;
  
  return {
    originalSwap: swap,
    prediction,
    arbitragePaths: opportunities.sort((a, b) => b.netProfit - a.netProfit),
    estimatedProfit,
    priority,
    timestamp: Date.now(),
    shouldExecute,
    reason: shouldExecute 
      ? `Impact ${prediction.totalImpact.toFixed(2)}% creates ${opportunities.length} arb paths`
      : `Impact ${prediction.totalImpact.toFixed(2)}% below threshold`
  };
}

/**
 * Batch process multiple swaps
 */
export async function processSwapBatch(
  swaps: DecodedSwap[],
  pools: PoolEdge[],
  engine: LiquidityGraphEngine,
  config: TriggerConfig = DEFAULT_CONFIG
): Promise<BackrunOpportunity[]> {
  const results: BackrunOpportunity[] = [];
  
  for (const swap of swaps) {
    const result = await triggerArbitrage(swap, pools, engine, config);
    if (result && result.shouldExecute) {
      results.push(result);
    }
  }
  
  // Sort by priority
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * Filter high-value triggers
 */
export function filterHighValueTriggers(
  opportunities: BackrunOpportunity[],
  thresholds: {
    minProfitUSD?: number;
    minImpact?: number;
    minPriority?: number;
  } = {}
): BackrunOpportunity[] {
  return opportunities.filter(opp => {
    if (thresholds.minProfitUSD && opp.estimatedProfit < thresholds.minProfitUSD) {
      return false;
    }
    if (thresholds.minImpact && Math.abs(opp.prediction.totalImpact) < thresholds.minImpact) {
      return false;
    }
    if (thresholds.minPriority && opp.priority < thresholds.minPriority) {
      return false;
    }
    return true;
  });
}

/**
 * Get the best opportunity from a list
 */
export function getBestOpportunity(
  opportunities: BackrunOpportunity[]
): BackrunOpportunity | null {
  if (opportunities.length === 0) return null;
  
  // Sort by priority * estimatedProfit
  return opportunities.reduce((best, current) => {
    const bestScore = best.priority * best.estimatedProfit;
    const currentScore = current.priority * current.estimatedProfit;
    return currentScore > bestScore ? current : best;
  });
}

export default {
  triggerArbitrage,
  processSwapBatch,
  filterHighValueTriggers,
  getBestOpportunity,
  DEFAULT_CONFIG
};
