/**
 * Swap Decoder
 * Decodes swaps from transaction data to identify pDAI-related trades
 */

import { PendingTransaction } from './mempoolListener';
import { BigNumber } from 'ethers';

// Common DEX router ABIs (minimal for decoding)
const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)',
  'function swapETHForExactTokens(uint amountOut, address[] path, address to, uint deadline)',
  'function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] path, address to, uint deadline)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] path, address to, uint deadline)',
  'function multicall(bytes[] data)'
];

// Known router addresses (VERIFY for PulseChain)
const KNOWN_ROUTERS: Record<string, string> = {
  '0x...': 'PulseX',      // VERIFY
  '0x...': '9inch',      // VERIFY
  '0x...': '9mm',        // VERIFY
  '0x...': 'Equalizer',  // VERIFY
  '0x...': 'Ionic'       // VERIFY
};

// Tokens to monitor (VERIFY addresses for PulseChain)
const MONITORED_TOKENS: Record<string, string> = {
  '0x...': 'pDAI',       // VERIFY
  '0x...': 'WPLS',       // VERIFY
  '0x...': 'USDC',       // VERIFY
  '0x...': 'DAI',        // VERIFY
  '0x...': 'WBTC',       // VERIFY
  '0x...': 'USDT',       // VERIFY
  '0x...': 'ETH'         // VERIFY
};

export interface DecodedSwap {
  type: 'exactIn' | 'exactOut' | 'unknown';
  router: string;
  dex: string;
  path: string[];
  amountIn: string;
  amountOutMin: string;
  amountOut?: string;
  recipient: string;
  raw: PendingTransaction;
}

export interface SwapFilter {
  minValueUSD?: number;
  tokens?: string[];
  routers?: string[];
  dexes?: string[];
}

const DEFAULT_FILTER: SwapFilter = {
  minValueUSD: 1000,
  routers: Object.keys(KNOWN_ROUTERS)
};

/**
 * Decode function selector from tx data
 */
export function getSelector(data: string): string {
  if (!data || data.length < 10) return '';
  return data.slice(0, 10).toLowerCase();
}

/**
 * Decode swap from transaction data
 */
export function decodeSwap(tx: PendingTransaction): DecodedSwap | null {
  const data = tx.data;
  if (!data || data === '0x') return null;

  const selector = getSelector(data);

  // Try to decode based on selector
  try {
    // For simplicity, use basic pattern matching
    // In production, use proper ABI decoding
    
    // Check if it's a swap
    if (selector === '0x7ff36ab5' || // swapExactETHForTokens
        selector === '0x38ed1739' || // swapExactTokensForTokens  
        selector === '0x18cbafe5' || // swapExactTokensForETH
        selector === '0x04e45aaf' || // swapETHForExactTokens
        selector === '0x5ae401dc' || // swapTokensForExactETH
        selector === '0x8803dbee' || // swapTokensForExactTokens
        selector === '0xac9650d8')   // multicall
    {
      const dex = KNOWN_ROUTERS[tx.to.toLowerCase()] || 'Unknown';
      
      // Try to extract path from data (simplified)
      // Real implementation would use ABI decoding
      const path = extractPathFromData(data);
      const amountIn = extractAmountIn(data);
      const amountOutMin = extractAmountOutMin(data);

      return {
        type: isExactIn(selector) ? 'exactIn' : 'exactOut',
        router: tx.to,
        dex,
        path,
        amountIn: amountIn || '0',
        amountOutMin: amountOutMin || '0',
        recipient: tx.from, // Usually the sender
        raw: tx
      };
    }
  } catch (e) {
    // Decoding failed
  }

  return null;
}

/**
 * Check if selector is exact input swap
 */
function isExactIn(selector: string): boolean {
  const exactInSelectors = [
    '0x7ff36ab5', // swapExactETHForTokens
    '0x38ed1739', // swapExactTokensForTokens
    '0x18cbafe5'  // swapExactTokensForETH
  ];
  return exactInSelectors.includes(selector);
}

