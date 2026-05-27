// HL "user-signed action" signing (vs L1 action).
//
// User-signed actions are approveBuilderFee, approveAgent, usdSend,
// spotSend, withdraw3, usdClassTransfer, tokenDelegate, ... — they don't
// use the phantom 1337 chain or msgpack actionHash. Instead the wallet
// signs an EIP-712 typed-data message whose:
//   - domain.chainId = wallet's active chain id (any L1 EVM chain ok)
//   - primaryType   = "HyperliquidTransaction:<ActionName>"
//   - types         = per-action explicit field list
//   - message       = action fields (matching the action body byte-for-byte)
//
// The action body sent to /exchange must also include the helper fields
// `hyperliquidChain` ("Mainnet"|"Testnet") and `signatureChainId` ("0x...").
//
// Parity: Python SDK utils/signing.py — sign_approve_builder_fee,
// sign_user_signed_action.

import { signTypedData, getActiveChainId } from '@/lib/wallet/metamask';
import type { Network } from '@/lib/network';

export interface SignatureRSV {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

function splitSignature(sig: string): SignatureRSV {
  if (!sig.startsWith('0x') || sig.length !== 132) {
    throw new Error(`bad signature hex length: ${sig.length}`);
  }
  const r = ('0x' + sig.slice(2, 66)) as `0x${string}`;
  const s = ('0x' + sig.slice(66, 130)) as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);
  return { r, s, v };
}

const EIP712_DOMAIN_TYPES = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const;

const APPROVE_BUILDER_FEE_TYPES = [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'maxFeeRate', type: 'string' },
  { name: 'builder', type: 'address' },
  { name: 'nonce', type: 'uint64' },
] as const;

const PRIMARY_TYPE_APPROVE_BUILDER_FEE = 'HyperliquidTransaction:ApproveBuilderFee';

export interface ApproveBuilderFeeAction {
  type: 'approveBuilderFee';
  hyperliquidChain: 'Mainnet' | 'Testnet';
  signatureChainId: `0x${string}`;
  maxFeeRate: string;
  builder: `0x${string}`;
  nonce: number;
}

/** Sign an approveBuilderFee action with the user's main wallet (user-signed
 *  spec). Returns the full action body (with hyperliquidChain + signatureChainId
 *  already baked in) and the signature, ready to POST as
 *    { action, nonce: action.nonce, signature, vaultAddress: null }. */
export async function signApproveBuilderFee(args: {
  address: `0x${string}`;
  network: Network;
  maxFeeRate: string;
  builder: `0x${string}`;
}): Promise<{ action: ApproveBuilderFeeAction; signature: SignatureRSV; nonce: bigint }> {
  const nonce = BigInt(Date.now());
  const hyperliquidChain = args.network === 'mainnet' ? 'Mainnet' : 'Testnet';

  // Wallet active chain. Any EVM chain works; we just put the *same* id in
  // both the domain and the action body so HF's recovery + checks line up.
  const chainId = await getActiveChainId();
  const signatureChainId = ('0x' + chainId.toString(16)) as `0x${string}`;

  // EIP-712 typed-data — caller signs this via MetaMask. The action body sent
  // to /exchange is a superset (adds `type`) of `message`.
  const typedData = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPES,
      [PRIMARY_TYPE_APPROVE_BUILDER_FEE]: APPROVE_BUILDER_FEE_TYPES,
    },
    primaryType: PRIMARY_TYPE_APPROVE_BUILDER_FEE,
    message: {
      hyperliquidChain,
      maxFeeRate: args.maxFeeRate,
      builder: args.builder,
      nonce: Number(nonce),
    },
  };

  const sigHex = await signTypedData(args.address, typedData);
  const signature = splitSignature(sigHex);

  const action: ApproveBuilderFeeAction = {
    type: 'approveBuilderFee',
    hyperliquidChain,
    signatureChainId,
    maxFeeRate: args.maxFeeRate,
    builder: args.builder,
    nonce: Number(nonce),
  };

  return { action, signature, nonce };
}

// ---- approveAgent (Phase J.7) -------------------------------------------

const APPROVE_AGENT_TYPES = [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'agentAddress', type: 'address' },
  { name: 'agentName', type: 'string' },
  { name: 'nonce', type: 'uint64' },
] as const;

const PRIMARY_TYPE_APPROVE_AGENT = 'HyperliquidTransaction:ApproveAgent';

export interface ApproveAgentAction {
  type: 'approveAgent';
  hyperliquidChain: 'Mainnet' | 'Testnet';
  signatureChainId: `0x${string}`;
  agentAddress: `0x${string}`;
  agentName: string;
  nonce: number;
}

/** Sign an approveAgent action with the user's main wallet. After HF accepts
 *  this, the agent privkey can sign all subsequent L1 actions on its own. */
export async function signApproveAgent(args: {
  address: `0x${string}`;
  network: Network;
  agentAddress: `0x${string}`;
  agentName: string;
}): Promise<{ action: ApproveAgentAction; signature: SignatureRSV; nonce: bigint }> {
  const nonce = BigInt(Date.now());
  const hyperliquidChain = args.network === 'mainnet' ? 'Mainnet' : 'Testnet';

  const chainId = await getActiveChainId();
  const signatureChainId = ('0x' + chainId.toString(16)) as `0x${string}`;

  const typedData = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPES,
      [PRIMARY_TYPE_APPROVE_AGENT]: APPROVE_AGENT_TYPES,
    },
    primaryType: PRIMARY_TYPE_APPROVE_AGENT,
    message: {
      hyperliquidChain,
      agentAddress: args.agentAddress,
      agentName: args.agentName,
      nonce: Number(nonce),
    },
  };

  const sigHex = await signTypedData(args.address, typedData);
  const signature = splitSignature(sigHex);

  const action: ApproveAgentAction = {
    type: 'approveAgent',
    hyperliquidChain,
    signatureChainId,
    agentAddress: args.agentAddress,
    agentName: args.agentName,
    nonce: Number(nonce),
  };

  return { action, signature, nonce };
}
