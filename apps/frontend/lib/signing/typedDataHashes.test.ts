import { describe, it, expect } from 'vitest';
import { l1Payload } from './l1Payload';
import { phantomAgent } from './phantomAgent';
import { typedDataHashes } from './typedDataHashes';
import type { Hex } from './types';

describe('typedDataHashes', () => {
  it('produces three distinct 32B hex hashes', () => {
    const digest: Hex =
      '0x0000000000000000000000000000000000000000000000000000000000000001';
    const pa = phantomAgent(digest, false);
    const typed = l1Payload(pa);
    const h = typedDataHashes(typed);
    for (const v of [h.domainHash, h.messageHash, h.signingHash]) {
      expect(v).toMatch(/^0x[0-9a-f]{64}$/);
    }
    expect(h.domainHash).not.toBe(h.messageHash);
    expect(h.messageHash).not.toBe(h.signingHash);
  });

  it('domain hash is constant (depends only on fixed domain)', () => {
    const t1 = typedDataHashes(
      l1Payload(phantomAgent('0x' + '00'.repeat(32) as Hex, false)),
    );
    const t2 = typedDataHashes(
      l1Payload(phantomAgent('0x' + 'ff'.repeat(32) as Hex, true)),
    );
    expect(t1.domainHash).toBe(t2.domainHash);
  });

  it('mainnet vs testnet source flips message hash but not domain hash', () => {
    const digest: Hex = ('0x' + '12'.repeat(32)) as Hex;
    const main = typedDataHashes(l1Payload(phantomAgent(digest, true)));
    const test = typedDataHashes(l1Payload(phantomAgent(digest, false)));
    expect(main.domainHash).toBe(test.domainHash);
    expect(main.messageHash).not.toBe(test.messageHash);
    expect(main.signingHash).not.toBe(test.signingHash);
  });
});
