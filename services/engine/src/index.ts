/**
 * Main Arbitrage Engine Entry Point
 * 
 * Coordinates:
 * - Pool Scanner
 * - Opportunity Engine  
 * - Risk Manager
 * - Trade Executor
 * - Logging & Analytics
 */

import { loadConfig, getConfig } from './config';
import { PoolStore } from './store';
import { OpportunityEngine, Opportunity } from './opportunityEngine';
import { RiskManager } from './riskManager';
import { TradeLogger } from './tradeLogger';
import { ethers, providers, Contract } from 'ethers';

// Uniswap V2 Pair ABI (minimal)
const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

class ArbitrageEngine {
  private config = loadConfig();
  private store: PoolStore;
  private oppEngine: OpportunityEngine;
  private riskManager: RiskManager;
  private tradeLogger: TradeLogger;
  
  private provider: providers.JsonRpcProvider;
  private running = false;
  private loopInterval?: NodeJS.Timeout;

  constructor() {
    this.store = new PoolStore();
    this.oppEngine = new OpportunityEngine({
      minProfitUSD: this.config.trading.minProfitUsd,
      minProfitPercent: this.config.trading.minProfitBps / 100,
      maxSlippagePercent: this.config.trading.maxSlippageBps / 100,
      gasPriceGwei: this.config.trading.gasPriceGwei
    });
    
    this.riskManager = new RiskManager({
      maxTradeSizeUSD: this.config.risk.maxTradeSizeUsd,
      maxDailyLossUSD: this.config.risk.maxDailyLossUsd,
      maxConcurrentTrades: this.config.risk.maxConcurrentTrades
    });
    
    this.tradeLogger = new TradeLogger();
    
    // Connect to network
    this.provider = new providers.JsonRpcProvider(this.config.network.primary.rpc);
  }

