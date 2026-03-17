/**
 * Private Bundle Sender - Main Interface
 * Sends transactions privately to avoid front-running
 */

import { ethers, providers, Wallet, BigNumber } from 'ethers';
import { buildBundle, createSingleTxBundle, validateBundle, Bundle } from './bundleBuilder';
import { simulateBundle, estimateGas, SimulationResult } from './bundleSimulator';
import { BundleSubmitter, SubmitResult, createSubmitter } from './bundleSubmitter';

export interface SendPrivateBundleOptions {
  tx: providers.TransactionRequest;
  signer: Wallet;
  provider: providers.JsonRpcProvider;
  targetBlock?: number;
  simulate?: boolean;
  maxGasPrice?: BigNumber;
}

export interface PrivateBundleResult {
  success: boolean;
  txHash?: string;
  bundleHash?: string;
  blockNumber?: number;
  error?: string;
  simulation?: SimulationResult;
}

/**
 * Main function to send a private bundle
 */
export async function sendPrivateBundle(
  options: SendPrivateBundleOptions
): Promise<PrivateBundleResult> {
  const {
    tx,
    signer,
    provider,
    targetBlock = 0,
    simulate = true,
    maxGasPrice
  } = options;

  try {
    // 1. Set gas parameters
    const gasEstimate = await estimateGas(provider, tx);
    const gasLimit = gasEstimate.gasLimit.mul(120).div(100); // Add 20% buffer
    
    const populatedTx = await provider.getTransactionCount(signer.address, 'latest');
    
    const txRequest = {
      ...tx,
      gasLimit,
      gasPrice: maxGasPrice || (await provider.getGasPrice()),
      nonce: populatedTx,
      chainId: (await provider.getNetwork()).chainId
    };

    // 2. Simulate first (optional but recommended)
    if (simulate) {
      const simulation = await simulateBundle(provider, [txRequest]);
      
      if (!simulation.overallSuccess) {
        return {
          success: false,
          error: `Simulation failed: ${simulation.results[0].error}`,
          simulation: simulation.results[0]
        };
      }
    }

    // 3. Sign the transaction
    const signedTx = await signer.signTransaction(txRequest);

    // 4. Try Flashbots/relay first
    try {
      const submitter = createSubmitter('pulsechain');
      
      const bundle = createSingleTxBundle(signedTx, targetBlock);
      const validation = validateBundle(bundle);
      
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      // Try simulation on relay
      const relaySim = await submitter.simulateBundle(bundle);
      if (!relaySim.success) {
        console.log('Relay simulation failed, falling back to direct send');
        throw new Error('Relay simulation failed');
      }

      // Submit to relay
      const result = await submitter.submitBundle(bundle);
      
      if (result.success) {
        return {
          success: true,
          txHash: signedTx,
          bundleHash: result.bundleHash,
          blockNumber: result.blockNumber
        };
      }
    } catch (relayError) {
      console.log('Relay unavailable, sending directly:', relayError);
    }

    // 5. Fallback: Send directly (still private if using private RPC)
    const directTx = await provider.sendTransaction(signedTx);
    
    return {
      success: true,
      txHash: directTx.hash
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send bundle'
    };
  }
}

/**
 * Send multiple transactions as a bundle
 */
export async function sendBundle(
  txs: providers.TransactionRequest[],
  signer: Wallet,
  provider: providers.JsonRpcProvider,
  options: {
    targetBlock?: number;
    simulate?: boolean;
  } = {}
): Promise<PrivateBundleResult> {
  const signedTxs: string[] = [];

  try {
    // Sign all transactions
    let nonce = await provider.getTransactionCount(signer.address, 'latest');
    
    for (const tx of txs) {
      const gasEstimate = await estimateGas(provider, tx);
      
      const txRequest = {
        ...tx,
        gasLimit: gasEstimate.gasLimit.mul(120).div(100),
        gasPrice: await provider.getGasPrice(),
        nonce: nonce++,
        chainId: (await provider.getNetwork()).chainId
      };

      const signed = await signer.signTransaction(txRequest);
      signedTxs.push(signed);
    }

    // Simulate if requested
    if (options.simulate !== false) {
      const unsignedTxs = txs.map((tx, i) => ({
        ...tx,
        nonce: await provider.getTransactionCount(signer.address, 'latest') + i
      }));
      
      const simResult = await simulateBundle(provider, unsignedTxs);
      if (!simResult.overallSuccess) {
        return {
          success: false,
          error: `Bundle simulation failed: ${simResult.results[0].error}`
        };
      }
    }

    // Submit bundle
    const bundle: Bundle = {
      txs: signedTxs,
      targetBlock: options.targetBlock || 0
    };

    const submitter = createSubmitter('pulsechain');
    const result = await submitter.submitBundle(bundle);

    if (result.success) {
      return {
        success: true,
        bundleHash: result.bundleHash
      };
    }

    // Fallback to direct sends
    const sent: string[] = [];
    for (const signed of signedTxs) {
      const directTx = await provider.sendTransaction(signed);
      sent.push(directTx.hash);
    }

    return {
      success: true,
      txHash: sent[0]
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send bundle'
    };
  }
}

export default { sendPrivateBundle, sendBundle };
