// EIP-712 hashes computed locally so the Ledger flow can show the same
// `domain_hash` / `message_hash` the device displays (Constitution VII).
//
// Algorithm (EIP-712):
//   typeHash(EIP712Domain)  = keccak("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
//   typeHash(Agent)         = keccak("Agent(string source,bytes32 connectionId)")
//   domainHash              = keccak(typeHash(EIP712Domain) || encodeData(domain))
//   messageHash             = keccak(typeHash(Agent) || encodeData(message))
//   signingHash             = keccak(0x1901 || domainHash || messageHash)
//
// We deliberately do not call viem.hashTypedData here — the inputs are fixed,
// known, and small. Inline encoding keeps `lib/signing/` framework-free so the
// golden suite imports it from plain Node.

import { keccak_256 } from '@noble/hashes/sha3';
import { fromHex, toHex } from './serialize';
import type { Hex, L1TypedData } from './types';

const TE = new TextEncoder();

function keccakHex(data: Uint8Array): Hex {
  return toHex(keccak_256(data));
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

// EIP-712 encodes `string` as keccak256(utf8(string)) (32B).
function encStr(s: string): Uint8Array {
  return keccak_256(TE.encode(s));
}

// EIP-712 encodes `uint256` as 32B big-endian.
function encU256(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('uint256 negative');
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

// EIP-712 encodes `address` as 32B left-zero-padded.
function encAddr(addr: Hex): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error('bad address');
  const raw = fromHex(addr);
  const out = new Uint8Array(32);
  out.set(raw, 12);
  return out;
}

// EIP-712 `bytes32` — used as-is (already 32B).
function encBytes32(hex: Hex): Uint8Array {
  const raw = fromHex(hex);
  if (raw.length !== 32) throw new Error('bytes32 expected 32B');
  return raw;
}

// Pre-computed type hashes.
const DOMAIN_TYPE_STRING =
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
const AGENT_TYPE_STRING = 'Agent(string source,bytes32 connectionId)';

const DOMAIN_TYPE_HASH = keccak_256(TE.encode(DOMAIN_TYPE_STRING));
const AGENT_TYPE_HASH = keccak_256(TE.encode(AGENT_TYPE_STRING));

export interface TypedDataHashes {
  domainHash: Hex;
  messageHash: Hex;
  signingHash: Hex;
}

export function typedDataHashes(typed: L1TypedData): TypedDataHashes {
  const domain = typed.domain;
  const domainEnc = concat([
    DOMAIN_TYPE_HASH,
    encStr(domain.name),
    encStr(domain.version),
    encU256(BigInt(domain.chainId)),
    encAddr(domain.verifyingContract),
  ]);
  const domainHash = keccakHex(domainEnc);

  const message = typed.message;
  const messageEnc = concat([
    AGENT_TYPE_HASH,
    encStr(message.source),
    encBytes32(message.connectionId),
  ]);
  const messageHash = keccakHex(messageEnc);

  const signing = concat([new Uint8Array([0x19, 0x01]), fromHex(domainHash), fromHex(messageHash)]);
  const signingHash = keccakHex(signing);

  return { domainHash, messageHash, signingHash };
}
