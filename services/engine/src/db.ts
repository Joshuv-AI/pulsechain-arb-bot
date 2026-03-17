/**
 * Database Schema and Queries
 */

import { Pool } from './pool';

export const SCHEMA = `
-- Pools table
CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  dex TEXT NOT NULL,
  token0_symbol TEXT NOT NULL,
  token0_address TEXT NOT NULL,
  token1_symbol TEXT NOT NULL,
  token1_address TEXT NOT NULL,
  reserve0 TEXT NOT NULL,
  reserve1 TEXT NOT NULL,
  fee_bps INTEGER NOT NULL,
  volume_24h NUMERIC,
  tvl NUMERIC,
  price0 NUMERIC,
  price1 NUMERIC,
  last_updated BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pools_dex ON pools(dex);
CREATE INDEX idx_pools_token0 ON pools(token0_address);
CREATE INDEX idx_pools_token1 ON pools(token1_address);

-- Pool Snapshots (for historical analysis)
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id SERIAL PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools(id),
  timestamp BIGINT NOT NULL,
  block_number BIGINT,
  reserve0 TEXT NOT NULL,
  reserve1 TEXT NOT NULL,
  price0 NUMERIC,
  price1 NUMERIC
);

CREATE INDEX idx_snapshots_pool_time ON pool_snapshots(pool_id, timestamp DESC);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  pool_id TEXT REFERENCES pools(id),
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in NUMERIC NOT NULL,
  amount_out NUMERIC NOT NULL,
  profit NUMERIC NOT NULL,
  gas_used NUMERIC,
  slippage_bps INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  tx_hash TEXT,
  block_number BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trades_time ON trades(timestamp DESC);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_profit ON trades(profit DESC);

-- Daily statistics
CREATE TABLE IF NOT EXISTS daily_stats (
  date DATE PRIMARY KEY,
  total_trades INTEGER DEFAULT 0,
  successful_trades INTEGER DEFAULT 0,
  failed_trades INTEGER DEFAULT 0,
  total_profit NUMERIC DEFAULT 0,
  total_gas NUMERIC DEFAULT 0,
  net_profit NUMERIC DEFAULT 0,
  best_trade NUMERIC DEFAULT 0,
  worst_trade NUMERIC DEFAULT 0
);

-- Configuration history
CREATE TABLE IF NOT EXISTS config_history (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);
`;

/**
 * Get all CREATE TABLE statements
 */
export function getSchema(): string {
  return SCHEMA;
}

/**
 * Insert or update a pool
 */
export function upsertPool(pool: Pool): string {
  return `
    INSERT INTO pools (
      id, address, dex,
      token0_symbol, token0_address,
      token1_symbol, token1_address,
      reserve0, reserve1, fee_bps,
      volume_24h, tvl, price0, price1, last_updated
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    )
    ON CONFLICT (id) DO UPDATE SET
      reserve0 = EXCLUDED.reserve0,
      reserve1 = EXCLUDED.reserve1,
      volume_24h = EXCLUDED.volume_24h,
      tvl = EXCLUDED.tvl,
      price0 = EXCLUDED.price0,
      price1 = EXCLUDED.price1,
      last_updated = EXCLUDED.last_updated
  `;
}

/**
 * Insert trade
 */
export function insertTrade(): string {
  return `
    INSERT INTO trades (
      id, timestamp, pool_id,
      token_in, token_out,
      amount_in, amount_out,
      profit, gas_used, slippage_bps,
      status, error_message, tx_hash, block_number
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
  `;
}

/**
 * Update daily stats
 */
export function updateDailyStats(date: string): string {
  return `
    INSERT INTO daily_stats (date, total_trades, successful_trades, failed_trades, total_profit, total_gas, net_profit, best_trade, worst_trade)
    SELECT 
      $1::date,
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'SUCCESS'),
      COUNT(*) FILTER (WHERE status = 'FAILED'),
      SUM(profit) FILTER (WHERE status = 'SUCCESS'),
      SUM(gas_used) FILTER (WHERE status = 'SUCCESS'),
      SUM(profit) FILTER (WHERE status = 'SUCCESS') - SUM(gas_used) FILTER (WHERE status = 'SUCCESS'),
      MAX(profit) FILTER (WHERE status = 'SUCCESS'),
      MIN(profit) FILTER (WHERE status = 'SUCCESS')
    FROM trades
    WHERE DATE(to_timestamp(timestamp / 1000)) = $1::date
    ON CONFLICT (date) DO UPDATE SET
      total_trades = EXCLUDED.total_trades,
      successful_trades = EXCLUDED.successful_trades,
      failed_trades = EXCLUDED.failed_trades,
      total_profit = EXCLUDED.total_profit,
      total_gas = EXCLUDED.total_gas,
      net_profit = EXCLUDED.net_profit,
      best_trade = EXCLUDED.best_trade,
      worst_trade = EXCLUDED.worst_trade
  `;
}

/**
 * Get trades for date range
 */
export function getTradesInRange(startTime: number, endTime: number): string {
  return `
    SELECT * FROM trades
    WHERE timestamp >= $1 AND timestamp <= $2
    ORDER BY timestamp DESC
  `;
}

/**
 * Get pool stats
 */
export function getPoolStats(poolId: string): string {
  return `
    SELECT 
      COUNT(*) as trade_count,
      SUM(amount_in) as total_volume,
      AVG(profit) as avg_profit,
      MAX(profit) as best_trade,
      MIN(profit) as worst_trade
    FROM trades
    WHERE pool_id = $1
  `;
}
