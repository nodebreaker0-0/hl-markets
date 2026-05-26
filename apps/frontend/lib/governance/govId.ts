// Stable governance id = sha256(canonical JSON of action) hex.
// HF doesn't give an id field, but we need one for URL routing + DB keys.
//
// We use JSON.stringify with insertion-order preserved keys, NOT msgpack —
// the frontend doesn't ship msgpack, and we just need a stable hash, not
// compatibility with HF signing. The id never enters any signed payload.
//
// Backend (apps/api) uses the same algorithm for the same hex result.

import { sha256 } from '@noble/hashes/sha2';

const TE = new TextEncoder();

export function computeGovId(action: { type: string; [k: string]: unknown }): `0x${string}` {
  const canonical = JSON.stringify(action);
  const digest = sha256(TE.encode(canonical));
  // Array.from's mapFn narrows the byte to `number` — avoids the
  // noUncheckedIndexedAccess + non-null-assertion dance (hl-vote-web pattern).
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}
