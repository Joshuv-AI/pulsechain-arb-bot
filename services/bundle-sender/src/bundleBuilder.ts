/**
 * Bundle Builder
 * Creates a bundle containing the flashloan transaction
 */

import { ethers, providers, BigNumber } from 'ethers';

export interface BundleTransaction {
  tx: providers.TransactionRequest;
  bundleTargetBlock: number;
}

export interface Bundle {
  txs: string[];  // Signed transactions
  targetBlock: number;
  replacementUuid?: string;
}

export interface BundleOptions {
  targetBlock: number | 'latest+1' | 'latest+2';
  maxBlockNumber?: number;
  revertingTxHashes?: string[];
}

/**
 * Build a bundle from transaction requests
 */
export function buildBundle(
  txs: providers.TransactionRequest[],
  options: BundleOptions = { targetBlock: 'latest+1' }
): Bundle {
  let targetBlock: number;
  
  if (options.targetBlock === 'latest+1') {
    targetBlock = 0; // Will be resolved at submit time
  } else if (options.targetBlock === 'latest+2') {
    targetBlock = 0;
  } else {
    targetBlock = options.targetBlock as number;
  }

  return {
    txs: [], // Will be filled after signing
    targetBlock,
    replacementUuid: generateUuid()
  };
}

/**
 * Add signed transaction to bundle
 */
export function addSignedTxToBundle(bundle: Bundle, signedTx: string): Bundle {
  return {
    ...bundle,
    txs: [...bundle.txs, signedTx]
  };
}

/**
 * Create bundle with single transaction
 */
export function createSingleTxBundle(
  signedTx: string,
  targetBlock: number
): Bundle {
  return {
    txs: [signedTx],
    targetBlock
  };
}

/**
 * Validate bundle structure
 */
export function validateBundle(bundle: Bundle): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!bundle.txs || bundle.txs.length === 0) {
    errors.push('Bundle must contain at least one transaction');
  }
  
  if (bundle.txs.some(tx => !tx.startsWith('0x'))) {
    errors.push('All transactions must be valid signed transactions');
  }
  
  if (bundle.targetBlock <= 0) {
    errors.push('Target block must be specified');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Estimate bundle gas limit
 */
export function estimateBundleGas(txs: providers.TransactionRequest[], provider: providers.JsonRpcProvider): Promise<BigNumber> {
  const gasPromises = txs.map(tx => 
    provider.estimateGas(tx).catch(() => BigNumber.from(300000)) // Default 300k
  );
  
  return Promise.all(gasPromises).then(gasLimits => 
    gasLimits.reduce((acc, gas) => acc.add(gas), BigNumber.from(0))
  );
}

/**
 * Generate UUID for bundle tracking
 */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default { buildBundle, addSignedTxToBundle, createSingleTxBundle, validateBundle };
