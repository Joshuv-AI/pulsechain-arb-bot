/**
 * Bundle Submitter
 * Submits bundles to private relays/block builders
 */

import axios, { AxiosInstance } from 'axios';
import { Bundle } from './bundleBuilder';

export interface SubmitResult {
  success: boolean;
  bundleHash?: string;
  error?: string;
  blockNumber?: number;
  receipts?: TransactionReceipt[];
}

export interface TransactionReceipt {
  txHash: string;
  gasUsed: number;
  status: number;
  logs: any[];
}

export interface RelayConfig {
  url: string;
  authKey?: string;
  network: 'pulsechain' | 'ethereum' | 'custom';
}

/**
 * Submit bundle to Flashbots-style relay
 */
export class BundleSubmitter {
  private client: AxiosInstance;
  private config: RelayConfig;

  constructor(config: RelayConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.authKey ? { 'Authorization': `Bearer ${config.authKey}` } : {})
      }
    });
  }

  /**
   * Submit a bundle to the relay
   */
  async submitBundle(bundle: Bundle): Promise<SubmitResult> {
    try {
      const response = await this.client.post('/sendBundle', {
        txs: bundle.txs,
        targetBlock: bundle.targetBlock,
        replacementUuid: bundle.replacementUuid
      });

      return {
        success: true,
        bundleHash: response.data.bundleHash,
        blockNumber: response.data.blockNumber
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Submission failed'
      };
    }
  }

  /**
   * Cancel a pending bundle
   */
  async cancelBundle(replacementUuid: string): Promise<SubmitResult> {
    try {
      const response = await this.client.post('/cancelBundle', {
        replacementUuid
      });

      return {
        success: true,
        bundleHash: response.data.bundleHash
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Cancellation failed'
      };
    }
  }

  /**
   * Get bundle status
   */
  async getBundleStatus(bundleHash: string): Promise<{
    status: string;
    blockNumber?: number;
    error?: string;
  }> {
    try {
      const response = await this.client.get(`/getBundleStatus/${bundleHash}`);
      return response.data;
    } catch (error: any) {
      return {
        status: 'UNKNOWN',
        error: error.message
      };
    }
  }

  /**
   * Wait for bundle inclusion
   */
  async waitForInclusion(
    bundleHash: string,
    maxAttempts: number = 10,
    intervalMs: number = 5000
  ): Promise<SubmitResult> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getBundleStatus(bundleHash);
      
      if (status.status === 'INCLUDED') {
        return {
          success: true,
          bundleHash,
          blockNumber: status.blockNumber
        };
      } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        return {
          success: false,
          error: `Bundle ${status.status.toLowerCase()}`
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return {
      success: false,
      error: 'Timeout waiting for inclusion'
    };
  }

  /**
   * Simulate bundle on relay (if supported)
   */
  async simulateBundle(bundle: Bundle): Promise<{
    success: boolean;
    gasUsed?: number;
    profit?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.post('/simulateBundle', {
        txs: bundle.txs,
        targetBlock: bundle.targetBlock
      });

      return {
        success: true,
        gasUsed: response.data.gasUsed,
        profit: response.data.profit
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Simulation failed'
      };
    }
  }
}

/**
 * Create submitter for different networks
 */
export function createSubmitter(network: 'pulsechain' | 'ethereum' | 'custom', customUrl?: string): BundleSubmitter {
  const urls: Record<string, string> = {
    pulsechain: process.env.PULSECHAIN_RELAY_URL || 'https://relay.pulsechain.example',
    ethereum: 'https://relay.flashbots.net',
    custom: customUrl || ''
  };

  return new BundleSubmitter({
    url: urls[network] || urls.pulsechain,
    authKey: process.env.RELAY_AUTH_KEY,
    network
  });
}

export default BundleSubmitter;
