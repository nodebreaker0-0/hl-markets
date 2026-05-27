// action_hash — Python parity: hyperliquid/utils/signing.py L174~185.
//
//   data = msgpack(action)
//        || nonce.to_bytes(8, 'big')
//        || (vault === null ? 0x00 : 0x01 || addressBytes(vault))
//        || (expires === null ? nothing : 0x00 || expires.to_bytes(8, 'big'))
//   return keccak256(data)

import { keccak_256 } from '@noble/hashes/sha3';
import { serialize, toHex } from './serialize';
import type { Hex } from './types';

function u64BE(n: bigint): Uint8Array {
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error('u64 out of range');
  const out = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function addressBytes(addr: Hex): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error('invalid 20B address');
  const hex = addr.slice(2);
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function actionHash(
  action: object,
  nonce: bigint,
  vaultAddress: Hex | null,
  expiresAfter: bigint | null,
): Hex {
  const parts: Uint8Array[] = [serialize(action), u64BE(nonce)];

  if (vaultAddress === null) {
    parts.push(new Uint8Array([0x00]));
  } else {
    parts.push(new Uint8Array([0x01]));
    parts.push(addressBytes(vaultAddress));
  }

  if (expiresAfter !== null) {
    parts.push(new Uint8Array([0x00]));
    parts.push(u64BE(expiresAfter));
  }

  const digest = keccak_256(concat(parts));
  return toHex(digest);
}
