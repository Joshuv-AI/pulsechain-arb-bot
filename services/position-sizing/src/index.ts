/**
 * Position Sizing Optimizer - Main Interface
 * Maximizes profit by finding optimal trade size
 */

import { 
  findOptimalTradeSize, 
  gridSearchOptimalSize,
  findRiskAdjustedSize,
  kellyCriterion,
  SizeSimulationResult,
  OptimizationResult,
  OptimizerConfig
} from './optimizer';
import { SwapPath } from '../liquidity-graph-engine/src/types';

/**
 * Simulate function for arbitrage paths
 */
export function createArbitrageSimulator(
  path: SwapPath,
  inputTokenPrice: number,  // USD price
  gasPriceGwei: number = 50
) {
  return async (size: number): Promise<SizeSimulationResult> => {
    // Simulate path
    let amount = size;
    
    for (const edge of path.edges) {
      const reserveIn = edge.reserveA;
      const reserveOut = edge.reserveB;
      const feeFactor = 1 - (edge.fee / 10000);
      
      // CPMM formula with slippage
      const amountInFee = amount * feeFactor;
      const output = (amountInFee * reserveOut) / (reserveIn + amountInFee);
      
      amount = output;
    }
    
    const output = amount;
    const profit = output - size;
    
    // Calculate gas cost
    const gasUnits = path.edges.length * 100000;
    const gasCostETH = (gasUnits * gasPriceGwei) / 1e9;
    const gasCostUSD = gasCostETH * 3000; // ~$3000 ETH
    
    const netProfit = profit * inputTokenPrice - gasCostUSD;
    const slippage = size > 0 ? ((size - output / (size / output)) / size * 100) : 0;
    
    return {
      size,
      profit: profit * inputTokenPrice,
      netProfit,
      slippage: Math.abs(slippage),
      viable: netProfit > 0
    };
  };
}

/**
 * Optimize position for an arbitrage opportunity
 */
export async function optimizePosition(
  path: SwapPath,
  options: {
    minSize?: number;
    maxSize?: number;
    minProfitUSD?: number;
    gasPriceGwei?: number;
    method?: 'binary' | 'grid' | 'risk-adjusted';
    riskTolerance?: number;
  } = {}
): Promise<OptimizationResult> {
  const config: OptimizerConfig = {
    minSize: options.minSize || 100,
    maxSize: options.maxSize || 100000,
    minProfitUSD: options.minProfitUSD || 5,
    gasPriceGwei: options.gasPriceGwei || 50,
    iterations: 20
  };
  
  const inputTokenPrice = 1; // Would get from price feed
  const simulateFn = createArbitrageSimulator(path, inputTokenPrice, config.gasPriceGwei);
  
  if (options.method === 'grid') {
    return gridSearchOptimalSize(simulateFn, config.minSize, config.maxSize);
  } else if (options.method === 'risk-adjusted') {
    const result = await findRiskAdjustedSize(simulateFn, config, options.riskTolerance || 0.5);
    return {
      optimalSize: result.optimalSize,
      maxProfit: result.score,
      simulations: []
    };
  }
  
  return findOptimalTradeSize(simulateFn, config);
}

/**
 * Calculate optimal size using Kelly Criterion
 */
export function calculateKellySize(
  bankroll: number,
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  const kelly = kellyCriterion(winRate, avgWin, avgLoss);
  return Math.floor(bankroll * kelly);
}

/**
 * Get recommended size based on risk profile
 */
export function getRecommendedSize(
  opportunity: {
    minSize: number;
    maxSize: number;
    expectedProfit: number;
    confidence: number;
  },
  riskProfile: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): {
  size: number;
  reasoning: string;
} {
  const { minSize, maxSize, expectedProfit, confidence } = opportunity;
  
  let size: number;
  let reasoning: string;
  
  switch (riskProfile) {
    case 'conservative':
      size = minSize;
      reasoning = 'Conservative: Using minimum viable size';
      break;
    
    case 'aggressive':
      size = maxSize;
      reasoning = 'Aggressive: Using maximum size';
      break;
    
    case 'moderate':
    default:
      // Scale by confidence
      const confidenceFactor = confidence; // 0-1
      size = Math.floor(minSize + (maxSize - minSize) * confidenceFactor);
      reasoning = `Moderate: Scaled by ${(confidence * 100).toFixed(0)}% confidence`;
  }
  
  return { size, reasoning };
}

export default {
  optimizePosition,
  createArbitrageSimulator,
  calculateKellySize,
  getRecommendedSize
};
