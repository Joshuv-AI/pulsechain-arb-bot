/**
 * HTTP Scanner - Fallback for WebSocket
 */

import { JsonRpcProvider, Contract, BigNumber } from "ethers";
import { logger } from "./util";

const PAIR_ABI = [
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

export interface PoolReserves {
  pair: string;
  token0: string;
  token1: string;
  reserve0: BigNumber;
  reserve1: BigNumber;
  blockNumber: number;
  timestamp: number;
}

/**
 * Fetch reserves for a single pair via HTTP
 */
export async function fetchPairReservesHttp(
  pairAddress: string,
  rpcUrl: string = "https://rpc.pulsechain.com"
): Promise<PoolReserves> {
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(pairAddress, PAIR_ABI, provider);

  const [r0, r1, t0, t1, blockNum] = await Promise.all([
    contract.getReserves(),
    contract.token0(),
    contract.token1(),
    provider.getBlockNumber()
  ]);

  return {
    pair: pairAddress,
    token0: t0,
    token1: t1,
    reserve0: r0.reserve0,
    reserve1: r0.reserve1,
    blockNumber: blockNum,
    timestamp: Date.now()
  };
}

/**
 * Fetch reserves for multiple pairs
 */
export async function fetchMultiplePairs(
  pairAddresses: string[],
  rpcUrl: string = "https://rpc.pulsechain.com"
): Promise<PoolReserves[]> {
  const provider = new JsonRpcProvider(rpcUrl);
  const results: PoolReserves[] = [];
  const blockNum = await provider.getBlockNumber();

  for (const pair of pairAddresses) {
    try {
      const contract = new Contract(pair, PAIR_ABI, provider);
      const [r0, t0, t1] = await Promise.all([
        contract.getReserves(),
        contract.token0(),
        contract.token1()
      ]);

      results.push({
        pair,
        token0: t0,
        token1: t1,
        reserve0: r0.reserve0,
        reserve1: r0.reserve1,
        blockNumber: blockNum,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.warn(`Failed to fetch reserves for ${pair}:`, e);
    }
  }

  return results;
}

export default { fetchPairReservesHttp, fetchMultiplePairs };
