// Minimal EIP-1193 wallet bridge — MetaMask first, any compatible provider OK.
//
// Phase J.1 uses this for session sign-in (EIP-712 typed data, wallet's
// active chainId — we do NOT force 1337 here because sign-in is a plain
// off-chain identity proof, not an HL L1 action). The 1337 phantom chain
// gymnastics live in hl-vote-web's signer.

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

export function hasMetaMask(): boolean {
  return getProvider()?.isMetaMask === true;
}

export function hasAnyWallet(): boolean {
  return getProvider() !== null;
}

export class WalletNotFoundError extends Error {
  constructor() {
    super('No EIP-1193 wallet detected. Install MetaMask or a compatible wallet.');
  }
}
export class WalletRejectedError extends Error {}

/** Request the user's address. Returns lowercased 0x.... */
export async function connectWallet(): Promise<`0x${string}`> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();
  try {
    const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
    const a = accounts[0];
    if (typeof a !== 'string' || !a.startsWith('0x')) {
      throw new Error('No account returned.');
    }
    return a.toLowerCase() as `0x${string}`;
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new WalletRejectedError('User rejected wallet connect.');
    throw e;
  }
}

/** Wallet's active chain id as a decimal number. */
export async function getActiveChainId(): Promise<number> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();
  const hex = (await p.request({ method: 'eth_chainId' })) as string;
  return parseInt(hex, 16);
}

/** EIP-712 v4 signature over the typed data JSON. The wallet's active chain
 *  is used as `domain.chainId` — caller is responsible for making sure
 *  `typedData.domain.chainId` matches. */
export async function signTypedData(
  account: `0x${string}`,
  typedData: unknown,
): Promise<`0x${string}`> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();
  try {
    const sig = (await p.request({
      method: 'eth_signTypedData_v4',
      params: [account, JSON.stringify(typedData)],
    })) as string;
    if (!sig.startsWith('0x') || sig.length !== 132) {
      throw new Error(`bad signature hex length: ${sig.length}`);
    }
    return sig as `0x${string}`;
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new WalletRejectedError('User rejected the signature.');
    throw e;
  }
}

/** Subscribe to account / chain changes — caller passes one handler and gets
 *  an unsubscribe back. Returns a no-op when no provider is present. */
export function onWalletChange(
  onAccountsChanged: (accounts: string[]) => void,
  onChainChanged: (hex: string) => void,
): () => void {
  const p = getProvider();
  if (!p || !p.on || !p.removeListener) return () => undefined;
  const accH = (...a: unknown[]): void => onAccountsChanged(a[0] as string[]);
  const chainH = (...a: unknown[]): void => onChainChanged(a[0] as string);
  p.on('accountsChanged', accH);
  p.on('chainChanged', chainH);
  return () => {
    p.removeListener?.('accountsChanged', accH);
    p.removeListener?.('chainChanged', chainH);
  };
}
