/**
 * Cycle Detector
 * Finds closed arbitrage loops
 */

import { SwapPath, TokenAddress } from './types';

/**
 * Filter paths to only return cycles (start === end)
 */
export function findCycles(paths: SwapPath[]): SwapPath[] {
  return paths.filter(path => {
    const start = path.tokens[0];
    const end = path.tokens[path.tokens.length - 1];
    return start === end && path.tokens.length >= 3;
  });
}

/**
 * Get unique cycles (deduplicated)
 */
export function deduplicateCycles(cycles: SwapPath[]): SwapPath[] {
  const seen = new Set<string>();
  const unique: SwapPath[] = [];

  for (const cycle of cycles) {
    // Create canonical representation (starting from smallest token address)
    const tokens = cycle.tokens.slice(0, -1); // Remove duplicate end
    const startIdx = tokens.indexOf(Math.min(...tokens.map(t => t.localeCompare(t))) as unknown as TokenAddress);
    
    const canonical = [
      ...tokens.slice(startIdx),
      ...tokens.slice(0, startIdx),
      tokens[startIdx]
    ].join('->');

    if (!seen.has(canonical)) {
      seen.add(canonical);
      unique.push(cycle);
    }
  }

  return unique;
}

/**
 * Filter cycles by number of hops
 */
export function filterByHopCount(paths: SwapPath[], minHops: number, maxHops: number): SwapPath[] {
  return paths.filter(path => {
    const hops = path.tokens.length - 1;
    return hops >= minHops && hops <= maxHops;
  });
}

/**
 * Filter cycles that include specific DEX
 */
export function filterByDex(paths: SwapPath[], dex: string): SwapPath[] {
  return paths.filter(path => 
    path.edges.some(edge => edge.dex.toLowerCase() === dex.toLowerCase())
  );
}

/**
 * Get cycle statistics
 */
export function getCycleStats(cycles: SwapPath[]): {
  totalCycles: number;
  avgHops: number;
  minHops: number;
  maxHops: number;
  dexsUsed: Set<string>;
} {
  if (cycles.length === 0) {
    return {
      totalCycles: 0,
      avgHops: 0,
      minHops: 0,
      maxHops: 0,
      dexsUsed: new Set()
    };
  }

  const hops = cycles.map(c => c.tokens.length - 1);
  const dexsUsed = new Set<string>();

  for (const cycle of cycles) {
    for (const edge of cycle.edges) {
      dexsUsed.add(edge.dex);
    }
  }

  return {
    totalCycles: cycles.length,
    avgHops: hops.reduce((a, b) => a + b, 0) / hops.length,
    minHops: Math.min(...hops),
    maxHops: Math.max(...hops),
    dexsUsed
  };
}

/**
 * Sort cycles by liquidity (sum of min reserves along path)
 */
export function sortByLiquidity(cycles: SwapPath[]): SwapPath[] {
  return [...cycles].sort((a, b) => {
    const liquidityA = Math.min(...a.edges.map(e => Math.min(e.reserveA, e.reserveB)));
    const liquidityB = Math.min(...b.edges.map(e => Math.min(e.reserveA, e.reserveB)));
    return liquidityB - liquidityA;
  });
}
