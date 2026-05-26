// Same algorithm as apps/frontend/lib/governance/govId.ts so a given action
// produces the same hash on both sides (necessary for url + db cross-ref).

import { sha256 } from '@noble/hashes/sha2';

const TE = new TextEncoder();

export function computeGovId(action: { type: string; [k: string]: unknown }): `0x${string}` {
  const canonical = JSON.stringify(action);
  const digest = sha256(TE.encode(canonical));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}
