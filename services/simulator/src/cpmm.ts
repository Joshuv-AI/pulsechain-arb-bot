import Decimal from "decimal.js";

// PulseX flash swap fee (0.3%)
const FLASH_SWAP_FEE = 0.3;

export function getAmountOut(
  amountIn: string | number,
  reserveIn: string | number,
  reserveOut: string | number,
  feePercent = FLASH_SWAP_FEE
) {
  const a = new Decimal(amountIn);
  const rIn = new Decimal(reserveIn);
  const rOut = new Decimal(reserveOut);
  const feeMultiplier = new Decimal(1).minus(new Decimal(feePercent).dividedBy(100));
  const amountInWithFee = a.times(feeMultiplier);
  const numerator = amountInWithFee.times(rOut);
  const denominator = rIn.plus(amountInWithFee);
  return numerator.dividedBy(denominator).toString();
}

export function simulateSwapIn(amountIn: string | number, reserveIn: string | number, reserveOut: string | number, feePercent = FLASH_SWAP_FEE) {
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, feePercent);
  const newReserveIn = new Decimal(reserveIn).plus(new Decimal(amountIn)).toString();
  const newReserveOut = new Decimal(reserveOut).minus(new Decimal(amountOut)).toString();
  return { amountOut, newReserveIn, newReserveOut };
}

/**
 * Simulate a complete flash swap arbitrage path
 * Includes flash swap borrowing fee and all swap fees
 */
export function simulateFlashSwapArbitrage(
  path: { pool: string; tokenIn: string; tokenOut: string; reserveIn: string; reserveOut: string }[],
  borrowAmount: number
): {
  borrowed: number;
  finalOutput: number;
  totalFees: number;
  grossProfit: number;
  netProfit: number;
  viable: boolean;
} {
  // Flash swap borrowing fee (0.3%)
  const borrowFee = borrowAmount * (FLASH_SWAP_FEE / 100);
  const amountAfterBorrow = borrowAmount + borrowFee; // This is what we need to repay
  
  let currentAmount = borrowAmount;
  let totalSwapFees = 0;
  
  for (const hop of path) {
    const reserveIn = parseFloat(hop.reserveIn);
    const reserveOut = parseFloat(hop.reserveOut);
    
    if (reserveIn <= 0 || reserveOut <= 0 || currentAmount <= 0) {
      return { borrowed: borrowAmount, finalOutput: 0, totalFees: 0, grossProfit: 0, netProfit: 0, viable: false };
    }
    
    // Calculate output with swap fee
    const output = getAmountOut(currentAmount, reserveIn, reserveOut, FLASH_SWAP_FEE);
    const outputNum = parseFloat(output);
    
    // Track fees
    const swapFee = currentAmount * (FLASH_SWAP_FEE / 100);
    totalSwapFees += swapFee;
    
    currentAmount = outputNum;
  }
  
  const totalFees = borrowFee + totalSwapFees;
  const grossProfit = currentAmount - amountAfterBorrow;
  const netProfit = grossProfit - totalFees;
  
  return {
    borrowed: borrowAmount,
    finalOutput: currentAmount,
    totalFees,
    grossProfit,
    netProfit,
    viable: netProfit > 0
  };
}
