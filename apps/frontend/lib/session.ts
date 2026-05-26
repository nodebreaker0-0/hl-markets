// Phase J.1 sign-in flow + session state.
//
// signIn() chain:
//   1. GET /auth/nonce
//   2. wallet.connectWallet() → address
//   3. wallet.signTypedData(address, typedData)
//   4. POST /auth/sign-in { address, network, nonce, issuedAt, chainId, signature }
//   5. backend recovers + stores session, sets HttpOnly cookie
//   6. GET /auth/me to confirm + cache locally
//
// `getSession()` polls /auth/me on mount and caches the result. The session
// itself lives in the HttpOnly cookie — we just mirror its address + expiry
// in memory so the UI can render "signed in as 0x...".

import {
  connectWallet,
  getActiveChainId,
  signTypedData,
  WalletRejectedError,
  WalletNotFoundError,
} from '@/lib/wallet/metamask';
import { CURRENT_NETWORK, type Network } from '@/lib/network';

const API_BASE: string =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_API_BASE as string | undefined)) ||
  'http://localhost:3001';

export interface SessionInfo {
  address: `0x${string}`;
  network: Network;
  expiresAt: number;
}

async function getNonce(): Promise<{ nonce: string; expiresAt: number }> {
  const res = await fetch(`${API_BASE}/auth/nonce`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`/auth/nonce ${res.status}`);
  return (await res.json()) as { nonce: string; expiresAt: number };
}

function buildTypedData(args: {
  address: `0x${string}`;
  network: Network;
  nonce: string;
  issuedAt: number;
  chainId: number;
}): unknown {
  return {
    domain: {
      name: 'hl-markets',
      version: '1',
      chainId: args.chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    primaryType: 'SignIn',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      SignIn: [
        { name: 'address', type: 'address' },
        { name: 'network', type: 'string' },
        { name: 'nonce', type: 'string' },
        { name: 'issuedAt', type: 'uint64' },
      ],
    },
    message: {
      address: args.address,
      network: args.network,
      nonce: args.nonce,
      issuedAt: args.issuedAt,
    },
  };
}

export class SignInRejectedError extends Error {}
export class SignInFailedError extends Error {}

/** End-to-end sign-in. Throws on any step; caller renders an inline error. */
export async function signIn(): Promise<SessionInfo> {
  const network: Network = CURRENT_NETWORK;

  // 1. Wallet first (cheaper than reserving a nonce we might not use).
  let address: `0x${string}`;
  try {
    address = await connectWallet();
  } catch (e) {
    if (e instanceof WalletRejectedError) throw new SignInRejectedError(e.message);
    if (e instanceof WalletNotFoundError) throw new SignInFailedError(e.message);
    throw e;
  }
  const chainId = await getActiveChainId();

  // 2. Nonce.
  const { nonce } = await getNonce();
  const issuedAt = Date.now();

  // 3. Sign.
  const typedData = buildTypedData({ address, network, nonce, issuedAt, chainId });
  let signature: `0x${string}`;
  try {
    signature = await signTypedData(address, typedData);
  } catch (e) {
    if (e instanceof WalletRejectedError) throw new SignInRejectedError(e.message);
    throw e;
  }

  // 4. POST /auth/sign-in.
  const res = await fetch(`${API_BASE}/auth/sign-in`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, network, nonce, issuedAt, chainId, signature }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new SignInFailedError(`sign-in failed ${res.status}: ${text}`);
  }
  const out = (await res.json()) as { address: `0x${string}`; expiresAt: number };
  return { address: out.address, network, expiresAt: out.expiresAt };
}

export async function signOut(): Promise<void> {
  await fetch(`${API_BASE}/auth/sign-out`, {
    method: 'POST',
    credentials: 'include',
  });
}

/** Returns the active session if the cookie is still valid, null otherwise. */
export async function fetchSession(): Promise<SessionInfo | null> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/auth/me ${res.status}`);
  return (await res.json()) as SessionInfo;
}
