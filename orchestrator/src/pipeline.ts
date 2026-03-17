/**
 * Pipeline - Decision flow for each opportunity
 * validate → simulate → optimize size → risk check → execute → persist
 */

import { logger } from "./logger";
import { provider, signer, FLASH_SWAP_EXECUTOR, MIN_PROFIT_USD } from "./serviceRegistry";
import { BigNumber, ethers, providers } from "ethers";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

const RESULTS_FILE = path.join(__dirname, "../../data/pipeline_results.jsonl");

// Ensure data directory exists
const dataDir = path.dirname(RESULTS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export interface Opportunity {
  id: string;
  path: {
    pools: string[];
    tokens: string[];
    direction: ("forward" | "reverse")[];
  };
  optimalSizeUSD: number;
  expectedProfitUSD: number;
  estimatedGasUSD: number;
  confidence: number;
  metadata?: Record<string, any>;
  inputToken?: string;
  outputToken?: string;
}

interface PipelineResult {
  ctxId: string;
  opportunityId: string;
  status: "RECEIVED" | "VALIDATED" | "SIMULATED" | "OPTIMIZED" | "EXECUTED" | "SENT" | "ERROR";
  profit?: number;
  size?: number;
  error?: string;
  timestamp: string;
}

/**
 * Persist result to file
 */
async function persistResult(res: PipelineResult): Promise<void> {
  try {
    fs.appendFileSync(RESULTS_FILE, JSON.stringify(res) + "\n");
  } catch (e) {
    logger.error("persistResult error", (e as Error).message);
  }
}

/**
 * Re-check pool reserves using RPC
 */
async function getFreshReserves(pools: string[]): Promise<Map<string, { reserve0: BigNumber; reserve1: BigNumber }>> {
  const snapshot = new Map<string, { reserve0: BigNumber; reserve1: BigNumber }>();
  
  const pairAbi = [
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)"
  ];
  
  for (const pool of pools) {
    try {
      const contract = new ethers.Contract(pool, pairAbi, provider);
      const reserves = await contract.getReserves();
      snapshot.set(pool, {
        reserve0: reserves.reserve0,
        reserve1: reserves.reserve1
      });
    } catch (e) {
      logger.warn(`Failed to get reserves for ${pool}:`, (e as Error).message);
    }
  }
  
  return snapshot;
}

/**
 * Simulate arbitrage with fresh reserves
 */
function simulateWithReserves(
  path: Opportunity["path"],
  reserves: Map<string, { reserve0: BigNumber; reserve1: BigNumber }>,
  amountIn: number
): { output: number; profit: number; viable: boolean } {
  const FLASH_FEE = 0.003; // 0.3%
  
  let amount = amountIn;
  
  for (let i = 0; i < path.pools.length; i++) {
    const pool = path.pools[i];
    const reserve = reserves.get(pool);
    
    if (!reserve) {
      return { output: 0, profit: 0, viable: false };
    }
    
    // Simple CPMM formula with fee
    const reserveIn = i % 2 === 0 ? reserve.reserve0 : reserve.reserve1;
    const reserveOut = i % 2 === 0 ? reserve.reserve1 : reserve.reserve0;
    
    const amountInWithFee = amount * (1 - FLASH_FEE);
    const output = (amountInWithFee * Number(reserveOut)) / (Number(reserveIn) + amountInWithFee);
    
    amount = output;
  }
  
  const profit = amount - amountIn;
  const viable = profit > 0;
  
  return { output: amount, profit, viable };
}

/**
 * Estimate gas cost in USD
 */
async function estimateGasCost(): Promise<number> {
  try {
    const gasPrice = await provider.getGasPrice();
    const gasEstimate = BigNumber.from(300000); // Estimated gas for arbitrage
    const gasCostEth = gasPrice.mul(gasEstimate);
    const ethPrice = 3000; // Would fetch from oracle
    return Number(gasCostEth) / 1e18 * ethPrice;
  } catch (e) {
    return 10; // Default estimate
  }
}

