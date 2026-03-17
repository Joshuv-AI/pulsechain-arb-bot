/**
 * Opportunity Engine
 * Detects and evaluates arbitrage opportunities
 */

import Decimal from 'decimal.js';

export interface PoolState {
    address: string;
    token0: string;
    token1: string;
    reserve0: string;
    reserve1: string;
    fee: number; // in basis points
}

export interface TradePath {
    pools: PoolState[];
    tokens: string[];
    direction: ('forward' | 'backward')[];
}

export interface Opportunity {
    id: string;
    path: TradePath;
    inputToken: string;
    outputToken: string;
    inputAmount: number;
    expectedOutput: number;
    profit: number;
    profitPercent: number;
    gasEstimate: number;
    netProfit: number;
    timestamp: number;
}

export interface Config {
    minProfitUSD: number;
    minProfitPercent: number;
    maxSlippagePercent: number;
    gasPriceGwei: number;
    defaultGasUnits: number;
}

const DEFAULT_CONFIG: Config = {
    minProfitUSD: 100,
    minProfitPercent: 5,
    maxSlippagePercent: 2,
    gasPriceGwei: 50,
    defaultGasUnits: 300000
};

export class OpportunityEngine {
    private config: Config;

    constructor(config: Partial<Config> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Calculate output amount for a swap (Uniswap V2 style)
     */
    calculateOutput(
        amountIn: number,
        reserveIn: number,
        reserveOut: number,
        feeBps: number
    ): number {
        const amountInWithFee = amountIn * (10000 - feeBps);
        const numerator = amountInWithFee * reserveOut;
        const denominator = reserveIn * 10000 + amountInWithFee;
        return numerator / denominator;
    }

    /**
     * Simulate a complete arbitrage path
     */
    simulatePath(
        path: TradePath,
        inputAmount: number
    ): Opportunity {
        let currentAmount = inputAmount;
        const startToken = path.tokens[0];
        const endToken = path.tokens[path.tokens.length - 1];

        // Execute each swap in the path
        for (let i = 0; i < path.pools.length; i++) {
            const pool = path.pools[i];
            const direction = path.direction[i];
            
            const reserveIn = direction === 'forward' 
                ? parseFloat(pool.reserve0) 
                : parseFloat(pool.reserve1);
            const reserveOut = direction === 'forward' 
                ? parseFloat(pool.reserve1) 
                : parseFloat(pool.reserve0);
            
            currentAmount = this.calculateOutput(
                currentAmount,
                reserveIn,
                reserveOut,
                pool.fee
            );
        }

        const profit = currentAmount - inputAmount;
        const profitPercent = (profit / inputAmount) * 100;
        
        const gasCost = this.config.gasPriceGwei * 
            this.config.defaultGasUnits * 1e9 / 1e18; // Convert to USD (approximate)
        
        const netProfit = profit - gasCost;

        return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            path,
            inputToken: startToken,
            outputToken: endToken,
            inputAmount,
            expectedOutput: currentAmount,
            profit,
            profitPercent,
            gasEstimate: gasCost,
            netProfit,
            timestamp: Date.now()
        };
    }

    /**
     * Find best input amount for a given path
     */
    optimizeInput(
        path: TradePath,
        reserve0: number,
        reserve1: number
    ): number {
        // Optimal swap is when k is perfectly balanced after swap
        // For constant product: x * y = k
        // Optimal input = y * (sqrt(fee*fee + 4*fee) - fee) / (2*(1-fee))
        // Simplified approximation:
        
        const fee = path.pools[0]?.fee || 30;
        const sqrtTerm = Math.sqrt(fee * fee + 400 * fee);
        const optimal = reserve1 * (sqrtTerm - fee) / (200 - 2 * fee);
        
        return Math.min(optimal, reserve0 * 0.3); // Don't use more than 30% of liquidity
    }

    /**
     * Check if opportunity meets threshold
     */
    isViable(opp: Opportunity): boolean {
        if (opp.netProfit < this.config.minProfitUSD) {
            return false;
        }
        
        if (opp.profitPercent < this.config.minProfitPercent) {
            return false;
        }
        
        return true;
    }

    /**
     * Generate multiple trade scenarios for a path
     */
    generateScenarios(
        path: TradePath,
        baseAmount: number,
        multipliers: number[] = [0.5, 1, 2, 5, 10]
    ): Opportunity[] {
        const opportunities: Opportunity[] = [];
        
        for (const mult of multipliers) {
            const input = baseAmount * mult;
            const opp = this.simulatePath(path, input);
            
            if (this.isViable(opp)) {
                opportunities.push(opp);
            }
        }
        
        // Sort by net profit
        return opportunities.sort((a, b) => b.netProfit - a.netProfit);
    }

    /**
     * Calculate triangular arbitrage opportunity
     */
    calculateTriangular(
        poolAB: PoolState,
        poolBC: PoolState,
        poolCA: PoolState,
        inputAmount: number
    ): Opportunity {
        // Path: A -> B -> C -> A
        // Example: USDC -> pDAI -> DAI -> USDC
        
        const path: TradePath = {
            pools: [poolAB, poolBC, poolCA],
            tokens: [poolAB.token0, poolAB.token1, poolBC.token1, poolAB.token0],
            direction: ['forward', 'forward', 'forward']
        };
        
        return this.simulatePath(path, inputAmount);
    }
}

export default OpportunityEngine;
