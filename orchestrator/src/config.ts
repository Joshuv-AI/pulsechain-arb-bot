/**
 * Orchestrator Configuration
 */

import dotenv from "dotenv";
dotenv.config();

export default {
  // Network
  rpc: process.env.RPC_PULSECHAIN || "https://rpc.pulsechain.com",
  chainId: parseInt(process.env.CHAIN_ID || "369"),
  
  // Operator
  operatorKey: process.env.OPERATOR_KEY || "",
  
  // Contracts
  flashSwapExecutor: process.env.FLASH_SWAP_EXECUTOR || "",
  
  // Runtime
  concurrency: parseInt(process.env.CONCURRENCY || "2"),
  minProfitUsd: parseInt(process.env.MIN_PROFIT_USD || "10"),
  maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || "200"),
  pollMs: parseInt(process.env.POLL_MS || "1000"),
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "1000"),
  
  // Gas
  gasPriceGwei: parseFloat(process.env.GAS_PRICE_GWEI || "50"),
  gasUsdPrice: parseFloat(process.env.GAS_USD_PRICE || "0.000002"),
  
  // Private Relay
  privateRelayUrl: process.env.PRIVATE_RELAY_URL || "",
  
  // Redis
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  
  // Log level
  logLevel: process.env.LOG_LEVEL || "info"
};
