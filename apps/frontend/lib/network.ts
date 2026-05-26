// Build-time network selector.
//
// hl-markets is deployed twice in parallel:
//   - testnet site:  NEXT_PUBLIC_HL_NETWORK=testnet  npm run build
//   - mainnet site:  NEXT_PUBLIC_HL_NETWORK=mainnet  npm run build
//
// Set in apps/frontend/.env.local for dev. Anything other than "mainnet" is
// treated as testnet — keeps PR builds and local accidents on the safer side.

export type Network = 'testnet' | 'mainnet';

const raw = process.env.NEXT_PUBLIC_HL_NETWORK;

export const CURRENT_NETWORK: Network = raw === 'mainnet' ? 'mainnet' : 'testnet';

export function isProdNetwork(): boolean {
  return CURRENT_NETWORK === 'mainnet';
}
