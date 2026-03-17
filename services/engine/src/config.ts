import * as fs from 'fs';
import * as yaml from 'yaml';
import * as path from 'path';

export interface NetworkConfig {
  rpc: string;
  chainId: number;
  explorer: string;
}

export interface Contracts {
  // Tokens
  pDAI: string;
  pUSDC: string;
  pUSDT: string;
  DAI: string;
  USDC: string;
  USDT: string;
  PLS: string;
  PLSX: string;
  
  // DEXes
  PulseX: {
    factory: string;
    router: string;
  };
  Equalizer: {
    factory: string;
    router: string;
  };
  Ionic: {
    factory: string;
    router: string;
  };
  
  // Flashloan
  AavePool: string;
  Compound: string;
}

export interface PoolConfig {
  address: string;
  dex: 'PulseX' | 'Equalizer' | 'Ionic';
  token0: string;
  token1: string;
}

export interface Config {
  network: {
    primary: NetworkConfig;
    fallback: NetworkConfig[];
  };
  contracts: Contracts;
  pools: PoolConfig[];
  scanner: {
    intervalMs: number;
    maxPools: number;
  };
  trading: {
    minProfitUsd: number;
    minProfitBps: number;
    maxSlippageBps: number;
    gasPriceGwei: number;
  };
  risk: {
    maxTradeSizeUsd: number;
    maxDailyLossUsd: number;
    maxConcurrentTrades: number;
  };
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
  };
}

// Default config with example addresses
const DEFAULT_CONFIG: Config = {
  network: {
    primary: {
      rpc: process.env.RPC_PULSECHAIN || 'https://rpc.pulsechain.com',
      chainId: 369,
      explorer: 'https://scan.pulsechain.com'
    },
    fallback: []
  },
  contracts: {
    // Token addresses (VERIFY THESE)
    pDAI: '0x...',          // Verify on scan.pulsechain.com
    pUSDC: '0x...',
    pUSDT: '0x...',
    DAI: '0x...',
    USDC: '0x6B175474E89094C44Da98b954EedAC5DCDEF9CE6CC',  // Same as ETH
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',        // Same as ETH
    PLS: '0x...',
    PLSX: '0x...',
    
    // DEX addresses (VERIFY THESE)
    PulseX: {
      factory: '0x...',  // Find on scan.pulsechain.com
      router: '0x...'
    },
    Equalizer: {
      factory: '0x...',
      router: '0x...'
    },
    Ionic: {
      factory: '0x...',
      router: '0x...'
    },
    
    // Flashloan providers (VERIFY THESE)
    AavePool: '0x...',
    Compound: '0x...'
  },
  pools: [
    // Add verified pool addresses here
    // Example:
    // {
    //   address: '0x...',
    //   dex: 'PulseX',
    //   token0: 'pDAI',
    //   token1: 'pUSDC'
    // }
  ],
  scanner: {
    intervalMs: 3000,
    maxPools: 100
  },
  trading: {
    minProfitUsd: 100,
    minProfitBps: 500,  // 5%
    maxSlippageBps: 200,  // 2%
    gasPriceGwei: 50
  },
  risk: {
    maxTradeSizeUsd: 50000,
    maxDailyLossUsd: 1000,
    maxConcurrentTrades: 3
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'pdaidb'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
};

let config: Config | null = null;

export function loadConfig(configPath?: string): Config {
  if (config) return config;
  
  const defaultPath = path.join(process.cwd(), 'config.yaml');
  const finalPath = configPath || defaultPath;
  
  try {
    if (fs.existsSync(finalPath)) {
      const fileContent = fs.readFileSync(finalPath, 'utf8');
      const fileConfig = yaml.parse(fileContent);
      config = { ...DEFAULT_CONFIG, ...fileConfig };
    } else {
      console.log('No config.yaml found, using defaults');
      config = DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error('Error loading config:', error);
    config = DEFAULT_CONFIG;
  }
  
  return config!;
}

export function getConfig(): Config {
  if (!config) {
    return loadConfig();
  }
  return config;
}

export default Config;