/**
 * Extract token path from transaction data (simplified)
 */
function extractPathFromData(data: string): string[] {
  // This is a simplified extraction
  // Real implementation would properly decode the ABI
  const path: string[] = [];
  
  // Look for common patterns (0x followed by 40 hex chars = address)
  const addressPattern = /0x([a-fA-F0-9]{40})/g;
  let match;
  
  while ((match = addressPattern.exec(data)) !== null) {
    const addr = '0x' + match[1].toLowerCase();
    // Filter out known non-token addresses
    if (!isContractAddress(addr)) {
      path.push(addr);
    }
  }
  
  return path.slice(0, 3); // Max 3 hops
}

/**
 * Extract amountIn from data (simplified)
 */
function extractAmountIn(data: string): string | null {
  // Try to extract from typical position
  // This is simplified - real implementation uses proper ABI
  try {
    // For swapExactTokensForTokens: amountIn is typically at offset
    if (data.length > 74) {
      const amountInHex = '0x' + data.slice(66, 130);
      if (amountInHex !== '0x' && amountInHex !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return amountInHex;
      }
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

/**
 * Extract amountOutMin from data (simplified)
 */
function extractAmountOutMin(data: string): string | null {
  try {
    if (data.length > 138) {
      const amountOutHex = '0x' + data.slice(130, 194);
      if (amountOutHex !== '0x' && amountOutHex !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return amountOutHex;
      }
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

/**
 * Check if address is a common contract (not a user wallet)
 */
function isContractAddress(addr: string): boolean {
  // Add known contract addresses to filter out
  const contracts = [
    '0x0000000000000000000000000000000000000000', // Zero address
    // Add known router/contract addresses
  ];
  return contracts.includes(addr.toLowerCase());
}

/**
 * Check if swap involves monitored tokens
 */
export function isRelevantSwap(swap: DecodedSwap): boolean {
  const swapTokens = swap.path.map(t => t.toLowerCase());
  const monitored = Object.keys(MONITORED_TOKENS).map(t => t.toLowerCase());
  
  return swapTokens.some(t => monitored.includes(t));
}

/**
 * Filter swaps based on criteria
 */
export function filterSwaps(
  swaps: DecodedSwap[],
  filter: SwapFilter = DEFAULT_FILTER
): DecodedSwap[] {
  return swaps.filter(swap => {
    // Filter by router
    if (filter.routers && filter.routers.length > 0) {
      if (!filter.routers.map(r => r.toLowerCase()).includes(swap.router.toLowerCase())) {
        return false;
      }
    }

    // Filter by DEX
    if (filter.dexes && filter.dexes.length > 0) {
      if (!filter.dexes.map(d => d.toLowerCase()).includes(swap.dex.toLowerCase())) {
        return false;
      }
    }

    // Filter by tokens
    if (filter.tokens && filter.tokens.length > 0) {
      const swapTokens = swap.path.map(t => t.toLowerCase());
      const filterTokens = filter.tokens.map(t => t.toLowerCase());
      if (!swapTokens.some(t => filterTokens.includes(t))) {
        return false;
      }
    }

    // Filter by minimum value (would need price feed for USD)
    // This is simplified

    return true;
  });
}

/**
 * Get human-readable swap description
 */
export function describeSwap(swap: DecodedSwap): string {
  const amountIn = parseFloat(swap.amountIn) / 1e18; // Assuming 18 decimals
  const amountOutMin = parseFloat(swap.amountOutMin) / 1e18;
  
  return `${swap.dex}: ${amountIn.toFixed(4)} → ${amountOutMin.toFixed(4)} (${swap.path.join(' → ')})`;
}

export default {
  decodeSwap,
  isRelevantSwap,
  filterSwaps,
  describeSwap,
  KNOWN_ROUTERS,
  MONITORED_TOKENS
};
