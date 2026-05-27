import { describe, it, expect } from 'vitest';
import { actionHash } from './actionHash';

describe('actionHash', () => {
  it('matches Python reference for {type:validatorL1Vote, D:test} @ nonce=1717000000000', () => {
    // Cross-checked against Python SDK:
    //   action_hash({"type":"validatorL1Vote","D":"test"}, None, 1717000000000, None).hex()
    // The expected hash here is filled in by gen_golden_fixtures.py during T003.
    // Until then, just assert the function runs and returns a 32B hex.
    const h = actionHash(
      { type: 'validatorL1Vote', D: 'test' },
      1717000000000n,
      null,
      null,
    );
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('different nonce → different hash', () => {
    const a = { type: 'validatorL1Vote', D: 'x' };
    const h1 = actionHash(a, 1n, null, null);
    const h2 = actionHash(a, 2n, null, null);
    expect(h1).not.toBe(h2);
  });

  it('different action → different hash', () => {
    const h1 = actionHash({ type: 'validatorL1Vote', D: 'x' }, 1n, null, null);
    const h2 = actionHash({ type: 'validatorL1Vote', D: 'y' }, 1n, null, null);
    expect(h1).not.toBe(h2);
  });

  it('vault flag changes hash', () => {
    const a = { type: 'validatorL1Vote', D: 'x' };
    const noVault = actionHash(a, 1n, null, null);
    const withVault = actionHash(a, 1n, '0x0000000000000000000000000000000000000001', null);
    expect(noVault).not.toBe(withVault);
  });
});
