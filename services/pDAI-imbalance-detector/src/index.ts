/**
 * pDAI Imbalance Detector
 * Monitors pDAI mint/redeem events and triggers arbitrage
 */

import { providers } from 'ethers';
import { PoolMonitor, PoolEvent, PoolInfo, PoolCallback } from './poolMonitor';
import { detectArbFromEvent, ImbalanceOpportunity, DEFAULT_CONFIG, formatOpportunity } from './opportunityTrigger';
import { LiquidityGraphEngine } from '../liquidity-graph-engine/src/index';

export interface pDAIImbalanceConfig {
  rpcUrl: string;
  pDAIAddress: string;
  poolsToMonitor: string[];
  minImpactPercent: number;
  minProfitUSD: number;
  onOpportunity?: (opp: ImbalanceOpportunity) => void | Promise<void>;
}

const DEFAULT_PDAI_CONFIG: pDAIImbalanceConfig = {
  rpcUrl: process.env.RPC_PULSECHAIN || 'https://rpc.pulsechain.com',
  pDAIAddress: '0x...', // VERIFY
  poolsToMonitor: [
    '0x...', // pDAI/WPLS - VERIFY
    '0x...', // pDAI/DAI - VERIFY
    '0x...', // pDAI/USDC - VERIFY
  ],
  minImpactPercent: 1,
  minProfitUSD: 10
};

export class pDAIImbalanceDetector {
  private config: pDAIImbalanceConfig;
  private provider: providers.JsonRpcProvider;
  private monitor: PoolMonitor;
  private liquidityEngine: LiquidityGraphEngine;
  private pools: Map<string, PoolInfo> = new Map();
  private active = false;
  private opportunities: ImbalanceOpportunity[] = [];

  constructor(
    liquidityEngine: LiquidityGraphEngine,
    config: Partial<pDAIImbalanceConfig> = {}
  ) {
    this.config = { ...DEFAULT_PDAI_CONFIG, ...config };
    this.provider = new providers.JsonRpcProvider(this.config.rpcUrl);
    this.monitor = new PoolMonitor(this.provider);
    this.liquidityEngine = liquidityEngine;
  }

  /**
   * Start the detector
   */
  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;

    console.log('🚀 Starting pDAI Imbalance Detector...');

    // Add pools to monitor
    for (const poolAddress of this.config.poolsToMonitor) {
      await this.monitor.addPool(poolAddress);
    }

    // Setup event callback
    this.monitor.onEvent(async (event: PoolEvent, pool: PoolInfo) => {
      // Store previous state
      const previousPool = this.pools.get(pool.address);

      // Update current state
      this.pools.set(pool.address, pool);

      // Detect arbitrage opportunity
      const opp = detectArbFromEvent(
        event,
        pool,
        previousPool || null,
        this.pools,
        this.liquidityEngine,
        {
          ...DEFAULT_CONFIG,
          minImpactPercent: this.config.minImpactPercent,
          minProfitUSD: this.config.minProfitUSD
        }
      );

      if (opp && opp.shouldExecute) {
        console.log(formatOpportunity(opp));

        this.opportunities.push(opp);

        // Call custom handler
        if (this.config.onOpportunity) {
          await this.config.onOpportunity(opp);
        }
      }
    });

    // Start monitoring
    this.monitor.start();

    console.log('✅ pDAI Imbalance Detector started');
  }

  /**
   * Stop the detector
   */
  stop(): void {
    this.active = false;
    this.monitor.stop();
    console.log('🛑 pDAI Imbalance Detector stopped');
  }

  /**
   * Add a pool to monitor
   */
  async addPool(poolAddress: string): Promise<void> {
    await this.monitor.addPool(poolAddress);
  }

  /**
   * Get current opportunities
   */
  getOpportunities(): ImbalanceOpportunity[] {
    return this.opportunities;
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
 * Start the detector with default config
 */
export function startImbalanceDetector(
  liquidityEngine: LiquidityGraphEngine,
  pools: string[],
  onOpportunity?: (opp: ImbalanceOpportunity) => void
): pDAIImbalanceDetector {
  const detector = new pDAIImbalanceDetector(liquidityEngine, {
    poolsToMonitor: pools,
    onOpportunity
  });

  detector.start();

  return detector;
}

export default pDAIImbalanceDetector;
