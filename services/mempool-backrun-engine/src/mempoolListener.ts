/**
 * Mempool Listener
 * Watches pending transactions in the mempool
 */

import { ethers, providers, BigNumber } from 'ethers';

export interface PendingTransaction {
  hash: string;
  from: string;
  to: string;
  value: BigNumber;
  data: string;
  gasPrice: BigNumber;
  gasLimit: BigNumber;
  nonce: number;
  chainId: number;
}

export type TransactionCallback = (tx: PendingTransaction) => void | Promise<void>;

export interface MempoolListenerConfig {
  intervalMs?: number;
  maxPending?: number;
  addressesOfInterest?: string[]; // Only watch these addresses
}

/**
 * Start listening to mempool pending transactions
 */
export class MempoolListener {
  private provider: providers.JsonRpcProvider;
  private config: MempoolListenerConfig;
  private active = false;
  private pendingtxs = new Set<string>();

  constructor(provider: providers.JsonRpcProvider, config: MempoolListenerConfig = {}) {
    this.provider = provider;
    this.config = {
      intervalMs: 1000,
      maxPending: 1000,
      ...config
    };
  }

  /**
   * Start listening to pending transactions
   */
  start(callback: TransactionCallback): void {
    if (this.active) return;
    this.active = true;

    // Listen to new pending transactions
    this.provider.on('pending', async (txHash: string) => {
      if (!this.active) return;
      if (this.pendingtxs.size >= (this.config.maxPending || 1000)) return;
      if (this.pendingtxs.has(txHash)) return;

      try {
        this.pendingtxs.add(txHash);

        const tx = await this.provider.getTransaction(txHash);
        
        if (!tx) {
          this.pendingtxs.delete(txHash);
          return;
        }

        // Filter by address if configured
        if (this.config.addressesOfInterest && this.config.addressesOfInterest.length > 0) {
          const relevant = 
            this.config.addressesOfInterest.includes(tx.from.toLowerCase()) ||
            this.config.addressesToLowerCase().includes(tx.to?.toLowerCase() || '');
          
          if (!relevant) {
            this.pendingtxs.delete(txHash);
            return;
          }
        }

        const pendingTx: PendingTransaction = {
          hash: tx.hash,
          from: tx.from,
          to: tx.to || '',
          value: tx.value,
          data: tx.data,
          gasPrice: tx.gasPrice || BigNumber.from(0),
          gasLimit: tx.gasLimit || BigNumber.from(0),
          nonce: tx.nonce,
          chainId: tx.chainId || 0
        };

        // Execute callback
        const result = callback(pendingTx);
        if (result instanceof Promise) {
          await result;
        }

      } catch (error) {
        // Log but don't crash
        console.error('Error processing pending tx:', error);
      } finally {
        this.pendingtxs.delete(txHash);
      }
    });

    console.log('📡 Mempool listener started');
  }

  /**
   * Stop listening
   */
  stop(): void {
    this.active = false;
    this.provider.removeAllListeners('pending');
    console.log('🛑 Mempool listener stopped');
  }

  /**
   * Get pending transaction count
   */
  getPendingCount(): number {
    return this.pendingtxs.size;
  }

  /**
   * Check if active
   */
  isActive(): boolean {
    return this.active;
  }
}

/**
 * Simple mempool poller (alternative to WebSocket listener)
 */
export class MempoolPoller {
  private provider: providers.JsonRpcProvider;
  private interval?: NodeJS.Timeout;
  private lastBlockTxs = new Map<string, boolean>();
  private active = false;

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  /**
   * Start polling for pending transactions
   */
  start(callback: TransactionCallback, intervalMs: number = 1000): void {
    if (this.active) return;
    this.active = true;

    this.interval = setInterval(async () => {
      if (!this.active) return;

      try {
        // Get pending transactions via debug_getRawReceipts or similar
        const block = await this.provider.getBlock('pending');
        
        if (!block?.transactions) continue;

        for (const txHash of block.transactions) {
          if (typeof txHash !== 'string') continue;
          if (this.lastBlockTxs.has(txHash)) continue;

          this.lastBlockTxs.set(txHash, true);

          try {
            const tx = await this.provider.getTransaction(txHash);
            if (!tx) continue;

            const pendingTx: PendingTransaction = {
              hash: tx.hash,
              from: tx.from,
              to: tx.to || '',
              value: tx.value,
              data: tx.data,
              gasPrice: tx.gasPrice || BigNumber.from(0),
              gasLimit: tx.gasLimit || BigNumber.from(0),
              nonce: tx.nonce,
              chainId: tx.chainId || 0
            };

            callback(pendingTx);
          } catch (e) {
            // Skip failed tx fetches
          }
        }

        // Clean up old entries
        if (this.lastBlockTxs.size > 10000) {
          const entries = Array.from(this.lastBlockTxs.entries());
          this.lastBlockTxs = new Map(entries.slice(-5000));
        }

      } catch (error) {
        console.error('Mempool poll error:', error);
      }
    }, intervalMs);

    console.log('📡 Mempool poller started');
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
    }
    console.log('🛑 Mempool poller stopped');
  }
}

export default MempoolListener;
