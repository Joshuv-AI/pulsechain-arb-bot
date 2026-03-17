/**
 * Pool Store - In-memory with Redis persistence
 */

import Redis from 'ioredis';
import { Pool, PoolSnapshot, createPoolId } from './pool';
import { getConfig } from './config';

export class PoolStore {
  private redis: Redis;
  private pools: Map<string, Pool> = new Map();
  private snapshots: Map<string, PoolSnapshot[]> = new Map();
  
  // In-memory fallback if Redis unavailable
  private useMemoryFallback = false;

  constructor(redis?: Redis) {
    if (redis) {
      this.redis = redis;
    } else {
      try {
        const config = getConfig();
        this.redis = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          lazyConnect: true
        });
      } catch (e) {
        console.log('Using in-memory store (Redis unavailable)');
        this.useMemoryFallback = true;
      }
    }
  }

  /**
   * Save a pool
   */
  async savePool(pool: Pool): Promise<void> {
    this.pools.set(pool.id, pool);
    
    if (!this.useMemoryFallback) {
      try {
        await this.redis.setex(
          `pool:${pool.id}`,
          86400,  // 24 hour TTL
          JSON.stringify(pool)
        );
      } catch (e) {
        console.error('Redis save error:', e);
      }
    }
  }

  /**
   * Get a pool by ID
   */
  async getPool(id: string): Promise<Pool | null> {
    // Check memory first
    if (this.pools.has(id)) {
      return this.pools.get(id)!;
    }
    
    if (!this.useMemoryFallback) {
      try {
        const data = await this.redis.get(`pool:${id}`);
        if (data) {
          const pool = JSON.parse(data) as Pool;
          this.pools.set(id, pool);
          return pool;
        }
      } catch (e) {
        console.error('Redis get error:', e);
      }
    }
    
    return null;
  }

  /**
   * Get pool by address and DEX
   */
  async getPoolByAddress(address: string, dex: string): Promise<Pool | null> {
    const id = createPoolId(address, dex);
    return this.getPool(id);
  }

  /**
   * Get all pools
   */
  async getAllPools(): Promise<Pool[]> {
    return Array.from(this.pools.values());
  }

  /**
   * Get pools by DEX
   */
  async getPoolsByDex(dex: string): Promise<Pool[]> {
    return Array.from(this.pools.values()).filter(p => p.dex === dex);
  }

  /**
   * Save pool snapshot for historical analysis
   */
  async saveSnapshot(snapshot: PoolSnapshot): Promise<void> {
    const key = `snapshot:${snapshot.poolId}`;
    const existing = this.snapshots.get(snapshot.poolId) || [];
    
    // Keep last 1000 snapshots per pool
    existing.push(snapshot);
    if (existing.length > 1000) {
      existing.shift();
    }
    
    this.snapshots.set(snapshot.poolId, existing);
    
    if (!this.useMemoryFallback) {
      try {
        await this.redis.lpush(key, JSON.stringify(snapshot));
        await this.redis.ltrim(key, 0, 999);
        await this.redis.expire(key, 86400 * 7);  // 7 days
      } catch (e) {
        console.error('Redis snapshot error:', e);
      }
    }
  }

  /**
   * Get snapshots for a pool
   */
  async getSnapshots(poolId: string, limit = 100): Promise<PoolSnapshot[]> {
    if (this.snapshots.has(poolId)) {
      return this.snapshots.get(poolId)!.slice(-limit);
    }
    
    if (!this.useMemoryFallback) {
      try {
        const key = `snapshot:${poolId}`;
        const data = await this.redis.lrange(key, 0, limit - 1);
        return data.map(d => JSON.parse(d) as PoolSnapshot);
      } catch (e) {
        console.error('Redis get snapshots error:', e);
      }
    }
    
    return [];
  }

  /**
   * Update pool reserves
   */
  async updateReserves(
    poolId: string,
    reserve0: string,
    reserve1: string,
    price0: number,
    price1: number
  ): Promise<void> {
    const pool = await this.getPool(poolId);
    if (!pool) return;
    
    pool.reserve0 = reserve0;
    pool.reserve1 = reserve1;
    pool.price0 = price0;
    pool.price1 = price1;
    pool.lastUpdated = Date.now();
    
    await this.savePool(pool);
    
    // Save snapshot
    await this.saveSnapshot({
      poolId,
      timestamp: Date.now(),
      blockNumber: 0,  // Would be passed from scanner
      reserve0,
      reserve1,
      price0,
      price1
    });
  }

  /**
   * Clear all pools (for testing)
   */
  async clear(): Promise<void> {
    this.pools.clear();
    this.snapshots.clear();
    
    if (!this.useMemoryFallback) {
      try {
        const keys = await this.redis.keys('pool:*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (e) {
        console.error('Redis clear error:', e);
      }
    }
  }

  /**
   * Get store stats
   */
  getStats() {
    return {
      poolCount: this.pools.size,
      snapshotCount: Array.from(this.snapshots.values()).reduce((a, b) => a + b.length, 0),
      useMemoryFallback: this.useMemoryFallback
    };
  }
}

export default PoolStore;
