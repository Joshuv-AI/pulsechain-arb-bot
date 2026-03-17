/**
 * Mempool Backrun Engine
 * Watches pending swaps, predicts impact, executes arbitrage
 */

import { providers } from 'ethers';
import { MempoolListener, PendingTransaction } from './mempoolListener';
import { decodeSwap, DecodedSwap, filterSwaps, isRelevantSwap } from './swapDecoder';
import { predictImpact, isWorthBackrunning } from './impactPredictor';
import { triggerArbitrage, BackrunOpportunity, DEFAULT_CONFIG, getBestOpportunity } from './opportunityTrigger';
import { PoolEdge } from '../liquidity-graph-engine/src/types';
import { LiquidityGraphEngine } from '../liquidity-graph-engine/src/index';

export interface BackrunEngineConfig {
  rpcUrl: string;
  monitoredTokens: string[];
  monitoredRouters: string[];
  minSwapValueUSD: number;
  minImpactPercent: number;
  minProfitUSD: number;
  maxConcurrent: number;
}

const DEFAULT_ENGINE_CONFIG: BackrunEngineConfig = {
  rpcUrl: process.env.RPC_PULSECHAIN || 'https://rpc.pulsechain.com',
  monitoredTokens: [
    '0x...', // pDAI - VERIFY
    '0x...', // WPLS - VERIFY
    '0x...', // USDC - VERIFY
    '0x...', // DAI - VERIFY
    '0x...', // WBTC - VERIFY
  ],
  monitoredRouters: [
    '0x...', // PulseX - VERIFY
    '0x...', // 9inch - VERIFY
    '0x...', // 9mm - VERIFY
  ],
  minSwapValueUSD: 5000,
  minImpactPercent: 1,
  minProfitUSD: 10,
  maxConcurrent: 3
};

export class MempoolBackrunEngine {
  private config: BackrunEngineConfig;
  private provider: providers.JsonRpcProvider;
  private listener: MempoolListener;
  private liquidityEngine: LiquidityGraphEngine;
  private pools: PoolEdge[] = [];
  private active = false;
  private opportunities: BackrunOpportunity[] = [];
  private executionCallback?: (opp: BackrunOpportunity) => void | Promise<void>;

  constructor(
    liquidityEngine: LiquidityGraphEngine,
    config: Partial<BackrunEngineConfig> = {}
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.provider = new providers.JsonRpcProvider(this.config.rpcUrl);
    this.listener = new MempoolListener(this.provider, {
      addressesOfInterest: this.config.monitoredRouters
    });
    this.liquidityEngine = liquidityEngine;
  }

  /**
   * Update pools from scanner
   */
  updatePools(pools: PoolEdge[]): void {
    this.pools = pools;
    this.liquidityEngine.updatePools(pools);
  }

  /**
   * Set callback for when opportunity is found
   */
  onOpportunity(callback: (opp: BackrunOpportunity) => void | Promise<void>): void {
    this.executionCallback = callback;
  }

  /**
   * Start the backrun engine
   */
  start(): void {
    if (this.active) return;
    this.active = true;

    console.log('🚀 Starting Mempool Backrun Engine...');

    this.listener.start(async (tx: PendingTransaction) => {
      try {
        // Decode swap
        const swap = decodeSwap(tx);
        
        if (!swap) return;
        
        // Check if relevant
        if (!isRelevantSwap(swap)) return;

        // Filter by criteria
        const filtered = filterSwaps([swap], {
          minValueUSD: this.config.minSwapValueUSD,
          routers: this.config.monitoredRouters,
          tokens: this.config.monitoredTokens
        });

        if (filtered.length === 0) return;

        console.log(`📊 Detected swap: ${swap.path.join(' → ')}`);

        // Predict impact
        const prediction = predictImpact(swap, this.pools);

        // Check if worth backrunning
        if (!isWorthBackrunning(prediction, this.config.minImpactPercent, this.config.minProfitUSD)) {
          return;
        }

        // Find arbitrage opportunities
        const opp = await triggerArbitrage(swap, this.pools, this.liquidityEngine, {
          ...DEFAULT_CONFIG,
          minProfitUSD: this.config.minProfitUSD,
          minImpactPercent: this.config.minImpactPercent
        });

        if (opp && opp.shouldExecute) {
          console.log(`🎯 BACKRUN OPPORTUNITY: ${opp.reason}`);
          console.log(`   Profit: $${opp.estimatedProfit.toFixed(2)}`);
          console.log(`   Priority: ${opp.priority}`);

          this.opportunities.push(opp);

          // Execute callback
          if (this.executionCallback) {
            await this.executionCallback(opp);
          }
        }

      } catch (error) {
        console.error('Error processing mempool tx:', error);
      }
    });

    console.log('✅ Mempool Backrun Engine started');
  }

  /**
   * Stop the engine
   */
  stop(): void {
    this.active = false;
    this.listener.stop();
    console.log('🛑 Mempool Backrun Engine stopped');
  }

  /**
   * Get current opportunities
   */
  getOpportunities(): BackrunOpportunity[] {
    return this.opportunities;
  }

  /**
   * Get the best opportunity
   */
  getBestOpportunity(): BackrunOpportunity | null {
    return getBestOpportunity(this.opportunities);
  }

  /**
   * Clear opportunities
   */
  clearOpportunities(): void {
    this.opportunities = [];
  }

  /**
   * Check if active
   */
  isActive(): boolean {
    return this.active;
  }
}

/**
 * Simple function to start backrun engine
 */
export function startBackrunEngine(
  provider: providers.JsonRpcProvider,
  pools: PoolEdge[],
  liquidityEngine: LiquidityGraphEngine,
  onOpportunity?: (opp: BackrunOpportunity) => void
): MempoolBackrunEngine {
  const engine = new MempoolBackrunEngine(liquidityEngine);
  engine.updatePools(pools);
  
  if (onOpportunity) {
    engine.onOpportunity(onOpportunity);
  }
  
  engine.start();
  
  return engine;
}

export default MempoolBackrunEngine;
