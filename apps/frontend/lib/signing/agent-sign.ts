// Phase J.7 — sign L1 actions with the agent privkey instead of the user's
// main wallet. Same actionHash + phantomAgent + l1Payload (chainId 1337) as
// before; only the signer changes. No MetaMask popup, no chain switch.

import { privateKeyToAccount } from 'viem/accounts';
import { actionHash, phantomAgent, l1Payload } from '@/lib/signing';
import type { Network } from '@/lib/network';
import type { Hex } from 'viem';

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

/** Sign an HL L1 action (order, cancel, ...) using the agent's secp256k1
 *  private key. Output is byte-identical to the main-wallet path so the
 *  /trade-forward middleware and HF both see the same shape.
 *
 *  Note: viem's `signTypedData` produces a 65-byte signature with v in {27, 28}
 *  — matching eth_signTypedData_v4. We split into {r, s, v} the same way as
 *  `signL1Action` in trade.ts.
 */
export async function signL1ActionWithAgent(
  privKey: Hex,
  action: object,
  nonce: bigint,
  network: Network,
): Promise<SignatureRSV> {
  const account = privateKeyToAccount(privKey);

  const digest = actionHash(action, nonce, null, null);
  const pa = phantomAgent(digest, network === 'mainnet');
  const typed = l1Payload(pa);

  // viem's signTypedData requires a slightly different shape: domain, types
  // (without EIP712Domain entry), primaryType, message.
  // Our l1Payload returns the legacy shape (with EIP712Domain), so strip it
  // and feed the rest to viem.
  const { EIP712Domain: _domain, ...typesWithoutDomain } = typed.types;
  void _domain;

  const sigHex = await account.signTypedData({
    domain: typed.domain,
    types: typesWithoutDomain,
    primaryType: typed.primaryType as 'Agent',
    message: typed.message as { source: string; connectionId: Hex },
  });
  return splitSignature(sigHex);
}
