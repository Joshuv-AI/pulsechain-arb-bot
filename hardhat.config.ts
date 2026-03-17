import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Local development
    hardhat: {
      chainId: 1337
    },
    
    // Mainnet fork for testing
    mainnet_fork: {
      url: process.env.MAINNET_RPC || "https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY",
      chainId: 1,
      accounts: {
        mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test junk"
      },
      forking: {
        blockNumber: 19000000  // Latest block at time of fork
      }
    },
    
    // PulseChain (when available)
    pulsechain: {
      url: process.env.RPC_PULSECHAIN || "https://rpc.pulsechain.com",
      chainId: 369,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    
    // PulseChain testnet (if available)
    pulsechain_testnet: {
      url: process.env.RPC_PULSECHAIN_TESTNET || "https://rpc.v4.testnet.pulsechain.com",
      chainId: 943,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  
  // Gas reporting
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    token: "ETH",
    gasPriceApi: "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice"
  },
  
  // Etherscan verification (when applicable)
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      pulsechain: " Verify via pulsechain.com"
    }
  },
  
  // Paths
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  
  // Mocha testing
  mocha: {
    timeout: 60000  // 60 seconds for integration tests
  }
};

export default config;
