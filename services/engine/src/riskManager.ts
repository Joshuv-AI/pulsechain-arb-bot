/**
 * Risk Manager
 * Manages risk limits and circuit breakers
 */

export interface RiskLimits {
    maxTradeSizeUSD: number;
    maxDailyLossUSD: number;
    maxConcurrentTrades: number;
    maxDrawdownPercent: number;
    minLiquidityUSD: number;
}

export interface TradeRisk {
    allowed: boolean;
    reasons: string[];
    riskScore: number; // 0-100
}

export interface RiskState {
    dailyProfitLoss: number;
    tradesToday: number;
    peakBalance: number;
    currentBalance: number;
    lastResetDate: string;
}

const DEFAULT_LIMITS: RiskLimits = {
    maxTradeSizeUSD: 50000,
    maxDailyLossUSD: 1000,
    maxConcurrentTrades: 3,
    maxDrawdownPercent: 20,
    minLiquidityUSD: 10000
};

export class RiskManager {
    private limits: RiskLimits;
    private state: RiskState;
    
    // Circuit breaker
    private circuitBreakerActive: boolean = false;
    private circuitBreakerReason: string = '';
    
    constructor(limits: Partial<RiskLimits> = {}) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
        this.state = {
            dailyProfitLoss: 0,
            tradesToday: 0,
            peakBalance: 0,
            currentBalance: 0,
            lastResetDate: new Date().toISOString().split('T')[0]
        };
    }

    /**
     * Check if a trade is allowed based on risk limits
     */
    checkTrade(
        opportunityProfit: number,
        opportunitySize: number,
        currentLiquidity: number
    ): TradeRisk {
        const reasons: string[] = [];
        let riskScore = 0;

        // Check circuit breaker
        if (this.circuitBreakerActive) {
            return {
                allowed: false,
                reasons: [`Circuit breaker active: ${this.circuitBreakerReason}`],
                riskScore: 100
            };
        }

        // Check trade size
        if (opportunitySize > this.limits.maxTradeSizeUSD) {
            reasons.push(`Trade size $${opportunitySize} exceeds max $${this.limits.maxTradeSizeUSD}`);
            riskScore += 30;
        }

        // Check liquidity
        if (currentLiquidity < this.limits.minLiquidityUSD) {
            reasons.push(`Pool liquidity $${currentLiquidity} below minimum $${this.limits.minLiquidityUSD}`);
            riskScore += 25;
        }

        // Check daily loss limit
        const projectedDailyLoss = this.state.dailyProfitLoss - opportunityProfit;
        if (projectedDailyLoss < -this.limits.maxDailyLossUSD) {
            reasons.push(`Would exceed daily loss limit of $${this.limits.maxDailyLossUSD}`);
            riskScore += 40;
        }

        // Check concurrent trades
        if (this.state.tradesToday >= this.limits.maxConcurrentTrades) {
            reasons.push(`Max concurrent trades reached (${this.limits.maxConcurrentTrades})`);
            riskScore += 20;
        }

        // Check drawdown
        if (this.state.peakBalance > 0) {
            const drawdown = ((this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance) * 100;
            if (drawdown > this.limits.maxDrawdownPercent) {
                reasons.push(`Drawdown ${drawdown.toFixed(1)}% exceeds max ${this.limits.maxDrawdownPercent}%`);
                riskScore += 35;
            }
        }

        // Low profit opportunity
        if (opportunityProfit < 0) {
            reasons.push('Negative profit opportunity');
            riskScore += 50;
        }

        return {
            allowed: riskScore < 50 && reasons.length === 0,
            reasons,
            riskScore: Math.min(riskScore, 100)
        };
    }

    /**
     * Record a completed trade
     */
    recordTrade(profit: number, newBalance: number) {
        this.state.dailyProfitLoss += profit;
        this.state.tradesToday++;
        
        if (newBalance > this.state.peakBalance) {
            this.state.peakBalance = newBalance;
        }
        this.state.currentBalance = newBalance;
        
        // Check if we should trigger circuit breaker
        if (this.state.dailyProfitLoss < -this.limits.maxDailyLossUSD) {
            this.triggerCircuitBreaker('Daily loss limit exceeded');
        }
        
        const drawdown = this.state.peakBalance > 0 
            ? ((this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance) * 100 
            : 0;
            
        if (drawdown > this.limits.maxDrawdownPercent) {
            this.triggerCircuitBreaker('Drawdown limit exceeded');
        }
    }

    /**
     * Trigger circuit breaker
     */
    triggerCircuitBreaker(reason: string) {
        this.circuitBreakerActive = true;
        this.circuitBreakerReason = reason;
        console.log(`⚠️ CIRCUIT BREAKER TRIGGERED: ${reason}`);
    }

    /**
     * Reset circuit breaker (manual override)
     */
    resetCircuitBreaker() {
        this.circuitBreakerActive = false;
        this.circuitBreakerReason = '';
        console.log('✅ Circuit breaker reset');
    }

    /**
     * Reset daily counters (should be called at start of each day)
     */
    resetDaily() {
        const today = new Date().toISOString().split('T')[0];
        
        if (this.state.lastResetDate !== today) {
            this.state.dailyProfitLoss = 0;
            this.state.tradesToday = 0;
            this.state.lastResetDate = today;
            console.log('📅 Daily counters reset');
        }
    }

    /**
     * Get current risk state
     */
    getState(): RiskState & { limits: RiskLimits; circuitBreaker: boolean } {
        return {
            ...this.state,
            limits: this.limits,
            circuitBreaker: this.circuitBreakerActive
        };
    }

    /**
     * Update limits
     */
    updateLimits(newLimits: Partial<RiskLimits>) {
        this.limits = { ...this.limits, ...newLimits };
    }
}

export default RiskManager;