  /**
   * Initialize pools from config
   */
  async init(): Promise<void> {
    console.log('🔄 Initializing Arbitrage Engine...');
    
    // Load pools from config
    for (const poolConfig of this.config.pools) {
      try {
        const pair = new Contract(poolConfig.address, PAIR_ABI, this.provider);
        const [token0, token1, reserves] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.getReserves()
        ]);
        
        const { calculatePrice } = await import('./pool');
        const price0 = calculatePrice(reserves.reserve0.toString(), reserves.reserve1.toString());
        const price1 = calculatePrice(reserves.reserve1.toString(), reserves.reserve0.toString());
        
        const pool = {
          id: `${poolConfig.dex.toLowerCase()}-${poolConfig.address.toLowerCase()}`,
          address: poolConfig.address,
          dex: poolConfig.dex,
          token0: { symbol: poolConfig.token0, address: token0, decimals: 18, isNative: false },
          token1: { symbol: poolConfig.token1, address: token1, decimals: 18, isNative: false },
          reserve0: reserves.reserve0.toString(),
          reserve1: reserves.reserve1.toString(),
          fee: 30,  // Default 0.3%
          volume24h: 0,
          lastUpdated: Date.now(),
          price0,
          price1,
          tvl: 0
        };
        
        await this.store.savePool(pool);
        console.log(`  ✅ Loaded pool: ${poolConfig.dex} ${poolConfig.token0}/${poolConfig.token1}`);
      } catch (e) {
        console.error(`  ❌ Failed to load pool ${poolConfig.address}:`, e);
      }
    }
    
    const stats = this.store.getStats();
    console.log(`📊 Initialized with ${stats.poolCount} pools`);
  }

  /**
   * Scan all pools for new data
   */
  async scanPools(): Promise<void> {
    const pools = await this.store.getAllPools();
    
    for (const pool of pools) {
      try {
        const pair = new Contract(pool.address, PAIR_ABI, this.provider);
        const reserves = await pair.getReserves();
        
        const { calculatePrice } = await import('./pool');
        const price0 = calculatePrice(reserves.reserve0.toString(), reserves.reserve1.toString());
        const price1 = calculatePrice(reserves.reserve1.toString(), reserves.reserve0.toString());
        
        await this.store.updateReserves(
          pool.id,
          reserves.reserve0.toString(),
          reserves.reserve1.toString(),
          price0,
          price1
        );
      } catch (e) {
        console.error(`Scan error for ${pool.address}:`, e);
      }
    }
  }

  /**
   * Find opportunities
   */
  async findOpportunities(): Promise<Opportunity[]> {
    const pools = await this.store.getAllPools();
    const opportunities: Opportunity[] = [];
    
    // Check each pool pair for spread
    for (let i = 0; i < pools.length; i++) {
      for (let j = i + 1; j < pools.length; j++) {
        const poolA = pools[i];
        const poolB = pools[j];
        
        // Skip same DEX
        if (poolA.dex === poolB.dex) continue;
        
        // Check if they share a token
        if (poolA.token0.address === poolB.token0.address ||
            poolA.token0.address === poolB.token1.address ||
            poolA.token1.address === poolB.token0.address ||
            poolA.token1.address === poolB.token1.address) {
          
          // Calculate spread
          const priceA0 = poolA.price0;
          const priceB0 = poolB.price0;
          
          if (priceA0 > 0 && priceB0 > 0) {
            const spread = Math.abs((priceA0 - priceB0) / priceB0) * 100;
            
            if (spread > this.config.trading.minProfitBps / 100) {
              // Found opportunity!
              const path = {
                pools: [poolA, poolB],
                tokens: [poolA.token0.symbol, poolA.token1.symbol, poolB.token1.symbol],
                direction: ['forward' as const, 'forward' as const]
              };
              
              const opp = this.oppEngine.simulatePath(path, 1000); // Test with $1000
              
              if (this.oppEngine.isViable(opp)) {
                opportunities.push(opp);
              }
            }
          }
        }
      }
    }
    
    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * Execute a trade
   */
  async executeTrade(opp: Opportunity): Promise<boolean> {
    // Check risk
    const riskCheck = this.riskManager.checkTrade(
      opp.profit,
      opp.inputAmount,
      0  // Would get actual liquidity
    );
    
    if (!riskCheck.allowed) {
      console.log(`⚠️ Trade blocked by risk manager: ${riskCheck.reasons.join(', ')}`);
      return false;
    }
    
    console.log(`🎯 Executing trade: ${opp.path.pools.map(p => p.dex).join(' -> ')}`);
    console.log(`   Profit: $${opp.profit.toFixed(2)} (Net: $${opp.netProfit.toFixed(2)})`);
    
    // In production, this would:
    // 1. Build the transaction
    // 2. Sign with private key
    // 3. Send to network
    // 4. Wait for confirmation
    
    // For now, just log it
    this.tradeLogger.logTrade(
      opp,
      true,  // Would set false if failed
      opp.profit,
      opp.gasEstimate,
      0,  // Would calculate actual slippage
      0,  // Would get from receipt
      '0x...'  // Would be actual tx hash
    );
    
    return true;
  }

  /**
   * Main loop
   */
  async loop(): Promise<void> {
    if (!this.running) return;
    
    try {
      // Reset daily counters
      this.riskManager.resetDaily();
      
      // Scan pools
      await this.scanPools();
      
      // Find opportunities
      const opportunities = await this.findOpportunities();
      
      if (opportunities.length > 0) {
        console.log(`\n🔍 Found ${opportunities.length} opportunities!`);
        
        for (const opp of opportunities.slice(0, 3)) {  // Top 3
          await this.executeTrade(opp);
        }
      }
    } catch (e) {
      console.error('Loop error:', e);
    }
  }

  /**
   * Start the engine
   */
  start(): void {
    if (this.running) {
      console.log('⚠️ Engine already running');
      return;
    }
    
    this.running = true;
    console.log('🚀 Arbitrage Engine Started\n');
    
    this.loopInterval = setInterval(
      () => this.loop(),
      this.config.scanner.intervalMs
    );
  }

  /**
   * Stop the engine
   */
  stop(): void {
    this.running = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
    }
    console.log('🛑 Arbitrage Engine Stopped');
  }

  /**
   * Get engine status
   */
  getStatus() {
    const poolStats = this.store.getStats();
    const riskState = this.riskManager.getState();
    const analytics = this.tradeLogger.getAnalytics();
    
    return {
      running: this.running,
      pools: poolStats,
      risk: riskState,
      analytics
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  const engine = new ArbitrageEngine();
  
  await engine.init();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    engine.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    engine.stop();
    process.exit(0);
  });
  
  // Start (or use start() for continuous running)
  // engine.start();
}

main().catch(console.error);
