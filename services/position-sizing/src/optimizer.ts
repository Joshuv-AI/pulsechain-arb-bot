/**
 * Position Sizing Optimizer
 * Finds optimal trade size to maximize profit
 */

import Decimal from 'decimal.js';

// Configure precision
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface SizeSimulationResult {
  size: number;
  profit: number;
  netProfit: number;
  slippage: number;
  viable: boolean;
}

export interface OptimizationResult {
  optimalSize: number;
  maxProfit: number;
  simulations: SizeSimulationResult[];
}

export interface OptimizerConfig {
  minSize: number;
  maxSize: number;
  minProfitUSD: number;
  gasPriceGwei: number;
  iterations: number;
}

/**
 * Calculate slippage for a given size
 */
export function calculateSlippage(
  amountIn: number,
  reserveIn: number,
  reserveOut: number
): number {
  if (reserveIn <= 0 || reserveOut <= 0) return 100;
  
  // CPMM slippage formula
  const ratio = new Decimal(amountIn).div(reserveIn);
  const slippage = ratio.mul(100).toNumber();
  
  return Math.min(slippage, 100);
}

/**
 * Calculate profit after slippage and gas
 */
export function calculateProfitAfterSlippage(
  amountIn: number,
  expectedOutput: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number,
  gasCostUSD: number
): SizeSimulationResult {
  // Calculate actual output with slippage
  const slippage = calculateSlippage(amountIn, reserveIn, reserveOut);
  const slippageFactor = 1 - (slippage / 100);
  
  const actualOutput = expectedOutput * slippageFactor;
  const grossProfit = actualOutput - amountIn;
  const netProfit = grossProfit - gasCostUSD;
  
  return {
    size: amountIn,
    profit: grossProfit,
    netProfit,
    slippage,
    viable: netProfit > 0
  };
}

/**
 * Binary search for optimal trade size
 */
export async function findOptimalTradeSize(
  simulateFn: (size: number) => Promise<SizeSimulationResult>,
  config: OptimizerConfig
): Promise<OptimizationResult> {
  const { minSize, maxSize, iterations } = config;
  
  let bestSize = minSize;
  let bestProfit = -Infinity;
  const simulations: SizeSimulationResult[] = [];
  
  // Binary search
  let low = minSize;
  let high = maxSize;
  
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    
    try {
      const result = await simulateFn(mid);
      simulations.push(result);
      
      if (result.netProfit > bestProfit) {
        bestProfit = result.netProfit;
        bestSize = mid;
      }
      
      // Adjust search range
      if (result.netProfit > config.minProfitUSD) {
        // Can go bigger
        low = mid;
      } else {
        // Need to go smaller
        high = mid;
      }
    } catch (e) {
      // Simulation failed, try smaller size
      high = mid;
    }
  }
  
  // Fine-tune around best
  const fineTuneRange = bestSize * 0.1;
  for (let s = bestSize - fineTuneRange; s <= bestSize + fineTuneRange; s += fineTuneRange / 10) {
    if (s < minSize || s > maxSize) continue;
    
    try {
      const result = await simulateFn(s);
      if (result.netProfit > bestProfit) {
        bestProfit = result.netProfit;
        bestSize = s;
      }
    } catch (e) {
      // Ignore
    }
  }
  
  return {
    optimalSize: Math.round(bestSize),
    maxProfit: bestProfit,
    simulations
  };
}

/**
 * Grid search for optimal size (more thorough but slower)
 */
export async function gridSearchOptimalSize(
  simulateFn: (size: number) => Promise<SizeSimulationResult>,
  minSize: number,
  maxSize: number,
  steps: number = 50
): Promise<OptimizationResult> {
  const simulations: SizeSimulationResult[] = [];
  let bestSize = minSize;
  let bestProfit = -Infinity;
  
  const stepSize = (maxSize - minSize) / steps;
  
  for (let i = 0; i <= steps; i++) {
    const size = minSize + (i * stepSize);
    
    try {
      const result = await simulateFn(size);
      simulations.push(result);
      
      if (result.netProfit > bestProfit) {
        bestProfit = result.netProfit;
        bestSize = size;
      }
    } catch (e) {
      // Simulation failed
    }
  }
  
  return {
    optimalSize: Math.round(bestSize),
    maxProfit: bestProfit,
    simulations
  };
}

/**
 * Find size that maximizes risk-adjusted returns
 */
export async function findRiskAdjustedSize(
  simulateFn: (size: number) => Promise<SizeSimulationResult>,
  config: OptimizerConfig,
  riskTolerance: number = 0.5 // 0 = max profit, 1 = min risk
): Promise<{ optimalSize: number; score: number }> {
  const optimization = await findOptimalTradeSize(simulateFn, config);
  
  // Find size with best risk-adjusted return
  let bestScore = -Infinity;
  let bestSize = optimization.optimalSize;
  
  for (const sim of optimization.simulations) {
    if (!sim.viable) continue;
    
    // Score = profit - (risk * slippage * riskTolerance)
    const score = sim.netProfit - (sim.slippage * riskTolerance * sim.size / 100);
    
    if (score > bestScore) {
      bestScore = score;
      bestSize = sim.size;
    }
  }
  
  return {
    optimalSize: Math.round(bestSize),
    score: bestScore
  };
}

/**
 * Calculate Kelly Criterion for position sizing
 */
export function kellyCriterion(
  winRate: number,      // Probability of winning (0-1)
  avgWin: number,      // Average win amount
  avgLoss: number      // Average loss amount (positive number)
): number {
  if (winRate <= 0 || winRate >= 1 || avgLoss <= 0) {
    return 0;
  }
  
  const b = avgWin / avgLoss; // Odds received
  const p = winRate;
  const q = 1 - p;
  
  // Kelly = (bp - q) / b
  const kelly = (b * p - q) / b;
  
  // Return fraction of Kelly (typically half for safety)
  return Math.max(0, kelly * 0.5);
}

export default {
  findOptimalTradeSize,
  gridSearchOptimalSize,
  findRiskAdjustedSize,
  kellyCriterion,
  calculateSlippage,
  calculateProfitAfterSlippage
};
