import { describe, it, expect } from 'vitest';
import { computeGovId } from './govId';

describe('computeGovId', () => {
  it('returns a stable 0x + 64 hex string', () => {
    const id = computeGovId({ type: 'validatorL1Vote', D: 'BTC' });
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic across calls', () => {
    const a = { type: 'validatorL1Vote', D: 'BTC' };
    expect(computeGovId(a)).toBe(computeGovId(a));
  });

  it('changes when inner content changes', () => {
    expect(
      computeGovId({ type: 'validatorL1Vote', D: 'BTC' }),
    ).not.toBe(computeGovId({ type: 'validatorL1Vote', D: 'ETH' }));
  });

  it('is sensitive to insertion order (JSON.stringify preserves it)', () => {
    const a = { type: 'validatorL1Vote', D: 'x' };
    const b = { D: 'x', type: 'validatorL1Vote' } as { type: string; [k: string]: unknown };
    expect(computeGovId(a)).not.toBe(computeGovId(b));
  });
});
