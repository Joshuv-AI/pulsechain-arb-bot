/**
 * Mint/Redeem Analyzer
 * Analyzes pDAI mint and redeem events to calculate price impact
 */

import { PoolEvent, PoolInfo } from './poolMonitor';
import { BigNumber } from 'ethers';

export interface MintRedeemEvent {
  type: 'mint' | 'redeem';
  user: string;
  pDAIAmount: BigNumber;
  collateralAmount: BigNumber; // Token received/paid
  collateralToken: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface PriceImpact {
  poolAddress: string;
  token: string;
  previousReserve: BigNumber;
  newReserve: BigNumber;
  previousPrice: number;
  newPrice: number;
  impactPercent: number;
  direction: 'up' | 'down';
}

export interface ImbalanceAnalysis {
  events: MintRedeemEvent[];
  totalMinted: BigNumber;
  totalRedeemed: BigNumber;
  netFlow: BigNumber;
  priceImpacts: PriceImpact[];
  timestamp: number;
}

/**
 * Parse mint event data
 */
export function parseMintEvent(log: any): MintRedeemEvent | null {
  try {
    // The Mint event typically has:
    // Mint(address indexed minter, uint256 mintAmount, uint256 collateralAmount)
    
    return {
      type: 'mint',
      user: log.minter || log.user || '',
      pDAIAmount: BigNumber.from(log.mintAmount || log.mint_amount || 0),
      collateralAmount: BigNumber.from(log.collateralAmount || log.collateral_amount || 0),
      collateralToken: log.collateralToken || log.collateral_token || 'UNKNOWN',
      timestamp: log.timestamp || Date.now(),
      blockNumber: log.blockNumber || 0,
      txHash: log.transactionHash || log.tx_hash || ''
    };
  } catch (e) {
    return null;
  }
}

/**
 * Parse redeem event data
 */
export function parseRedeemEvent(log: any): MintRedeemEvent | null {
  try {
    // The Redeem event typically has:
    // Redeem(address indexed redeemer, uint256 redeemAmount, uint256 collateralAmount)
    
    return {
      type: 'redeem',
      user: log.redeemer || log.user || '',
      pDAIAmount: BigNumber.from(log.redeemAmount || log.redeem_amount || 0),
      collateralAmount: BigNumber.from(log.collateralAmount || log.collateral_amount || 0),
      collateralToken: log.collateralToken || log.collateral_token || 'UNKNOWN',
      timestamp: log.timestamp || Date.now(),
      blockNumber: log.blockNumber || 0,
      txHash: log.transactionHash || log.tx_hash || ''
    };
  } catch (e) {
    return null;
  }
}

/**
 * Calculate price impact from reserves
 */
export function calculatePriceImpact(
  reserveBefore: BigNumber,
  reserveAfter: BigNumber,
  tokenInPool: boolean = true
): PriceImpact {
  const reserveBeforeNum = parseFloat(reserveBefore.toString());
  const reserveAfterNum = parseFloat(reserveAfter.toString());
  
  if (reserveBeforeNum === 0) {
    return {
      poolAddress: '',
      token: '',
      previousReserve: reserveBefore,
      newReserve: reserveAfter,
      previousPrice: 0,
      newPrice: 0,
      impactPercent: 0,
      direction: 'up'
    };
  }
  
  // Simplified price calculation (would need token prices for accurate USD conversion)
  const previousPrice = 1; // Assume stable
  const newPrice = (reserveBeforeNum / reserveAfterNum);
  
  const impactPercent = ((newPrice - previousPrice) / previousPrice) * 100;
  
  return {
    poolAddress: '',
    token: '',
    previousReserve: reserveBefore,
    newReserve: reserveAfter,
    previousPrice,
    newPrice,
    impactPercent,
    direction: impactPercent > 0 ? 'up' : 'down'
  };
}

/**
 * Analyze swap event for price impact
 */
export function analyzeSwapEvent(
  event: PoolEvent,
  pool: PoolInfo
): PriceImpact | null {
  const { data } = event;
  
  // Determine if token0 or token1 changed
  let reserve0Change = BigNumber.from(0);
  let reserve1Change = BigNumber.from(0);
  
  if (data.amount0In.gt(0)) {
    reserve0Change = reserve0Change.add(data.amount0In);
  }
  if (data.amount0Out.gt(0)) {
    reserve0Change = reserve0Change.sub(data.amount0Out);
  }
  if (data.amount1In.gt(0)) {
    reserve1Change = reserve1Change.add(data.amount1In);
  }
  if (data.amount1Out.gt(0)) {
    reserve1Change = reserve1Change.sub(data.amount1Out);
  }
  
  // Calculate impact for pDAI
  const isToken0pDAI = pool.token0.toLowerCase().includes('pdai');
  const isToken1pDAI = pool.token1.toLowerCase().includes('pdai');
  
  if (!isToken0pDAI && !isToken1pDAI) {
    return null; // Not a pDAI pool
  }
  
  const pDAIToken = isToken0pDAI ? pool.token0 : pool.token1;
  const otherToken = isToken0pDAI ? pool.token1 : pool.token0;
  
  const pDAIReserveBefore = isToken0pDAI ? pool.reserve0 : pool.reserve1;
  const otherReserveBefore = isToken0pDAI ? pool.reserve1 : pool.reserve0;
  
  const pDAIChange = isToken0pDAI ? reserve0Change : reserve1Change;
  
  const pDAIReserveAfter = pDAIReserveBefore.add(pDAIChange);
  
  return {
    poolAddress: pool.address,
    token: pDAIToken,
    previousReserve: pDAIReserveBefore,
    newReserve: pDAIReserveAfter,
    previousPrice: parseFloat(otherReserveBefore.toString()) / parseFloat(pDAIReserveBefore.toString()),
    newPrice: parseFloat(otherReserveBefore.toString()) / parseFloat(pDAIReserveAfter.toString()),
    impactPercent: 0, // Would calculate
    direction: pDAIChange.gt(0) ? 'up' : 'down'
  };
}

/**
 * Analyze sync event (reserve update)
 */
export function analyzeSyncEvent(
  event: PoolEvent,
  pool: PoolInfo,
  previousPool: PoolInfo
): PriceImpact[] {
  const impacts: PriceImpact[] = [];
  
  // Check if token0 is pDAI
  if (pool.token0.toLowerCase().includes('pdai')) {
    const prevPrice = previousPool.reserve1 / previousPool.reserve0;
    const newPrice = pool.reserve1 / pool.reserve0;
    const impactPercent = ((newPrice - prevPrice) / prevPrice) * 100;
    
    impacts.push({
      poolAddress: pool.address,
      token: pool.token0,
      previousReserve: previousPool.reserve0,
      newReserve: pool.reserve0,
      previousPrice: prevPrice,
      newPrice,
      impactPercent,
      direction: impactPercent > 0 ? 'up' : 'down'
    });
  }
  
  return impacts;
}

/**
 * Batch analyze events
 */
export function analyzeEvents(
  events: PoolEvent[],
  pools: Map<string, PoolInfo>
): ImbalanceAnalysis {
  const mintRedeemEvents: MintRedeemEvent[] = [];
  let totalMinted = BigNumber.from(0);
  let totalRedeemed = BigNumber.from(0);
  const priceImpacts: PriceImpact[] = [];
  
  for (const event of events) {
    const pool = pools.get(event.poolAddress);
    if (!pool) continue;
    
    if (event.eventType === 'swap') {
      const impact = analyzeSwapEvent(event, pool);
      if (impact) {
        priceImpacts.push(impact);
      }
    }
  }
  
  // Calculate net flow
  const netFlow = totalMinted.sub(totalRedeemed);
  
  return {
    events: mintRedeemEvents,
    totalMinted,
    totalRedeemed,
    netFlow,
    priceImpacts,
    timestamp: Date.now()
  };
}

/**
 * Check if impact exceeds threshold
 */
export function isSignificantImpact(
  impact: PriceImpact,
  minImpactPercent: number = 1
): boolean {
  return Math.abs(impact.impactPercent) >= minImpactPercent;
}

/**
 * Get direction recommendation
 */
export function getDirectionRecommendation(impacts: PriceImpact[]): {
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reasoning: string;
} {
  if (impacts.length === 0) {
    return {
      direction: 'neutral',
      confidence: 0,
      reasoning: 'No significant impacts detected'
    };
  }
  
  // Average impact direction
  const avgImpact = impacts.reduce((sum, i) => sum + i.impactPercent, 0) / impacts.length;
  
  if (avgImpact > 1) {
    return {
      direction: 'long', // pDAI will go up
      confidence: Math.min(Math.abs(avgImpact) / 10, 1),
      reasoning: `Average impact ${avgImpact.toFixed(2)}% suggests upward pressure`
    };
  } else if (avgImpact < -1) {
    return {
      direction: 'short', // pDAI will go down
      confidence: Math.min(Math.abs(avgImpact) / 10, 1),
      reasoning: `Average impact ${avgImpact.toFixed(2)}% suggests downward pressure`
    };
  }
  
  return {
    direction: 'neutral',
    confidence: 0,
    reasoning: 'Impact too small to determine direction'
  };
}

export default {
  parseMintEvent,
  parseRedeemEvent,
  calculatePriceImpact,
  analyzeSwapEvent,
  analyzeSyncEvent,
  analyzeEvents,
  isSignificantImpact,
  getDirectionRecommendation
};
