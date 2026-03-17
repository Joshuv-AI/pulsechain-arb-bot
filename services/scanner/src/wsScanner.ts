/**
 * WebSocket Scanner
 * Real-time pool monitoring via WebSocket
 */

import { WebSocketProvider, JsonRpcProvider, Contract, BigNumber } from "ethers";
import { logger, sleep } from "./util";

// Minimal ABIs
const PAIR_ABI = [
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)"
];

export interface PoolSnapshot {
  pair: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  timestamp: number;
  blockNumber: number;
}

export interface WSConfig {
  wsUrl: string;
  httpUrl: string;
  keepaliveMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  fallbackPollMs?: number;
}

const DEFAULT_CONFIG: WSConfig = {
  wsUrl: process.env.WS_RPC_URL || "",
  httpUrl: process.env.RPC_PULSECHAIN || "https://rpc.pulsechain.com",
  keepaliveMs: 15000,
  reconnectBaseMs: 500,
  reconnectMaxMs: 60000,
  fallbackPollMs: 3000
};

/**
 * WebSocketScanner class
 */
export class WebSocketScanner {
  private provider: WebSocketProvider | null = null;
  private httpProvider: JsonRpcProvider | null = null;
  private pairContracts: Map<string, Contract> = new Map();
  private connected = false;
  private shuttingDown = false;
  private config: WSConfig;
  
  // Callback for snapshots
  private onSnapshotCallback?: (snapshot: PoolSnapshot) => void;

