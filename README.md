# pDAI Arbitrage Bot

## Overview
MEV-style arbitrage bot for PulseChain pDAI trading.

## Status
PLANNING - Starter files being built

## Quick Start

1. Install prerequisites:
   - Node 18+
   - Docker (optional for Redis/Postgres)
   - Hardhat

2. Install scanner:
   ```bash
   cd services/scanner
   npm install
   npm run build
   npm start
   ```

3. Install simulator:
   ```bash
   cd services/simulator
   npm install
   npm run build
   npm start
   ```

4. Contracts:
   ```bash
   npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers chai ts-node typescript @typechain/ethers-v5 typechain
   npx hardhat test
   ```

## Notes
- On-chain executor is a minimal skeleton. DO NOT deploy to mainnet without audit.
- Use local mainnet fork while testing with real pool states.
- Focus on deterministic simulation parity with on-chain AMMs.

## Next Steps
- Generate ZIP of files
- Provide runnable mainnet-fork script
- Add CI config
