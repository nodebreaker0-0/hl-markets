// POST /exchange — the only legitimate fetch caller (eslint exception is granted
// only to this file). HF endpoint allow-list is hardcoded — Constitution III/IV.

import type { ExchangePayload, Network, SignatureRSV, ValidatorL1VoteAction } from './types';

const MAINNET_URL = 'https://api.hyperliquid.xyz/exchange';
const TESTNET_URL = 'https://api.hyperliquid-testnet.xyz/exchange';

export interface SubmitArgs {
  network: Network;
  action: ValidatorL1VoteAction;
  nonce: bigint;
  signature: SignatureRSV;
}

export class SubmitNetworkError extends Error {}
export class SubmitHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`HF /exchange responded ${status}`);
  }
}

export async function submitExchange(args: SubmitArgs): Promise<unknown> {
  if (args.network === 'mainnet' && process.env.NEXT_PUBLIC_MAINNET_ENABLED !== 'true') {
    // Defense in depth — UI already disables this, but trip again here.
    throw new Error('mainnet not enabled in this build');
  }
  const url = args.network === 'mainnet' ? MAINNET_URL : TESTNET_URL;

  const body: ExchangePayload = {
    action: args.action,
    nonce: Number(args.nonce),
    signature: args.signature,
    vaultAddress: null,
    expiresAfter: null,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new SubmitNetworkError((e as Error).message);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new SubmitHttpError(res.status, text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
