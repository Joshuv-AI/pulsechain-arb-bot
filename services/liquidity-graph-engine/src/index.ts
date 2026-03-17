/**
 * Main Liquidity Graph Engine
 * Discovers arbitrage opportunities across the entire liquidity network
 */

import { buildGraph, getGraphStats } from './graphBuilder';
import { findCycles, findAllPaths, filterByHopCount, deduplicateCycles } from './pathFinder';
import { filterByDex, sortByLiquidity, getCycleStats } from './cycleDetector';
import { simulatePath, calculatePathProfit, findOptimalAmount, simulateWithSlippage } from './pathSimulator';
import { 
  PoolEdge, 
  LiquidityGraph, 
  SwapPath, 
  ArbitrageOpportunity, 
  GraphConfig,
  TokenAddress 
} from './types';

// Default config for pDAI strategy
const DEFAULT_CONFIG: GraphConfig = {
  maxPathLength: 4,
  minProfitUSD: 5,
  tokensToScan: [
    '0x...', // pDAI - VERIFY
    '0x...', // WPLS - VERIFY  
    '0x...', // USDC - VERIFY
    '0x...', // DAI - VERIFY
    '0x...'  // WBTC - VERIFY
  ],
  dexsToScan: ['PulseX', '9inch', '9mm']
};

export class LiquidityGraphEngine {
  private graph: LiquidityGraph;
  private config: GraphConfig;
  private pools: PoolEdge[] = [];

  constructor(config: Partial<GraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.graph = {
      nodes: new Set(),
      edges: new Map()
    };
  }

  /**
   * Update pools from scanner
   */
  updatePools(pools: PoolEdge[]): void {
    this.pools = pools;
    this.graph = buildGraph(pools);
  }

  /**
   * Add a single pool
   */
  addPool(pool: PoolEdge): void {
    this.pools.push(pool);
    
    if (!this.graph.nodes.has(pool.tokenA)) {
      this.graph.nodes.add(pool.tokenA);
      this.graph.edges.set(pool.tokenA, []);
    }
    if (!this.graph.nodes.has(pool.tokenB)) {
      this.graph.nodes.add(pool.tokenB);
      this.graph.edges.set(pool.tokenB, []);
    }

    this.graph.edges.get(pool.tokenA)!.push(pool);
    this.graph.edges.get(pool.tokenB)!.push(pool);
  }

  /**
   * Discover all arbitrage opportunities
   */
  discoverOpportunities(inputAmount: number = 1000): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const token of this.config.tokensToScan) {
      // Skip if token not in graph
      if (!this.graph.nodes.has(token)) continue;

      // Find all cycles starting from this token
      const cycles = findCycles(this.graph, token, this.config.maxPathLength);
      
      // Filter and deduplicate
      const validCycles = deduplicateCycles(cycles);
      const filtered = filterByHopCount(validCycles, 2, this.config.maxPathLength);

      // Filter by DEX if configured
      let dexFiltered = filtered;
      if (this.config.dexsToScan.length > 0) {
        dexFiltered = filtered.filter(cycle => 
          this.config.dexsToScan.some(dex => 
            cycle.edges.some(edge => edge.dex.toLowerCase() === dex.toLowerCase())
          )
        );
      }

      // Sort by liquidity
      const sorted = sortByLiquidity(dexFiltered);

      // Simulate each cycle
      for (const cycle of sorted) {
        const profitInfo = calculatePathProfit(cycle, inputAmount, 0);

        if (profitInfo.netProfit >= this.config.minProfitUSD) {
          // Find optimal amount
          const optimal = findOptimalAmount(cycle, 100000, this.config.minProfitUSD);
          const optimalProfit = calculatePathProfit(cycle, optimal.optimalAmount, 0);

          opportunities.push({
            id: `arb-${token.slice(0, 6)}-${Date.now()}`,
            path: cycle,
            inputToken: token,
            outputToken: token,
            inputAmount: optimal.optimalAmount,
            expectedOutput: optimalProfit.outputAmount,
            profit: optimalProfit.grossProfit,
            profitPercent: optimalProfit.profitPercent,
            gasEstimate: cycle.edges.length * 100000,
            netProfit: optimalProfit.netProfit,
            timestamp: Date.now()
          });
        }
      }
    }

    // Sort by profit
    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * Get opportunities for a specific token pair
   */
  getOpportunitiesForPair(tokenA: TokenAddress, tokenB: TokenAddress): SwapPath[] {
    return findAllPaths(this.graph, tokenA, this.config.maxPathLength)
      .filter(path => path.tokens.includes(tokenB));
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      ...getGraphStats(this.graph),
      poolsLoaded: this.pools.length,
      config: this.config
    };
  }

  /**
   * Get all discovered cycles (for debugging)
   */
  getAllCycles(): SwapPath[] {
    const allCycles: SwapPath[] = [];

    for (const token of this.config.tokensToScan) {
      if (this.graph.nodes.has(token)) {
        const cycles = findCycles(this.graph, token, this.config.maxPathLength);
        allCycles.push(...cycles);
      }
    }

    return deduplicateCycles(allCycles);
  }

  /**
   * Simulate a specific path
   */
  simulateCustomPath(tokens: TokenAddress[], inputAmount: number) {
    // Build path from tokens
    const edges: PoolEdge[] = [];
    
    for (let i = 0; i < tokens.length - 1; i++) {
      const fromToken = tokens[i];
      const toToken = tokens[i + 1];
      
      // Find pool connecting these tokens
      const pools = this.graph.edges.get(fromToken) || [];
      const pool = pools.find(p => 
        p.tokenA === toToken || p.tokenB === toToken
      );
      
      if (pool) {
        edges.push(pool);
      }
    }

    if (edges.length !== tokens.length - 1) {
      return { error: 'Path not found in graph' };
    }

    const path: SwapPath = { tokens, edges };
    return calculatePathProfit(path, inputAmount, 0);
  }
}

/**
 * Run the liquidity graph engine with pools
 */
export function runLiquidityGraphEngine(
  pools: PoolEdge[],
  config: Partial<GraphConfig> = {}
): ArbitrageOpportunity[] {
  const engine = new LiquidityGraphEngine(config);
  engine.updatePools(pools);
  return engine.discoverOpportunities();
}

export default LiquidityGraphEngine;
