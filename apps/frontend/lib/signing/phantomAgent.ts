// construct_phantom_agent — Python parity: signing.py L188~189.

import type { Hex, PhantomAgent } from './types';

export function phantomAgent(actionDigest: Hex, isMainnet: boolean): PhantomAgent {
  return {
    source: isMainnet ? 'a' : 'b',
    connectionId: actionDigest,
  };
}
