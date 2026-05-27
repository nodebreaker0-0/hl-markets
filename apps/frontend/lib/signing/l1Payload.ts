// l1_payload — Python parity: signing.py L192~214.
//
// The domain constants below are sacred — see contracts/signing.md §5.2 and
// delegation_matrix.md §2 (📛 forbidden to change without HF docs change).

import type { L1TypedData, PhantomAgent } from './types';

export function l1Payload(pa: PhantomAgent): L1TypedData {
  return {
    domain: {
      chainId: 1337,
      name: 'Exchange',
      verifyingContract: '0x0000000000000000000000000000000000000000',
      version: '1',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
    },
    primaryType: 'Agent',
    message: pa,
  };
}
