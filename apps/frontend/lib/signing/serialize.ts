// Ordered msgpack serialization — Constitution II.
//
// Python `msgpack.packb(action)` walks dict items in insertion order.
// JavaScript objects preserve insertion order for string (non-integer) keys per
// the ES spec, so we just have to make absolutely sure no library sorts them.
//
// We use @msgpack/msgpack's Encoder with sortKeys disabled and `forceFloat32 = false`.
// Numbers must serialize identical to Python's: ints as ints, floats as float64.
//
// If any caller in this codebase ever sorts keys before passing the action in,
// the verify gate's golden fixtures will detect it — that is the safety net.

import { Encoder } from '@msgpack/msgpack';

const encoder = new Encoder({
  sortKeys: false,
  forceFloat32: false,
  forceIntegerToFloat: false,
  useBigInt64: false,
  ignoreUndefined: false, // (msgpack@3 still encodes as nil — guarded below)
});

// Constitution II: refuse to sign actions with `undefined` anywhere. Operator
// intent is ambiguous (omitted? null? typo?) and silently encoding as nil could
// produce a different msgpack byte string than the operator visually reviewed.
function assertNoUndefined(value: unknown, path = '$'): void {
  if (value === undefined) {
    throw new Error(`serialize: undefined at ${path} — refusing to sign`);
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoUndefined(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertNoUndefined(v, `${path}.${k}`);
  }
}

export function serialize(action: object): Uint8Array {
  assertNoUndefined(action);
  return encoder.encode(action);
}

export function toHex(u8: Uint8Array): `0x${string}` {
  // Array.from's mapFn narrows the element to `number` — avoids the
  // noUncheckedIndexedAccess `number | undefined` headache without a non-null
  // assertion. ESLint @typescript-eslint/strict is satisfied.
  const hex = Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export function fromHex(hex: `0x${string}` | string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('odd hex length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.substr(i * 2, 2), 16);
  }
  return out;
}
