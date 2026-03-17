/**
 * Path Simulator
 * Simulates swaps along a path to calculate expected output
 */

import { SwapPath, PoolEdge } from './types';
import Decimal from 'decimal.js';

// Configure Decimal.js for precision
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calculate output amount for a single swap using CPMM formula
 * 
 * @param amountIn - Input amount
 * @param reserveIn - Reserve of input token
 * @param reserveOut - Reserve of output token  
 * @param feeBps - Fee in basis points (e.g., 30 = 0.3%)
 * @returns Output amount after swap
 */
export function calculateSwapOutput(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number
): number {
  if (reserveIn <= 0 || reserveOut <= 0 || amountIn <= 0) {
    return 0;
  }

  // Decimal.js for precision
  const amount = new Decimal(amountIn);
  const reserveInD = new Decimal(reserveIn);
  const reserveOutD = new Decimal(reserveOut);
  const feeFactor = new Decimal(10000 - feeBps).div(10000);

  // amountIn * (1 - fee)
  const amountInWithFee = amount.mul(feeFactor);

  // (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee)
  const numerator = amountInWithFee.mul(reserveOutD);
  const denominator = reserveInD.add(amountInWithFee);

  const output = numerator.div(denominator);

  return output.toNumber();
}

/**
 * Simulate a complete path and calculate final output
 */
export function simulatePath(path: SwapPath, inputAmount: number): number {
  let amount = inputAmount;

  for (const edge of path.edges) {
    // Determine which reserve is input and which is output
    const tokenIn = path.tokens[path.edges.indexOf(edge)];
    const tokenOut = tokenIn === edge.tokenA ? edge.tokenB : edge.tokenA;

    const reserveIn = tokenIn === edge.tokenA ? edge.reserveA : edge.reserveB;
    const reserveOut = tokenIn === edge.tokenA ? edge.reserveB : edge.reserveA;

    amount = calculateSwapOutput(amount, reserveIn, reserveOut, edge.fee);

    if (amount <= 0) break;
  }

  return amount;
}

/**
 * Simulate with slippage scenarios
 */
export function simulateWithSlippage(
  path: SwapPath,
  inputAmount: number,
  slippageBps: number
): {
  optimistic: number;
  expected: number;
  pessimistic: number;
} {
  const expected = simulatePath(path, inputAmount);

  // Apply slippage to reserves (simulates price impact)
  const slippageFactor = 1 - slippageBps / 10000;

  let pessimisticAmount = inputAmount;
  for (const edge of path.edges) {
    const tokenIn = path.tokens[path.edges.indexOf(edge)];
    const reserveIn = tokenIn === edge.tokenA ? edge.reserveA : edge.reserveB;
    const reserveOut = tokenIn === edge.tokenA ? edge.reserveB : edge.reserveA;

    // Reduced reserves = more slippage
    const adjReserveIn = reserveIn * slippageFactor;
    const adjReserveOut = reserveOut * slippageFactor;

    pessimisticAmount = calculateSwapOutput(
      pessimisticAmount,
      adjReserveIn,
      adjReserveOut,
      edge.fee
    );

    if (pessimisticAmount <= 0) break;
  }

  return {
    optimistic: expected * 1.01, // Small buffer
    expected,
    pessimistic: pessimisticAmount
  };
}

/**
 * Calculate profitability of a path
 */
export function calculatePathProfit(
  path: SwapPath,
  inputAmount: number,
  gasCostUSD: number,
  gasPriceGwei: number = 50
): {
  inputAmount: number;
  outputAmount: number;
  grossProfit: number;
  profitPercent: number;
  gasCost: number;
  netProfit: number;
  viable: boolean;
} {
  const outputAmount = simulatePath(path, inputAmount);
  const grossProfit = outputAmount - inputAmount;
  const profitPercent = (grossProfit / inputAmount) * 100;

  // Estimate gas (roughly 100k per hop)
  const gasUnits = path.edges.length * 100000;
  const gasCostETH = (gasUnits * gasPriceGwei) / 1e9;
  
  // Convert gas to USD (would need price feed)
  const gasCost = gasCostETH * 3000; // Assuming $3000 ETH

  const netProfit = grossProfit - gasCost;

  return {
    inputAmount,
    outputAmount,
    grossProfit,
    profitPercent,
    gasCost,
    netProfit,
    viable: netProfit > 0
  };
}

/**
 * Find optimal input amount for a path
 * Binary search for maximum profitable input
 */
export function findOptimalAmount(
  path: SwapPath,
  maxInput: number,
  minProfitUSD: number,
  gasPriceGwei: number = 50
): {
  optimalAmount: number;
  maxProfit: number;
} {
  let low = 100; // Minimum input
  let high = maxInput;
  let optimalAmount = low;
  let maxProfit = 0;

  // Binary search
  for (let i = 0; i < 20; i++) { // 20 iterations for precision
    const mid = (low + high) / 2;
    const result = calculatePathProfit(path, mid, 0, gasPriceGwei);

    if (result.netProfit > maxProfit) {
      maxProfit = result.netProfit;
      optimalAmount = mid;
    }

    if (result.netProfit > minProfitUSD) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return { optimalAmount, maxProfit };
}