/**
 * Build and send the arbitrage transaction
 */
async function executeTrade(opp: Opportunity, size: number): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!FLASH_SWAP_EXECUTOR) {
    return { success: false, error: "FlashSwapExecutor not configured" };
  }
  
  try {
    const pairAbi = [
      "function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external"
    ];
    
    // Use the first pool in path
    const pool = opp.path.pools[0];
    const pair = new ethers.Contract(pool, pairAbi, signer);
    
    const inputToken = opp.inputToken || opp.metadata?.inputToken;
    const amountOut = size * 1000; // Simplified
    
    // Build the swap call
    const token0Abi = ["function token0() view returns (address)"];
    const token0 = await new ethers.Contract(pool, token0Abi, provider).token0();
    
    const amount0Out = inputToken?.toLowerCase() === token0.toLowerCase() ? amountOut : 0;
    const amount1Out = amount0Out > 0 ? 0 : amountOut;
    
    // Encode data for callback
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "address", "uint256"],
      [inputToken || "0x0000000000000000000000000000000000000000", opp.outputToken || inputToken, signer.address, size]
    );
    
    // Send transaction
    const tx = await pair.swap(amount0Out, amount1Out, FLASH_SWAP_EXECUTOR, data);
    const receipt = await tx.wait();
    
    return { success: true, txHash: receipt.transactionHash };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Main pipeline processor
 */
export async function processOpportunity(candidate: Opportunity): Promise<void> {
  const ctxId = uuidv4();
  const startTime = Date.now();
  
  logger.info({ ctxId, stage: "received", id: candidate.id, profit: candidate.expectedProfitUSD });
  
  // 1) Get fresh pool reserves
  await persistResult({ ctxId, opportunityId: candidate.id, status: "VALIDATED", timestamp: new Date().toISOString() });
  
  const reserves = await getFreshReserves(candidate.path.pools);
  
  if (reserves.size === 0) {
    logger.warn({ ctxId }, "No pool reserves fetched, skipping");
    return;
  }
  
  // 2) Simulate with fresh reserves
  await persistResult({ ctxId, opportunityId: candidate.id, status: "SIMULATED", timestamp: new Date().toISOString() });
  
  const simResult = simulateWithReserves(candidate.path, reserves, candidate.optimalSizeUSD);
  
  if (!simResult.viable) {
    logger.warn({ ctxId }, "Simulation not viable, skipping");
    return;
  }
  
  logger.info({ ctxId, simulatedProfit: simResult.profit }, "Simulation passed");
  
  // 3) Estimate gas costs
  const gasCostUSD = await estimateGasCost();
  const netProfit = simResult.profit - gasCostUSD;
  
  if (netProfit < MIN_PROFIT_USD) {
    logger.warn({ ctxId, netProfit, gasCostUSD, MIN_PROFIT_USD }, "Profit below minimum after gas");
    return;
  }
  
  // 4) Execute trade
  await persistResult({ ctxId, opportunityId: candidate.id, status: "OPTIMIZED", size: candidate.optimalSizeUSD, profit: netProfit, timestamp: new Date().toISOString() });
  
  const execResult = await executeTrade(candidate, candidate.optimalSizeUSD);
  
  if (execResult.success) {
    await persistResult({ 
      ctxId, 
      opportunityId: candidate.id, 
      status: "SENT", 
      profit: netProfit,
      timestamp: new Date().toISOString() 
    });
    logger.info({ ctxId, txHash: execResult.txHash, duration: Date.now() - startTime }, "Trade executed successfully!");
  } else {
    await persistResult({ 
      ctxId, 
      opportunityId: candidate.id, 
      status: "ERROR", 
      error: execResult.error,
      timestamp: new Date().toISOString() 
    });
    logger.error({ ctxId, error: execResult.error }, "Trade execution failed");
  }
}

export default processOpportunity;
