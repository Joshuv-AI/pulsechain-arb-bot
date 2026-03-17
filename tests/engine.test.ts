import { expect } from "chai";
import { ethers } from "hardhat";
import { OpportunityEngine, Opportunity } from "../services/engine/src/opportunityEngine";
import { RiskManager, RiskLimits } from "../services/engine/src/riskManager";

describe("OpportunityEngine", function () {
  let engine: OpportunityEngine;

  beforeEach(() => {
    engine = new OpportunityEngine({
      minProfitUSD: 100,
      minProfitPercent: 5,
      maxSlippagePercent: 2,
      gasPriceGwei: 50,
      defaultGasUnits: 300000
    });
  });

  describe("calculateOutput", function () {
    it("should calculate correct output for basic swap", () => {
      const output = engine.calculateOutput(1000, 100000, 100000, 30);
      expect(output).to.be.greaterThan(900);
      expect(output).to.be.lessThan(1000);
    });

    it("should return 0 for zero input", () => {
      const output = engine.calculateOutput(0, 100000, 100000, 30);
      expect(output).to.equal(0);
    });
  });

  describe("simulatePath", function () {
    it("should calculate profit for valid path", () => {
      const path = {
        pools: [{
          address: "0x1",
          token0: "USDC",
          token1: "pDAI",
          reserve0: "1000000",
          reserve1: "1000000",
          fee: 30
        }],
        tokens: ["USDC", "pDAI"],
        direction: ["forward" as const]
      };
      
      const result = engine.simulatePath(path, 1000);
      expect(result.inputAmount).to.equal(1000);
    });
  });

  describe("isViable", function () {
    it("should accept profitable opportunity", () => {
      const opp: Opportunity = {
        id: "test-1",
        path: { pools: [], tokens: [], direction: [] },
        inputToken: "USDC",
        outputToken: "pDAI",
        inputAmount: 1000,
        expectedOutput: 1200,
        profit: 200,
        profitPercent: 20,
        gasEstimate: 50,
        netProfit: 150,
        timestamp: Date.now()
      };
      
      const viable = engine.isViable(opp);
      expect(viable).to.be.true;
    });

    it("should reject unprofitable opportunity", () => {
      const opp: Opportunity = {
        id: "test-2",
        path: { pools: [], tokens: [], direction: [] },
        inputToken: "USDC",
        outputToken: "pDAI",
        inputAmount: 1000,
        expectedOutput: 1050,
        profit: 50,
        profitPercent: 5,
        gasEstimate: 100,
        netProfit: -50,
        timestamp: Date.now()
      };
      
      const viable = engine.isViable(opp);
      expect(viable).to.be.false;
    });
  });
});

describe("RiskManager", function () {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager({
      maxTradeSizeUSD: 50000,
      maxDailyLossUSD: 1000,
      maxConcurrentTrades: 3,
      maxDrawdownPercent: 20,
      minLiquidityUSD: 10000
    });
  });

  describe("checkTrade", function () {
    it("should allow trade within limits", () => {
      const result = riskManager.checkTrade(500, 10000, 50000);
      expect(result.allowed).to.be.true;
    });

    it("should block oversized trade", () => {
      const result = riskManager.checkTrade(500, 100000, 50000);
      expect(result.allowed).to.be.false;
      expect(result.reasons).to.include("Trade size");
    });

    it("should block negative profit trade", () => {
      const result = riskManager.checkTrade(-500, 10000, 50000);
      expect(result.allowed).to.be.false;
    });
  });

  describe("triggerCircuitBreaker", function () {
    it("should trigger on large loss", () => {
      riskManager.recordTrade(-500, 95000);  // 5% drawdown from 100000
      riskManager.recordTrade(-500, 95000);
      riskManager.recordTrade(-500, 95000);  // Total -1500, would trigger if maxDailyLoss is 1000
      
      const state = riskManager.getState();
      expect(state.circuitBreaker).to.be.true;
    });
  });
});
