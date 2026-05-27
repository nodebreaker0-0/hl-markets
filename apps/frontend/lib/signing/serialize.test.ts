import { describe, it, expect } from 'vitest';
import { serialize, toHex, fromHex } from './serialize';

describe('serialize (ordered msgpack)', () => {
  it('encodes a minimal validatorL1Vote delisting (matches Python msgpack.packb)', () => {
    const action = { type: 'validatorL1Vote', D: 'test' };
    const hex = toHex(serialize(action));
    // Bytes (verified against Python SDK in tests/golden/golden.test.ts row-001):
    //   82                    fixmap(2)
    //   a4 74 79 70 65        fixstr(4) "type"
    //   af 76616c696461746f724c31566f7465   fixstr(15) "validatorL1Vote"
    //   a1 44                 fixstr(1) "D"
    //   a4 74 65 73 74        fixstr(4) "test"
    expect(hex).toBe('0x82a474797065af76616c696461746f724c31566f7465a144a474657374');
  });

  it('preserves insertion order — type before D', () => {
    const a = { type: 'validatorL1Vote', D: 'foo' };
    const b = { D: 'foo', type: 'validatorL1Vote' };
    expect(toHex(serialize(a))).not.toBe(toHex(serialize(b)));
  });

  it('encodes nested objects', () => {
    const action = { type: 'validatorL1Vote', O: { inner: { k: 1 } } };
    expect(() => serialize(action)).not.toThrow();
  });

  it('round-trips hex helpers', () => {
    const u8 = new Uint8Array([0x82, 0xa4, 0x74, 0x79, 0x70, 0x65]);
    const hex = toHex(u8);
    expect(hex).toBe('0x82a474797065');
    expect(fromHex(hex)).toEqual(u8);
  });

  it('rejects undefined values', () => {
    const action = { type: 'validatorL1Vote', x: undefined } as unknown as object;
    expect(() => serialize(action)).toThrow();
  });
});
