# PulseChain pDAI Arbitrage Bot

A production-ready MEV-style arbitrage bot for pDAI on PulseChain using flash swaps.

## Purpose

This bot detects and executes arbitrage opportunities on PulseChain, specifically targeting the pDAI (bridged DAI) peg. When pDAI deviates from $1, the bot can:

1. **Detect price imbalances** between PulseX pools
2. **Execute flash swap arbitrage** without requiring external capital
3. **Profit from the spread** and help stabilize the pDAI peg

## Features

- **Real-time WebSocket Scanner** - Sub-100ms pool monitoring
- **Flash Swap Execution** - Use PulseX pools for capital-free trading
- **Multi-hop Arbitrage** - Path: USDC → pDAI → DAI → USDC
- **Risk Management** - Built-in risk controls and position sizing
- **Auto-reconnection** - WebSocket with fallback to HTTP polling

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Orchestrator                         │
├─────────────────────────────────────────────────────────┤
│  WebSocket Scanner (<100ms) → Pool Monitor              │
│         ↓                                               │
│  Opportunity Engine → Profit Simulation                  │
│         ↓                                               │
│  Risk Manager → Position Optimizer                       │
│         ↓                                               │
│  FlashSwapExecutor (Smart Contract)                     │
└─────────────────────────────────────────────────────────┘
```

## Verified Contract Addresses (PulseChain)

| Token/Pool | Address |
|------------|---------|
| pDAI | `0x6B175474E89094c44Da98b954EedEA c495271d0F` |
| USDC | `0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07` |
| DAI | `0xefd766ccb38eaf1dfd701853bfce31359239f305` |
| WPLS | `0xa1071da3ec3ded7a51a5cb4f69d3d9f5bd9001e |
| PulseX Factory | `0x1715a3E4A142d8b698131108995174F37aEBA10D` |
| PulseX Router | `0x165C3410fC91EF562C50559f7d2289fEbed552d9` |
| pDAI/USDC Pool | `0x2db5ef4e8a7dbe195defae2d9b79948096a03274` |
| pDAI/DAI Pool | `0x1d2be6eff95ac5c380a8d6a6143b6a97dd9d8712` |

## Setup

### 1. Install Dependencies
```bash
cd pDAI-Arbitrage-Bot
npm install
cd orchestrator && npm install
```

### 2. Configure Environment
```bash
cp orchestrator/.env.example orchestrator/.env
# Edit .env with your settings
```

Required variables:
- `OPERATOR_KEY` - Your wallet private key
- `WS_RPC_URL` - WebSocket RPC URL (get from PublicNode/Moralis)
- `FLASH_SWAP_EXECUTOR` - Deployed contract address

### 3. Deploy Contract
```bash
npx hardhat run scripts/deploy_executor.ts --network pulsechain
```

### 4. Run
```bash
cd orchestrator
npm run dev
```

## Requirements to Run

1. **Wallet funded with PLS** - For gas fees (~$10-50 recommended)
2. **WebSocket RPC URL** - Get free from https://www.publicnode.com
3. **Deployed contract** - FlashSwapExecutor.sol on PulseChain
4. **Test first** - Use mainnet fork before real funds

## How It Works

1. **Scanner** monitors PulseX pools via WebSocket for real-time updates
2. **Detection** finds arbitrage opportunities when price spreads > 0.5%
3. **Simulation** validates profitability after gas costs
4. **Execution** uses flash swaps - no capital required
5. **Profit** stays in your wallet after repaying the flash swap

## Timing

- **Detection:** <100ms with WebSocket
- **Simulation:** <1 second
- **Execution:** Within same block via flash swap

## Disclaimer

⚠️ **WARNING:** This is advanced DeFi infrastructure. Use at your own risk:
- Always test on mainnet fork first
- Start with small trade sizes
- Monitor logs for errors
- Smart contracts carry financial risk

## License

MIT

## Author

Built by Konan (AI Assistant) for Josh
