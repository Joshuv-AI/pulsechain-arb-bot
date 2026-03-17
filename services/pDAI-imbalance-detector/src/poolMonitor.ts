/**
 * Pool Monitor
 * Monitors pDAI pools for mint/redeem events
 */

import { ethers, providers, Contract, BigNumber } from 'ethers';

// pDAI contract ABI (events we're interested in)
const PDAI_ABI = [
  'event Mint(address indexed minter, uint256 mintAmount, uint256 collateralAmount)',
  'event Redeem(address indexed redeemer, uint256 redeemAmount, uint256 collateralAmount)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// Pool swap events
const POOL_ABI = [
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)'
];

export interface PoolEvent {
  poolAddress: string;
  eventType: 'mint' | 'redeem' | 'swap' | 'sync';
  data: any;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
}

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  reserve0: BigNumber;
  reserve1: BigNumber;
  lastUpdate: number;
}

export type PoolCallback = (event: PoolEvent, pool: PoolInfo) => void | Promise<void>;

/**
 * Monitor specific pools for events
 */
export class PoolMonitor {
  private provider: providers.JsonRpcProvider;
  private pools: Map<string, PoolInfo> = new Map();
  private contracts: Map<string, Contract> = new Map();
  private active = false;
  private callbacks: PoolCallback[] = [];

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  /**
   * Add a pool to monitor
   */
  async addPool(poolAddress: string): Promise<void> {
    if (this.pools.has(poolAddress.toLowerCase())) return;

    try {
      const pool = new Contract(poolAddress, POOL_ABI, this.provider);
      
      // Get initial reserves
      const [token0, token1, reserves] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.getReserves()
      ]);

      const poolInfo: PoolInfo = {
        address: poolAddress.toLowerCase(),
        token0,
        token1,
        reserve0: reserves.reserve0,
        reserve1: reserves.reserve1,
        lastUpdate: Date.now()
      };

      this.pools.set(poolAddress.toLowerCase(), poolInfo);
      this.contracts.set(poolAddress.toLowerCase(), pool);

      // Listen to events
      this.setupEventListeners(poolAddress.toLowerCase(), pool);

      console.log(`📊 Added pool to monitor: ${poolAddress.slice(0, 10)}...`);
    } catch (error) {
      console.error(`Failed to add pool ${poolAddress}:`, error);
    }
  }

  /**
   * Setup event listeners for a pool
   */
  private setupEventListeners(poolAddress: string, pool: Contract): void {
    // Swap events
    pool.on('Swap', async (
      sender: string,
      amount0In: BigNumber,
      amount1In: BigNumber,
      amount0Out: BigNumber,
      amount1Out: BigNumber,
      to: string,
      event: any
    ) => {
      const poolInfo = this.pools.get(poolAddress);
      if (!poolInfo) return;

      const poolEvent: PoolEvent = {
        poolAddress,
        eventType: 'swap',
        data: {
          sender,
          amount0In: amount0In.toString(),
          amount1In: amount1In.toString(),
          amount0Out: amount0Out.toString(),
          amount1Out: amount1Out.toString(),
          to
        },
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: Date.now()
      };

      this.notifyCallbacks(poolEvent, poolInfo);
    });

    // Sync events (reserve updates)
    pool.on('Sync', async (reserve0: BigNumber, reserve1: BigNumber, event: any) => {
      const poolInfo = this.pools.get(poolAddress);
      if (!poolInfo) return;

      poolInfo.reserve0 = reserve0;
      poolInfo.reserve1 = reserve1;
      poolInfo.lastUpdate = Date.now();

      const poolEvent: PoolEvent = {
        poolAddress,
        eventType: 'sync',
        data: { reserve0: reserve0.toString(), reserve1: reserve1.toString() },
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: Date.now()
      };

      this.notifyCallbacks(poolEvent, poolInfo);
    });
  }

  /**
   * Add callback for events
   */
  onEvent(callback: PoolCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Notify all callbacks
   */
  private async notifyCallbacks(event: PoolEvent, pool: PoolInfo): Promise<void> {
    for (const callback of this.callbacks) {
      try {
        const result = callback(event, pool);
        if (result instanceof Promise) {
          await result;
        }
      } catch (error) {
        console.error('Callback error:', error);
      }
    }
  }

  /**
   * Start monitoring all added pools
   */
  start(): void {
    this.active = true;
    console.log(`🚀 Pool monitor started for ${this.pools.size} pools`);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.active = false;
    
    // Remove all listeners
    for (const [address, contract] of this.contracts) {
      contract.removeAllListeners();
    }
    
    console.log('🛑 Pool monitor stopped');
  }

  /**
   * Get pool info
   */
  getPool(address: string): PoolInfo | undefined {
    return this.pools.get(address.toLowerCase());
  }

  /**
   * Get all monitored pools
   */
  getAllPools(): PoolInfo[] {
    return Array.from(this.pools.values());
  }

  /**
   * Check if active
   */
  isActive(): boolean {
    return this.active;
  }
}

/**
 * Monitor pDAI-specific mint/redeem events
 */
export class pDAIMonitor extends PoolMonitor {
  private pDAIAddress: string;

  constructor(provider: providers.JsonRpcProvider, pDAIAddress: string) {
    super(provider);
    this.pDAIAddress = pDAIAddress.toLowerCase();
  }

  /**
   * Check if event involves pDAI
   */
  ispDAIEvent(pool: PoolInfo): boolean {
    return (
      pool.token0.toLowerCase() === this.pDAIAddress ||
      pool.token1.toLowerCase() === this.pDAIAddress
    );
  }

  /**
   * Filter events to only pDAI-related
   */
  filterpDAIEvents(event: PoolEvent, pool: PoolInfo): boolean {
    return this.ispDAIEvent(pool);
  }
}

export default PoolMonitor;