  constructor(config: Partial<WSConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for new snapshots
   */
  onSnapshot(callback: (snapshot: PoolSnapshot) => void): void {
    this.onSnapshotCallback = callback;
  }

  /**
   * Start the WebSocket scanner
   */
  async start(): Promise<void> {
    if (!this.config.wsUrl) {
      logger.warn("WS_RPC_URL not set, falling back to HTTP polling");
      await this.startFallbackPoller();
      return;
    }
    
    await this.connectWithRetry();
    this.startKeepalive();
  }

  /**
   * Connect with retry logic
   */
  private async connectWithRetry(): Promise<void> {
    let attempt = 0;
    const base = this.config.reconnectBaseMs || 500;
    const max = this.config.reconnectMaxMs || 60000;

    while (!this.shuttingDown) {
      try {
        await this.connect();
        return;
      } catch (err: any) {
        attempt++;
        const wait = Math.min(max, base * Math.pow(2, attempt));
        logger.warn(`WS connect failed (attempt ${attempt}), retrying in ${wait}ms: ${err.message}`);
        await sleep(wait);
      }
    }
  }

  /**
   * Connect to WebSocket
   */
  private async connect(): Promise<void> {
    if (!this.config.wsUrl) throw new Error("No WS RPC URL");
    
    logger.info("Connecting to WebSocket:", this.config.wsUrl);
    
    this.provider = new WebSocketProvider(this.config.wsUrl);
    this.httpProvider = new JsonRpcProvider(this.config.httpUrl);
    
    // Wait for connection
    await this.provider.getBlockNumber();
    this.connected = true;
    
    const blockNum = await this.provider.getBlockNumber();
    logger.info(`WebSocket connected, block: ${blockNum}`);

    // Subscribe to pool events
    await this.subscribeToPairs();
    
    // Setup disconnect handlers
    this.setupDisconnectHandlers();
  }

  /**
   * Subscribe to pool events
   */
  private async subscribeToPairs(): Promise<void> {
    const pairs = getPairAddressList();
    
    for (const pair of pairs) {
      try {
        const contract = new Contract(pair, PAIR_ABI, this.provider!);
        this.pairContracts.set(pair, contract);
        
        // Sync event - reserves updated
        contract.on("Sync", (reserve0: BigNumber, reserve1: BigNumber, event: any) => {
          this.onSync(pair, reserve0, reserve1, event);
        });

        // Swap event - trade executed
        contract.on("Swap", (
          sender: string,
          amount0In: BigNumber,
          amount1In: BigNumber,
          amount0Out: BigNumber,
          amount1Out: BigNumber,
          to: string,
          event: any
        ) => {
          this.onSwap(pair, event);
        });
        
        logger.info(`Subscribed to pair: ${pair.slice(0, 10)}...`);
      } catch (e: any) {
        logger.warn(`Failed to subscribe to ${pair}:`, e.message);
      }
    }
  }

  /**
   * Setup disconnect handlers
   */
  private setupDisconnectHandlers(): void {
    if (!this.provider) return;
    
    try {
      // @ts-ignore - internal websocket
      const ws = this.provider._websocket;
      
      ws.on("close", (code: number) => {
        logger.warn(`WS closed: ${code}`);
        this.handleDisconnect();
      });
      
      ws.on("error", (err: any) => {
        logger.error("WS error:", err?.message || err);
        this.handleDisconnect();
      });
    } catch (e) {
      // Fallback to provider error events
      this.provider.on("error", (err: any) => {
        logger.error("Provider error:", err?.message || err);
        this.handleDisconnect();
      });
    }
  }

  /**
   * Handle disconnection
   */
  private async handleDisconnect(): Promise<void> {
    if (!this.connected) return;
    
    this.connected = false;
    
    // Clean up listeners
    for (const [, contract] of this.pairContracts) {
      try {
        contract.removeAllListeners();
      } catch (e) { /* ignore */ }
    }
    this.pairContracts.clear();
    
    // Start fallback poller
    this.startFallbackPoller();
    
    // Try reconnect
    this.connectWithRetry().catch((e) => logger.error("Reconnect failed:", e));
  }

  /**
   * Fallback HTTP poller
   */
  private async startFallbackPoller(): Promise<void> {
    logger.info("Starting fallback HTTP poller");
    
    const pollMs = this.config.fallbackPollMs || 3000;
    const httpProvider = new JsonRpcProvider(this.config.httpUrl);
    
    while (!this.connected && !this.shuttingDown) {
      try {
        const pairs = getPairAddressList();
        
        for (const pair of pairs) {
          try {
            const contract = new Contract(pair, PAIR_ABI, httpProvider);
            const [r0, r1] = await contract.getReserves();
            const [t0, t1] = await Promise.all([contract.token0(), contract.token1()]);
            
            const snapshot: PoolSnapshot = {
              pair,
              token0: t0,
              token1: t1,
              reserve0: r0.toString(),
              reserve1: r1.toString(),
              timestamp: Date.now(),
              blockNumber: await httpProvider.getBlockNumber()
            };
            
            this.emitSnapshot(snapshot);
          } catch (e: any) {
            logger.debug(`Fallback fetch failed for ${pair}:`, e.message);
          }
        }
      } catch (e: any) {
        logger.warn("Fallback poll error:", e.message);
      }
      
      await sleep(pollMs);
    }
    
    logger.info("Fallback poller exiting (WS reconnected)");
  }

  /**
   * Keepalive loop
   */
  private startKeepalive(): void {
    const interval = this.config.keepaliveMs || 15000;
    
    const keepalive = async () => {
      while (!this.shuttingDown) {
        try {
          if (this.connected && this.provider) {
            await this.provider.getBlockNumber();
          }
        } catch (e: any) {
          logger.warn("Keepalive error:", e.message);
          this.handleDisconnect();
        }
        await sleep(interval);
      }
    };
    
    keepalive();
  }

  /**
   * Sync event handler
   */
  private async onSync(pair: string, reserve0: BigNumber, reserve1: BigNumber, event: any): Promise<void> {
    try {
      const contract = this.pairContracts.get(pair);
      if (!contract) return;
      
      const [token0, token1] = await Promise.all([
        contract.token0(),
        contract.token1()
      ]);
      
      const snapshot: PoolSnapshot = {
        pair,
        token0,
        token1,
        reserve0: reserve0.toString(),
        reserve1: reserve1.toString(),
        timestamp: Date.now(),
        blockNumber: event.blockNumber
      };
      
      this.emitSnapshot(snapshot);
    } catch (e: any) {
      logger.warn("onSync error:", e.message);
    }
  }

  /**
   * Swap event handler
   */
  private async onSwap(pair: string, event: any): Promise<void> {
    try {
      const contract = this.pairContracts.get(pair);
      if (!contract) return;
      
      // Get fresh reserves after swap
      const [r0, r1] = await contract.getReserves();
      const [token0, token1] = await Promise.all([
        contract.token0(),
        contract.token1()
      ]);
      
      const snapshot: PoolSnapshot = {
        pair,
        token0,
        token1,
        reserve0: r0.toString(),
        reserve1: r1.toString(),
        timestamp: Date.now(),
        blockNumber: event.blockNumber
      };
      
      this.emitSnapshot(snapshot);
    } catch (e: any) {
      logger.warn("onSwap error:", e.message);
    }
  }

  /**
   * Emit snapshot to callback
   */
  private emitSnapshot(snapshot: PoolSnapshot): void {
    if (this.onSnapshotCallback) {
      this.onSnapshotCallback(snapshot);
    }
  }

  /**
   * Stop the scanner
   */
  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.connected = false;
    
    for (const [, contract] of this.pairContracts) {
      try {
        contract.removeAllListeners();
      } catch (e) { /* ignore */ }
    }
    
    this.pairContracts.clear();
    
    if (this.provider) {
      try {
        // @ts-ignore
        if (typeof this.provider.destroy === "function") {
          // @ts-ignore
          this.provider.destroy();
        }
      } catch (e) { /* ignore */ }
    }
    
    logger.info("WebSocketScanner stopped");
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Get list of pairs to monitor
 */
function getPairAddressList(): string[] {
  return [
    process.env.PDAI_USDC_POOL || "0x2db5ef4e8a7dbe195defae2d9b79948096a03274",
    process.env.PDAI_DAI_POOL || "0x1d2be6eff95ac5c380a8d6a6143b6a97dd9d8712",
    process.env.USDC_DAI_POOL || "0x3225e3b0d3c6b97ec9848f7b40bb3030e5497709",
    process.env.PDAI_WPLS_POOL || "0xae8429918fdbf9a5867e3243697637dc56aa76a1"
  ];
}

export default WebSocketScanner;
