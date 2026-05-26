import { describe, it, expect } from 'vitest';
import { classify } from './classify';

describe('classify', () => {
  it('outcome by inner key O', () => {
    const r = classify({ type: 'validatorL1Vote', O: { foo: 1 } });
    expect(r.variant).toBe('outcome');
    expect(r.innerKey).toBe('O');
  });

  it('delisting by inner key D', () => {
    const r = classify({ type: 'validatorL1Vote', D: 'BTC' });
    expect(r.variant).toBe('delisting');
    expect(r.innerKey).toBe('D');
  });

  it('unknown for new inner key', () => {
    const r = classify({ type: 'validatorL1Vote', G: { foo: 1 } });
    expect(r.variant).toBe('unknown');
    expect(r.innerKey).toBe('G');
  });

  it('handles no inner key at all', () => {
    const r = classify({ type: 'validatorL1Vote' });
    expect(r.variant).toBe('unknown');
    expect(r.innerKey).toBeNull();
  });

  it('first non-type key is the inner key (insertion order)', () => {
    const r = classify({ type: 'validatorL1Vote', D: 'BTC', extra: 1 });
    expect(r.innerKey).toBe('D');
    expect(r.variant).toBe('delisting');
  });
});
