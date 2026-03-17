# pDAI Arbitrage Bot - Orchestrator

## Overview

The orchestrator wires all modules together into an event-driven pipeline:
- Scanner → finds opportunities
- Simulator → validates profitability
- Pipeline → processes, optimizes, executes
- Risk management → enforces limits

## Quick Start

### 1. Install Dependencies

```bash
cd orchestrator
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Deploy Contract

Deploy `FlashSwapExecutor.sol` to PulseChain and add address to `.env`:

```
FLASH_SWAP_EXECUTOR=0xYourContractAddress
```

### 4. Run

```bash
# Development mode
npm run dev

# Production
npm run build
npm start
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPERATOR_KEY` | Your wallet private key | REQUIRED |
| `FLASH_SWAP_EXECUTOR` | Deployed contract address | REQUIRED |
| `MIN_PROFIT_USD` | Minimum profit to execute | 10 |
| `SCAN_INTERVAL_MS` | How often to scan pools | 1000 |
| `CONCURRENCY` | Max concurrent trades | 2 |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Orchestrator                             │
├─────────────────────────────────────────────────────────────┤
│  Scanner Loop (every 1s)                                     │
│    ↓                                                         │
│  Find opportunities (spread > 0.5%)                          │
│    ↓                                                         │
│  Pipeline:                                                   │
│    1. Get fresh pool reserves                               │
│    2. Simulate with real data                               │
│    3. Estimate gas costs                                    │
│    4. Check profit > MIN_PROFIT_USD                         │
│    5. Execute trade                                          │
│    6. Persist result                                         │
└─────────────────────────────────────────────────────────────┘
```

## Modules

The orchestrator connects to:
- `services/scanner` - Pool data
- `services/simulator` - Profit calculation
- `services/liquidity-graph-engine` - Path finding
- `services/position-sizing` - Optimal trade size
- `contracts/FlashSwapExecutor.sol` - Execution

## Safety

- Always test on mainnet fork first
- Start with small trade sizes
- Monitor logs for errors
- Set appropriate `MIN_PROFIT_USD`

## License

MIT
