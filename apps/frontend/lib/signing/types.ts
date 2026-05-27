// Types for the Hyperliquid L1 signing flow.
// See contracts/signing.md for the byte-exact spec these types enforce.

export type Hex = `0x${string}`;
export type Network = 'testnet' | 'mainnet';

/** A `validatorL1Vote` action object as posted by validator-publisher.
 *  Inner shape varies (`O` for outcome, `D` for delisting, future variants). */
export interface ValidatorL1VoteAction {
  type: 'validatorL1Vote';
  // Plus arbitrary inner keys — preserved verbatim.
  [k: string]: unknown;
}

export interface PhantomAgent {
  source: 'a' | 'b';
  connectionId: Hex; // 32B
}

export interface L1TypedData {
  domain: {
    chainId: 1337;
    name: 'Exchange';
    verifyingContract: '0x0000000000000000000000000000000000000000';
    version: '1';
  };
  types: {
    Agent: readonly [
      { readonly name: 'source'; readonly type: 'string' },
      { readonly name: 'connectionId'; readonly type: 'bytes32' },
    ];
    EIP712Domain: readonly [
      { readonly name: 'name'; readonly type: 'string' },
      { readonly name: 'version'; readonly type: 'string' },
      { readonly name: 'chainId'; readonly type: 'uint256' },
      { readonly name: 'verifyingContract'; readonly type: 'address' },
    ];
  };
  primaryType: 'Agent';
  message: PhantomAgent;
}

export interface SignatureRSV {
  r: Hex;
  s: Hex;
  v: number;
}

export interface ExchangePayload {
  action: object;
  nonce: number;
  signature: SignatureRSV;
  vaultAddress: null;
  expiresAfter: null;
}
