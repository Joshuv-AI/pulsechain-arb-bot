/**
 * Main Orchestrator Entry Point
 * Wires all modules together and runs the event-driven pipeline
 */

import dotenv from "dotenv";
dotenv.config();

import { logger } from "./logger";
import { 
  provider, 
  signer, 
  getAllPools, 
  updatePoolSnapshot, 
  latestForPair,
  CONCURRENCY, 
  POLL_MS, 
  SCAN_INTERVAL_MS,
  PDAI_ADDRESS,
  USDC_ADDRESS,
  DAI_ADDRESS,
  WPLS_ADDRESS
} from "./serviceRegistry";
import { processOpportunity } from "./pipeline";
import { ethers, BigNumber } from "ethers";
import { Opportunity } from "./pipeline";

// Concurrency control
const runningMap = new Map<string, number>();

function canRun(key: string): boolean {
  return (runningMap.get(key) || 0) < CONCURRENCY;
}

function markStart(key: string): void {
  runningMap.set(key, (runningMap.get(key) || 0) + 1);
}

function markDone(key: string): void {
  runningMap.set(key, Math.max(0, (runningMap.get(key) || 1) - 1));
}

// ABI for pool reserves
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];

/**
 * Scan pools and detect opportunities
 */
async function scanPools(): Promise<Opportunity[]> {
  const pools = getAllPools();
  const opportunities: Opportunity[] = [];
  
  for (const poolAddr of pools) {
    try {
      const pair = new ethers.Contract(poolAddr, PAIR_ABI, provider);
      const [token0, token1, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves()
      ]);
      
      // Update snapshot
      await updatePoolSnapshot(poolAddr, reserves.reserve0, reserves.reserve1);
      
      // Simple spread detection
      const price0 = Number(reserves.reserve1) / Number(reserves.reserve0);
      const price1 = Number(reserves.reserve0) / Number(reserves.reserve1);
      
      // Check for significant price differences between pools
      for (const otherPool of pools) {
        if (otherPool === poolAddr) continue;
        
        const otherPair = new ethers.Contract(otherPool, PAIR_ABI, provider);
        const otherReserves = await otherPair.getReserves();
        const otherPrice0 = Number(otherReserves.reserve1) / Number(otherReserves.reserve0);
        
        const spread = Math.abs(price0 - otherPrice0) / otherPrice0;
        
        // If spread > 0.5%, potential arbitrage
        if (spread > 0.005) {
          const profitEstimate = spread * 1000; // Simplified
          
          if (profitEstimate > 10) { // Min $10 profit
            opportunities.push({
              id: `arb-${poolAddr.slice(0, 8)}-${Date.now()}`,
              path: {
                pools: [poolAddr, otherPool],
                tokens: [token0, token1],
                direction: ["forward", "forward"]
              },
              optimalSizeUSD: 1000,
              expectedProfitUSD: profitEstimate,
              estimatedGasUSD: 10,
              confidence: spread * 100,
              inputToken: token0,
              outputToken: token1
            });
          }
        }
      }
    } catch (e) {
      logger.warn(`Error scanning pool ${poolAddr}:`, (e as Error).message);
    }
  }
  
  return opportunities;
}

/**
 * Start the scanner loop
 */
async function startScanner(): Promise<void> {
  logger.info("Starting pool scanner...");
  
  while (true) {
    try {
      const opportunities = await scanPools();
      
      if (opportunities.length > 0) {
        logger.info(`Found ${opportunities.length} opportunities`);
        
        for (const opp of opportunities) {
          const key = opp.id;
          
          if (!canRun(key)) {
            logger.warn("Concurrency limit reached, skipping opportunity");
            continue;
          }
          
          markStart(key);
          processOpportunity(opp).finally(() => markDone(key));
        }
      }
    } catch (e) {
      logger.error("Scanner error:", (e as Error).message);
    }
    
    await new Promise(resolve => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  logger.info("=".repeat(50));
  logger.info("pDAI Arbitrage Bot - Orchestrator Starting");
  logger.info("=".repeat(50));
  
  // Verify signer
  if (!signer.privateKey || signer.privateKey === "0x") {
    logger.error("OPERATOR_KEY not set in .env!");
    process.exit(1);
  }
  
  logger.info(`Operator: ${signer.address}`);
  
  // Check provider connection
  try {
    const network = await provider.getNetwork();
    logger.info(`Connected to chain ID: ${network.chainId}`);
  } catch (e) {
    logger.error("Failed to connect to RPC:", (e as Error).message);
    process.exit(1);
  }
  
  // Verify we have pool addresses
  const pools = getAllPools();
  logger.info(`Monitoring ${pools.length} pools`);
  
  // Start scanner
  await startScanner();
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

main().catch((e) => {
  logger.error("Fatal error:", e);
  process.exit(1);
});
