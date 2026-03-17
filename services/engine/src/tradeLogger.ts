/**
 * Trade Logger & Analytics
 * Records all trades for analysis
 */

import { Opportunity } from './opportunityEngine';

export interface TradeRecord {
    id: string;
    timestamp: number;
    opportunity: Opportunity;
    executed: boolean;
    gasUsed: number;
    actualProfit: number;
    slippage: number;
    blockNumber: number;
    txHash: string;
    error?: string;
}

export interface DailyStats {
    date: string;
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    totalProfit: number;
    totalGas: number;
    netProfit: number;
    avgProfitPerTrade: number;
    biggestWin: number;
    biggestLoss: number;
}

export interface AnalyticsSummary {
    totalTrades: number;
    winRate: number;
    totalProfit: number;
    avgProfit: number;
    bestTrade: number;
    worstTrade: number;
    profitableDays: number;
    unprofitableDays: number;
}

export class TradeLogger {
    private trades: TradeRecord[] = [];
    private readonly MAX_TRADES = 10000; // Keep last 10k trades

    constructor(private persistencePath?: string) {}

    /**
     * Log a new opportunity that was executed
     */
    logTrade(
        opportunity: Opportunity,
        executed: boolean,
        actualProfit: number,
        gasUsed: number,
        slippage: number,
        blockNumber: number,
        txHash: string,
        error?: string
    ): TradeRecord {
        const record: TradeRecord = {
            id: opportunity.id,
            timestamp: Date.now(),
            opportunity,
            executed,
            gasUsed,
            actualProfit,
            slippage,
            blockNumber,
            txHash,
            error
        };

        this.trades.push(record);

        // Keep array size manageable
        if (this.trades.length > this.MAX_TRADES) {
            this.trades = this.trades.slice(-this.MAX_TRADES);
        }

        // Persist if path configured
        if (this.persistencePath) {
            this.persist();
        }

        return record;
    }

    /**
     * Get all trades
     */
    getTrades(limit?: number): TradeRecord[] {
        if (limit) {
            return this.trades.slice(-limit);
        }
        return [...this.trades];
    }

    /**
     * Get trades for a specific date
     */
    getTradesForDate(date: string): TradeRecord[] {
        const startOfDay = new Date(date).setHours(0, 0, 0, 0);
        const endOfDay = new Date(date).setHours(23, 59, 59, 999);
        
        return this.trades.filter(
            t => t.timestamp >= startOfDay && t.timestamp <= endOfDay
        );
    }

    /**
     * Calculate daily statistics
     */
    getDailyStats(date: string): DailyStats {
        const dayTrades = this.getTradesForDate(date);
        
        const successful = dayTrades.filter(t => t.executed && t.actualProfit > 0);
        const failed = dayTrades.filter(t => !t.executed || t.actualProfit <= 0);
        
        const profits = dayTrades.map(t => t.actualProfit);
        const totalProfit = profits.reduce((a, b) => a + b, 0);
        const totalGas = dayTrades.reduce((a, t) => a + t.gasUsed, 0);
        
        return {
            date,
            totalTrades: dayTrades.length,
            successfulTrades: successful.length,
            failedTrades: failed.length,
            totalProfit,
            totalGas,
            netProfit: totalProfit - totalGas,
            avgProfitPerTrade: dayTrades.length > 0 ? totalProfit / dayTrades.length : 0,
            biggestWin: Math.max(0, ...profits),
            biggestLoss: Math.min(0, ...profits)
        };
    }

    /**
     * Get overall analytics
     */
    getAnalytics(days: number = 30): AnalyticsSummary {
        const now = Date.now();
        const daysAgo = now - (days * 24 * 60 * 60 * 1000);
        
        const recentTrades = this.trades.filter(t => t.timestamp >= daysAgo);
        
        if (recentTrades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                totalProfit: 0,
                avgProfit: 0,
                bestTrade: 0,
                worstTrade: 0,
                profitableDays: 0,
                unprofitableDays: 0
            };
        }

        const successful = recentTrades.filter(t => t.executed && t.actualProfit > 0);
        const profits = recentTrades.map(t => t.actualProfit);
        
        // Calculate days
        const uniqueDays = new Set(
            recentTrades.map(t => new Date(t.timestamp).toISOString().split('T')[0])
        );
        
        const profitableDaysSet = new Set(
            recentTrades
                .filter(t => t.actualProfit > 0)
                .map(t => new Date(t.timestamp).toISOString().split('T')[0])
        );

        return {
            totalTrades: recentTrades.length,
            winRate: (successful.length / recentTrades.length) * 100,
            totalProfit: profits.reduce((a, b) => a + b, 0),
            avgProfit: profits.reduce((a, b) => a + b, 0) / recentTrades.length,
            bestTrade: Math.max(...profits),
            worstTrade: Math.min(...profits),
            profitableDays: profitableDaysSet.size,
            unprofitableDays: uniqueDays.size - profitableDaysSet.size
        };
    }

    /**
     * Print summary to console
     */
    printSummary(days: number = 7) {
        const analytics = this.getAnalytics(days);
        
        console.log('='.repeat(50));
        console.log(`📊 Trade Analytics (Last ${days} days)`);
        console.log('='.repeat(50));
        console.log(`Total Trades: ${analytics.totalTrades}`);
        console.log(`Win Rate: ${analytics.winRate.toFixed(1)}%`);
        console.log(`Total Profit: $${analytics.totalProfit.toFixed(2)}`);
        console.log(`Avg Profit: $${analytics.avgProfit.toFixed(2)}`);
        console.log(`Best Trade: $${analytics.bestTrade.toFixed(2)}`);
        console.log(`Worst Trade: $${analytics.worstTrade.toFixed(2)}`);
        console.log(`Profitable Days: ${analytics.profitableDays}`);
        console.log('='.repeat(50));
    }

    /**
     * Persist to disk
     */
    private persist() {
        // Implementation depends on storage backend
        // Could save to JSON file, database, etc.
    }

    /**
     * Load from disk
     */
    load() {
        // Load persisted trades
    }
}

export default TradeLogger;
