/**
 * Opportunity Trigger
 * Triggers arbitrage when pDAI imbalance exceeds threshold
 */

import { PoolEvent, PoolInfo } from './poolMonitor';
import { PriceImpact, analyzeSwapEvent, isSignificantImpact, getDirectionRecommendation } from './mintRedeemAnalyzer';
import { LiquidityGraphEngine } from '../liquidity-graph-engine/src/index';
import { ArbitrageOpportunity } from '../liquidity-graph-engine/src/types';

export interface ImbalanceOpportunity {
  id: string;
  type: 'mint' | 'redeem' | 'swap' | 'sync';
  poolAddress: string;
  impacts: PriceImpact[];
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  arbOpportunities: ArbitrageOpportunity[];
  estimatedProfit: number;
  timestamp: number;
  shouldExecute: boolean;
  reason: string;
}

export interface TriggerConfig {
  minImpactPercent: number;
  minProfitUSD: number;
  maxLatencyMs: number;
  autoExecute: boolean;
}

const DEFAULT_CONFIG: TriggerConfig = {
  minImpactPercent: 1,  // 1% price move triggers
  minProfitUSD: 10,
  maxLatencyMs: 5000,
  autoExecute: false
};

/**
 * Detect arbitrage opportunities from pool events
 */
export function detectArbFromEvent(
  event: PoolEvent,
  pool: PoolInfo,
  previousPool: PoolInfo | null,
  pools: Map<string, PoolInfo>,
  engine: LiquidityGraphEngine,
  config: TriggerConfig = DEFAULT_CONFIG
): ImbalanceOpportunity | null {
  // Analyze the event
  let impacts: PriceImpact[] = [];
  
  if (event.eventType === 'swap') {
    const impact = analyzeSwapEvent(event, pool);
    if (impact) {
      impacts.push(impact);
    }
  }
  
  // Check if any impact is significant
  const significantImpacts = impacts.filter(i => 
    isSignificantImpact(i, config.minImpactPercent)
  );
  
  if (significantImpacts.length === 0) {
    return null;
  }
  
  // Get direction recommendation
  const recommendation = getDirectionRecommendation(significantImpacts);
  
  // Find arbitrage opportunities
  const arbOpportunities: ArbitrageOpportunity[] = [];
  
  // Run liquidity graph engine for tokens affected
  const affectedTokens = significantImpacts.map(i => i.token);
  
  for (const token of affectedTokens) {
    const opportunities = engine.discoverOpportunities(1000);
    
    // Filter for relevant opportunities
    const relevant = opportunities.filter(opp => 
      opp.inputToken.toLowerCase() === token.toLowerCase() ||
      opp.outputToken.toLowerCase() === token.toLowerCase()
    );
    
    arbOpportunities.push(...relevant.slice(0, 3));
  }
  
  // Sort by profit
  arbOpportunities.sort((a, b) => b.netProfit - a.netProfit);
  
  const estimatedProfit = arbOpportunities.reduce((sum, opp) => sum + opp.netProfit, 0);
  
  const shouldExecute = 
    arbOpportunities.length > 0 &&
    estimatedProfit >= config.minProfitUSD &&
    recommendation.confidence >= 0.3;
  
  return {
    id: `imbalance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: event.eventType as any,
    poolAddress: pool.address,
    impacts: significantImpacts,
    direction: recommendation.direction,
    confidence: recommendation.confidence,
    arbOpportunities,
    estimatedProfit,
    timestamp: Date.now(),
    shouldExecute,
    reason: shouldExecute
      ? `${significantImpacts.length} significant impact(s), estimated profit $${estimatedProfit.toFixed(2)}`
      : `Impact ${significantImpacts[0].impactPercent.toFixed(2)}% below threshold or insufficient confidence`
  };
}

/**
 * Batch process multiple events
 */
export function processEventBatch(
  events: PoolEvent[],
  pools: Map<string, PoolInfo>,
  engine: LiquidityGraphEngine,
  config: TriggerConfig = DEFAULT_CONFIG
): ImbalanceOpportunity[] {
  const opportunities: ImbalanceOpportunity[] = [];
  const poolMap = new Map<string, PoolInfo>();
  
  // Build pool map for lookup
  for (const pool of pools.values()) {
    poolMap.set(pool.address, pool);
  }
  
  // Track previous pool state (simplified)
  const previousPools = new Map<string, PoolInfo>();
  
  for (const event of events) {
    const currentPool = poolMap.get(event.poolAddress);
    const previousPool = previousPools.get(event.poolAddress);
    
    if (!currentPool) continue;
    
    const opp = detectArbFromEvent(event, currentPool, previousPool || null, poolMap, engine, config);
    
    if (opp && opp.shouldExecute) {
      opportunities.push(opp);
    }
    
    // Update previous state
    previousPools.set(event.poolAddress, { ...currentPool });
  }
  
  return opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);
}

/**
 * Filter high-value opportunities
 */
export function filterHighValueOpportunities(
  opportunities: ImbalanceOpportunity[],
  thresholds: {
    minProfitUSD?: number;
    minImpact?: number;
    minConfidence?: number;
  } = {}
): ImbalanceOpportunity[] {
  return opportunities.filter(opp => {
    if (thresholds.minProfitUSD && opp.estimatedProfit < thresholds.minProfitUSD) {
      return false;
    }
    
    if (thresholds.minImpact) {
      const maxImpact = Math.max(...opp.impacts.map(i => Math.abs(i.impactPercent)));
      if (maxImpact < thresholds.minImpact) {
        return false;
      }
    }
    
    if (thresholds.minConfidence && opp.confidence < thresholds.minConfidence) {
      return false;
    }
    
    return true;
  });
}

/**
 * Get the best opportunity
 */
export function getBestOpportunity(
  opportunities: ImbalanceOpportunity[]
): ImbalanceOpportunity | null {
  if (opportunities.length === 0) return null;
  
  // Score = profit * confidence
  return opportunities.reduce((best, current) => {
    const bestScore = best.estimatedProfit * best.confidence;
    const currentScore = current.estimatedProfit * current.confidence;
    return currentScore > bestScore ? current : best;
  });
}

/**
 * Format opportunity for logging
 */
export function formatOpportunity(opp: ImbalanceOpportunity): string {
  return `
🎯 Imbalance Opportunity Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pool: ${opp.poolAddress.slice(0, 10)}...
Type: ${opp.type.toUpperCase()}
Direction: ${opp.direction.toUpperCase()}
Confidence: ${(opp.confidence * 100).toFixed(0)}%
Est. Profit: $${opp.estimatedProfit.toFixed(2)}
${opp.arbOpportunities.length} arb paths found
Reason: ${opp.reason}
`.trim();
}

export default {
  detectArbFromEvent,
  processEventBatch,
  filterHighValueOpportunities,
  getBestOpportunity,
  formatOpportunity,
  DEFAULT_CONFIG
};
