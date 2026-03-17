/**
 * Service Registry
 * Centralizes references to all system modules
 */

import { providers, Wallet, BigNumber } from "ethers";
import { logger } from "./logger";

// RPC Configuration
const RPC = process.env.RPC_PULSECHAIN || "https://rpc.pulsechain.com";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "369");

// Provider & Signer
export const provider = new providers.JsonRpcProvider(RPC);
export const signer = new Wallet(process.env.OPERATOR_KEY || "", provider);

// Contract Addresses
export const FLASH_SWAP_EXECUTOR = process.env.FLASH_SWAP_EXECUTOR || "";

// Verified Token Addresses
export const PDAI_ADDRESS = process.env.PDAI_ADDRESS || "0x6B175474E89094c44Da98b954EedEA C495271d0F";
export const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07";
export const DAI_ADDRESS = process.env.DAI_ADDRESS || "0xefd766ccb38eaf1dfd701853bfce31359239f305";
export const WPLS_ADDRESS = process.env.WPLS_ADDRESS || "0xa1071da3ec3ded7a51a5cb4f69d3d9f5bd9001e";

// Verified Pool Addresses
export const PDAI_USDC_POOL = process.env.PDAI_USDC_POOL || "0x2db5ef4e8a7dbe195defae2d9b79948096a03274";
export const PDAI_DAI_POOL = process.env.PDAI_DAI_POOL || "0x1d2be6eff95ac5c380a8d6a6143b6a97dd9d8712";
export const USDC_DAI_POOL = process.env.USDC_DAI_POOL || "0x3225e3b0d3c6b97ec9848f7b40bb3030e5497709";
export const PDAI_WPLS_POOL = process.env.PDAI_WPLS_POOL || "0xae8429918fdbf9a5867e3243697637dc56aa76a1";

// DEX Addresses
export const PULSEX_FACTORY = process.env.PULSEX_FACTORY || "0x1715a3E4A142d8b698131108995174F37aEBA10D";
export const PULSEX_ROUTER = process.env.PULSEX_ROUTER || "0x165C3410fC91EF562C50559f7d2289fEbed552d9";

// Runtime Configuration
export const CONCURRENCY = parseInt(process.env.CONCURRENCY || "2");
export const MIN_PROFIT_USD = parseInt(process.env.MIN_PROFIT_USD || "10");
export const MAX_SLIPPAGE_BPS = parseInt(process.env.MAX_SLIPPAGE_BPS || "200");
export const POLL_MS = parseInt(process.env.POLL_MS || "1000");
export const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "100");

// Scanner & Pool Store
export interface PoolSnapshot {
  pool: string;
  reserve0: BigNumber;
  reserve1: BigNumber;
  timestamp: number;
  blockNumber: number;
}

// In-memory pool store (will be replaced by actual scanner)
const poolSnapshots = new Map<string, PoolSnapshot>();

export async function updatePoolSnapshot(pool: string, reserve0: BigNumber, reserve1: BigNumber): Promise<void> {
  const blockNumber = await provider.getBlockNumber();
  poolSnapshots.set(pool, {
    pool,
    reserve0,
    reserve1,
    timestamp: Date.now(),
    blockNumber
  });
}

export function latestForPair(pool: string): PoolSnapshot | null {
  return poolSnapshots.get(pool) || null;
}

export function getAllPools(): string[] {
  return [PDAI_USDC_POOL, PDAI_DAI_POOL, USDC_DAI_POOL, PDAI_WPLS_POOL];
}

// Utility
export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Log initialization
logger.info("Service registry initialized");
logger.info(`Connected to ${RPC} (chain ${CHAIN_ID})`);
